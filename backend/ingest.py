"""
Ingestion pipeline for the research knowledge base.

Parses markdown files from the configured knowledge-base directory into the
SQLite database. 8 stages: cards, atoms, triage, field maps, ideas, digests,
existing DB merge, and FTS5 index.
"""
from __future__ import annotations

import json
import os
import re
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from config import EXISTING_AGENT_DB_CANDIDATES, KNOWLEDGE_BASE_DIR
from database import ensure_default_library, get_connection, get_db_path, init_db

KB_PATH = KNOWLEDGE_BASE_DIR


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _read_file(path: Path) -> str:
    """Read a file, returning empty string on failure."""
    try:
        return path.read_text(encoding="utf-8")
    except Exception:
        return ""


def _split_sections(text: str) -> list[tuple[str, str]]:
    """Split markdown into (heading, body) pairs at ## level."""
    parts = re.split(r"^## ", text, flags=re.MULTILINE)
    result = []
    for part in parts[1:]:  # skip preamble before first ##
        lines = part.split("\n", 1)
        heading = lines[0].strip()
        body = lines[1].strip() if len(lines) > 1 else ""
        result.append((heading, body))
    return result


def _current_library_id() -> int:
    raw = os.environ.get("KB_LIBRARY_ID", "").strip()
    if raw.isdigit():
        parsed = int(raw)
        if parsed > 0:
            return parsed
    return ensure_default_library()


# ---------------------------------------------------------------------------
# Stage 1: Parse paper cards
# ---------------------------------------------------------------------------

def _parse_meta(body: str) -> dict:
    """Parse the Meta section of a paper card."""
    meta = {}
    for line in body.splitlines():
        line = line.strip()
        if line.startswith("- Authors:"):
            raw = line.split(":", 1)[1].strip()
            meta["authors"] = json.dumps([a.strip() for a in raw.split(",")])
        elif line.startswith("- Year:"):
            raw = line.split(":", 1)[1].strip()
            # Handle things like "2023 (Revised February 2026)"
            year_match = re.match(r"(\d{4})", raw)
            meta["year"] = int(year_match.group(1)) if year_match else None
        elif line.startswith("- Fields:"):
            raw = line.split(":", 1)[1].strip()
            meta["fields"] = json.dumps([f.strip() for f in raw.split(",")])
        elif line.startswith("- JEL:"):
            raw = line.split(":", 1)[1].strip()
            meta["jel"] = json.dumps([j.strip() for j in raw.split(",")])
    return meta


def _parse_scores(body: str) -> tuple[list[tuple[str, int]], float | None]:
    """Parse the Scores section, returning (dimension, score) pairs and average.

    Handles two formats:
    Format A (inline): innovation: 3/5 | theory: 2/5 | empirical_rigor: 4/5
    Format B (bulleted): - literature_innovation: 4/5 [comment]
    """
    scores = []
    average = None
    for line in body.splitlines():
        line = line.strip()
        # Format B: Match lines like "- literature_innovation: 5/5 [comment]"
        m = re.match(r"-\s+(\w+):\s+(\d+)(?:/5)?", line)
        if m:
            scores.append((m.group(1), int(m.group(2))))
            continue
        # Format A: Match pipe-delimited "innovation: 3/5 | theory: 2/5 | ..."
        if "|" in line and ":" in line:
            for part in line.split("|"):
                pm = re.match(r"\s*(\w+):\s*(\d+)(?:/5)?\s*", part.strip())
                if pm:
                    scores.append((pm.group(1), int(pm.group(2))))
        # Match "**Average: 4.2/5**" or "**Average: 4.1/5**"
        avg_m = re.search(r"\*\*Average:\s*([\d.]+)/5\*\*", line)
        if avg_m:
            average = float(avg_m.group(1))
    return scores, average


def _should_store_card_section(heading: str, body: str) -> bool:
    """Store dynamic reader sections while excluding metadata and score blocks."""
    if not body.strip():
        return False
    normalized = heading.strip().lower()
    if normalized == "meta":
        return False
    if normalized.startswith("scores"):
        return False
    return True


def _purge_deleted_cards(conn: sqlite3.Connection, cards_dir: Path) -> int:
    """Remove DB rows for card-derived papers whose source file was deleted.

    Direct `python ingest.py` re-runs (outside the app's purge path) otherwise
    leave stale rows for cards whose cards/<paper_id>.md file has been removed.

    This cleanup is intentionally conservative and tightly scoped:
      * Only the ACTIVE library's linked papers are considered.
      * Only papers with has_card = 1 (i.e. previously ingested FROM a card)
        are eligible — triage-only / externally-merged papers (has_card = 0)
        are never touched, so no valid metadata is removed.
      * A paper is deleted only when its cards/<paper_id>.md file is genuinely
        absent from disk.
    Mirrors the paper-derived targets of purge_library_index_data() (papers,
    card_sections, paper_scores), scoped to the truly-stale-on-disk papers.
    """
    library_id = _current_library_id()
    linked = conn.execute(
        """
        SELECT lp.paper_id
        FROM library_papers lp
        JOIN papers p ON p.paper_id = lp.paper_id
        WHERE lp.library_id = ? AND p.has_card = 1
        """,
        (library_id,),
    ).fetchall()

    stale = [
        row["paper_id"]
        for row in linked
        if not (cards_dir / f"{row['paper_id']}.md").exists()
    ]
    if not stale:
        return 0

    for paper_id in stale:
        conn.execute("DELETE FROM card_sections WHERE paper_id = ?", (paper_id,))
        conn.execute("DELETE FROM paper_scores WHERE paper_id = ?", (paper_id,))
        conn.execute("DELETE FROM papers WHERE paper_id = ?", (paper_id,))

    conn.commit()
    return len(stale)


def stage1_parse_cards(conn: sqlite3.Connection) -> int:
    """Parse paper cards from cards/*.md into papers, paper_scores, card_sections."""
    cards_dir = KB_PATH / "cards"
    if not cards_dir.exists():
        print("  Warning: cards/ directory not found")
        return 0

    # Drop stale rows for cards deleted on disk before re-parsing (idempotency
    # for direct `python ingest.py` re-runs). Guarded on cards_dir.exists()
    # above so we never purge on a misconfigured/missing directory.
    removed = _purge_deleted_cards(conn, cards_dir)
    if removed:
        print(f"  Removed {removed} stale paper card(s) deleted on disk")

    files = sorted(cards_dir.glob("w*.md"))
    count = 0

    for fp in files:
        text = _read_file(fp)
        if not text:
            continue

        paper_id = fp.stem  # e.g. "w31161"

        # Title from first heading: "# w31161: Generative AI at Work"
        title_match = re.match(r"#\s+\w+:\s*(.+)", text)
        title = title_match.group(1).strip() if title_match else fp.stem

        sections = _split_sections(text)
        section_map = {h: b for h, b in sections}

        # Meta
        meta = _parse_meta(section_map.get("Meta", ""))

        # Scores
        scores_heading = None
        for h in section_map:
            if h.startswith("Scores"):
                scores_heading = h
                break
        score_pairs, average = _parse_scores(section_map.get(scores_heading, "")) if scores_heading else ([], None)

        # Insert into papers
        conn.execute(
            """INSERT OR REPLACE INTO papers
               (paper_id, title, authors, year, fields, jel, average_score, has_card)
               VALUES (?, ?, ?, ?, ?, ?, ?, 1)""",
            (
                paper_id,
                title,
                meta.get("authors"),
                meta.get("year"),
                meta.get("fields"),
                meta.get("jel"),
                average,
            ),
        )

        # Re-reading a paper should replace stale structured sections/scores
        # from previous templates instead of accumulating them.
        conn.execute("DELETE FROM paper_scores WHERE paper_id = ?", (paper_id,))
        conn.execute("DELETE FROM card_sections WHERE paper_id = ?", (paper_id,))

        # Insert scores
        for dim, score in score_pairs:
            conn.execute(
                "INSERT OR REPLACE INTO paper_scores (paper_id, dimension, score) VALUES (?, ?, ?)",
                (paper_id, dim, score),
            )

        # Insert card sections
        for heading, body in sections:
            if _should_store_card_section(heading, body):
                conn.execute(
                    "INSERT OR REPLACE INTO card_sections (paper_id, section, content) VALUES (?, ?, ?)",
                    (paper_id, heading, body),
                )

        count += 1

    conn.commit()
    return count


# ---------------------------------------------------------------------------
# Stage 2: Parse atoms
# ---------------------------------------------------------------------------

ATOM_TYPES = {
    "mechanisms": "mechanism",
    "methods": "method",
    "datasets": "dataset",
    "puzzles": "puzzle",
}


def stage2_parse_atoms(conn: sqlite3.Connection) -> int:
    """Parse atom files from atoms/*/*.md into atoms and atom_paper_refs."""
    atoms_dir = KB_PATH / "atoms"
    if not atoms_dir.exists():
        print("  Warning: atoms/ directory not found")
        return 0

    count = 0

    for subdir, atom_type in ATOM_TYPES.items():
        type_dir = atoms_dir / subdir
        if not type_dir.exists():
            continue

        for fp in sorted(type_dir.glob("*.md")):
            text = _read_file(fp)
            if not text:
                continue

            slug = fp.stem
            # Title from heading
            title_match = re.match(r"#\s+(.+)", text)
            title = title_match.group(1).strip() if title_match else slug

            sections = _split_sections(text)
            section_map = {h: b for h, b in sections}

            description = section_map.get("Description", "").strip()
            evidence_strength = section_map.get("Evidence Strength", "").strip() or None
            when_to_use = section_map.get("When to Use", "").strip() or None
            access = section_map.get("Access", "").strip() or None
            url = section_map.get("URL", "").strip() or None
            key_references = section_map.get("Key References", "").strip() or None

            conn.execute(
                """INSERT OR REPLACE INTO atoms
                   (slug, type, title, description, evidence_strength,
                    when_to_use, access, url, key_references)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (slug, atom_type, title, description, evidence_strength,
                 when_to_use, access, url, key_references),
            )

            # Parse paper references from Papers section
            papers_body = section_map.get("Papers", "")
            for m in re.finditer(r"(w\d{4,6})", papers_body):
                conn.execute(
                    "INSERT OR IGNORE INTO atom_paper_refs (atom_slug, paper_id) VALUES (?, ?)",
                    (slug, m.group(1)),
                )

            count += 1

    conn.commit()
    return count


# ---------------------------------------------------------------------------
# Stage 3: Parse triage
# ---------------------------------------------------------------------------

def stage3_parse_triage(conn: sqlite3.Connection) -> int:
    """Parse triage_cards.jsonl into triage_cards table."""
    triage_path = KB_PATH / "triage" / "triage_cards.jsonl"
    if not triage_path.exists():
        print("  Warning: triage_cards.jsonl not found")
        return 0

    count = 0
    for line in triage_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            rec = json.loads(line)
        except json.JSONDecodeError:
            continue

        conn.execute(
            """INSERT OR REPLACE INTO triage_cards
               (paper_id, title, authors, fields, methods, relevance,
                decision, summary, year, triaged_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                rec.get("paper_id"),
                rec.get("title"),
                json.dumps(rec.get("authors")) if rec.get("authors") else None,
                json.dumps(rec.get("fields")) if rec.get("fields") else None,
                json.dumps(rec.get("methods")) if rec.get("methods") else None,
                rec.get("relevance"),
                rec.get("decision"),
                rec.get("summary"),
                rec.get("year"),
                rec.get("triaged_at"),
            ),
        )
        count += 1

    conn.commit()
    return count


# ---------------------------------------------------------------------------
# Stage 4: Index field maps
# ---------------------------------------------------------------------------

def stage4_parse_maps(conn: sqlite3.Connection) -> int:
    """Parse field map markdown files from maps/*.md into library_field_maps."""
    maps_dir = KB_PATH / "maps"
    if not maps_dir.exists():
        print("  Warning: maps/ directory not found")
        return 0

    library_id = _current_library_id()
    count = 0
    for fp in sorted(maps_dir.glob("*.md")):
        text = _read_file(fp)
        if not text:
            continue

        slug = fp.stem
        # Title from first heading
        title_match = re.match(r"#\s+(.+)", text)
        title = title_match.group(1).strip() if title_match else slug

        mtime = datetime.fromtimestamp(fp.stat().st_mtime).isoformat()

        conn.execute(
            """
            INSERT OR REPLACE INTO library_field_maps
            (library_id, slug, title, content, updated_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (library_id, slug, title, text, mtime),
        )
        count += 1

    conn.commit()
    return count


# ---------------------------------------------------------------------------
# Stage 5: Parse ideas
# ---------------------------------------------------------------------------

def _parse_idea_block(block: str) -> dict | None:
    """Parse a single idea block (text between ## IDEA-... headings)."""
    # First line is the heading: "IDEA-2026-001: The Voltage Drop Puzzle ..."
    lines = block.split("\n", 1)
    heading = lines[0].strip()
    body = lines[1] if len(lines) > 1 else ""

    # Extract ID and title from heading
    id_match = re.match(r"(IDEA-\d{4}-\d{3}):\s*(.+)", heading)
    if not id_match:
        return None

    idea_id = id_match.group(1)
    title = id_match.group(2).strip()

    # Extract metadata fields
    status_m = re.search(r"\*\*Status:\*\*\s*(\S+)", body)
    date_m = re.search(r"\*\*Generated:\*\*\s*(\S+)", body)
    heuristic_m = re.search(r"\*\*Heuristic:\*\*\s*(.+)", body)
    source_m = re.search(r"\*\*Source papers:\*\*\s*(.+)", body)

    # Extract scores: "Novelty: 5/5 | Feasibility: 3/5 | Impact: 5/5"
    novelty_m = re.search(r"Novelty:\s*(\d+)/5", body)
    feasibility_m = re.search(r"Feasibility:\s*(\d+)/5", body)
    impact_m = re.search(r"Impact:\s*(\d+)/5", body)

    # Extract composite: "**Composite: 4.3/5**" or "**Composite: [formula] = 4.3/5**"
    composite_m = re.search(r"\*\*Composite:.*?([\d.]+)/5\*\*", body)

    novelty = int(novelty_m.group(1)) if novelty_m else None
    feasibility = int(feasibility_m.group(1)) if feasibility_m else None
    impact = int(impact_m.group(1)) if impact_m else None
    composite = float(composite_m.group(1)) if composite_m else None

    return {
        "id": idea_id,
        "title": title,
        "status": status_m.group(1) if status_m else None,
        "generated_date": date_m.group(1) if date_m else None,
        "heuristic": heuristic_m.group(1).strip() if heuristic_m else None,
        "source_papers": source_m.group(1).strip() if source_m else None,
        "content": body.strip(),
        "novelty": novelty,
        "feasibility": feasibility,
        "impact": impact,
        "composite": composite,
    }


def stage5_parse_ideas(conn: sqlite3.Connection) -> int:
    """Parse ideas from ideas/idea_bank.md into library_ideas."""
    # Check both locations: ideas/ dir and maps/ dir
    idea_paths = [
        KB_PATH / "ideas" / "idea_bank.md",
        KB_PATH / "maps" / "idea_bank.md",
    ]

    library_id = _current_library_id()
    count = 0
    for idea_path in idea_paths:
        if not idea_path.exists():
            continue

        text = _read_file(idea_path)
        if not text:
            continue

        # Split on ## IDEA- headings
        blocks = re.split(r"^## (?=IDEA-\d{4}-\d{3}:)", text, flags=re.MULTILINE)

        for block in blocks:
            block = block.strip()
            if not block.startswith("IDEA-"):
                continue

            idea = _parse_idea_block(block)
            if idea is None:
                continue

            conn.execute(
                """INSERT OR REPLACE INTO library_ideas
                   (library_id, id, title, status, generated_date, heuristic, source_papers,
                    content, novelty, feasibility, impact, composite)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    library_id,
                    idea["id"],
                    idea["title"],
                    idea["status"],
                    idea["generated_date"],
                    idea["heuristic"],
                    idea["source_papers"],
                    idea["content"],
                    idea["novelty"],
                    idea["feasibility"],
                    idea["impact"],
                    idea["composite"],
                ),
            )
            count += 1

        break  # only process the first file found

    conn.commit()
    return count


# ---------------------------------------------------------------------------
# Stage 5b: Parse graveyard evaluations
# ---------------------------------------------------------------------------

def _parse_evaluation_block(block: str) -> dict | None:
    """Parse a single evaluation block from graveyard.md."""
    block = block.strip()
    if not block:
        return None

    # Extract idea ID from heading: "IDEA-2026-001 Evaluation" or
    # "IDEA-2026-001 Evaluation: Title"
    id_match = re.match(r"(IDEA-\d{4}-\d{3})\s+Evaluation", block)
    if not id_match:
        return None

    idea_id = id_match.group(1)

    # Extract verdict
    verdict_m = re.search(r"\*\*Verdict:\*\*\s*(DEVELOP|PROMOTE|KILL)", block)
    verdict = verdict_m.group(1) if verdict_m else None

    # Extract scores — format: "**Novelty:** 4/5" or "**Novelty:** 4/5 —"
    novelty_m = re.search(r"\*\*Novelty:\*\*\s*(\d+)/5", block)
    ident_m = re.search(r"\*\*Identification:\*\*\s*(\d+)/5", block)
    data_m = re.search(r"\*\*Data:\*\*\s*(\d+)/5", block)
    contrib_m = re.search(r"\*\*Contribution:\*\*\s*(\d+)/5", block)
    feas_m = re.search(r"\*\*Feasibility:\*\*\s*(\d+)/5", block)

    # Extract overall score: "**Overall: 3.0/5**"
    overall_m = re.search(r"\*\*Overall:\s*([\d.]+)/5\*\*", block)

    # Extract key risk
    risk_m = re.search(r"\*\*Key risk:\*\*\s*(.+?)(?:\n\n|\n\*\*|\Z)", block, re.DOTALL)

    # Extract next steps — can be "**If DEVELOP — Next steps:**" or "**Next steps:**"
    steps_m = re.search(
        r"\*\*(?:If\s+\w+\s+(?:—|--)\s+)?[Nn]ext\s+steps:\*\*\s*\n((?:\d+\..*(?:\n|$))+)",
        block,
    )

    # Extract death reason for KILL verdicts
    death_m = re.search(r"\*\*Death reason:\*\*\s*(.+?)(?:\n\n|\n---|\Z)", block, re.DOTALL)

    next_steps = steps_m.group(1).strip() if steps_m else None
    key_risk = risk_m.group(1).strip() if risk_m else None
    death_reason = death_m.group(1).strip() if death_m else None

    return {
        "idea_id": idea_id,
        "verdict": verdict,
        "novelty_score": int(novelty_m.group(1)) if novelty_m else None,
        "identification_score": int(ident_m.group(1)) if ident_m else None,
        "data_score": int(data_m.group(1)) if data_m else None,
        "contribution_score": int(contrib_m.group(1)) if contrib_m else None,
        "feasibility_score": int(feas_m.group(1)) if feas_m else None,
        "overall_score": float(overall_m.group(1)) if overall_m else None,
        "key_risk": key_risk,
        "next_steps": next_steps,
        "death_reason": death_reason,
        "evaluation_text": block,
    }


def stage5b_parse_evaluations(conn: sqlite3.Connection) -> int:
    """Parse idea evaluations from ideas/graveyard.md into library_idea_evaluations."""
    graveyard_path = KB_PATH / "ideas" / "graveyard.md"
    if not graveyard_path.exists():
        print("  Warning: ideas/graveyard.md not found")
        return 0

    library_id = _current_library_id()
    text = _read_file(graveyard_path)
    if not text:
        return 0

    # Split on "### IDEA-" headings (section level 3)
    blocks = re.split(r"^### (?=IDEA-\d{4}-\d{3}\s+Evaluation)", text, flags=re.MULTILINE)

    count = 0
    seen = set()  # Handle duplicate IDs (second evaluation supersedes)
    for block in blocks:
        block = block.strip()
        if not block.startswith("IDEA-"):
            continue

        evl = _parse_evaluation_block(block)
        if evl is None:
            continue

        # Keep later evaluation if duplicate ID (it comes later in the file)
        seen.add(evl["idea_id"])

        conn.execute(
            """INSERT OR REPLACE INTO library_idea_evaluations
               (library_id, idea_id, verdict, novelty_score, identification_score,
                data_score, contribution_score, feasibility_score,
                overall_score, key_risk, next_steps, death_reason,
                evaluation_text)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                library_id,
                evl["idea_id"],
                evl["verdict"],
                evl["novelty_score"],
                evl["identification_score"],
                evl["data_score"],
                evl["contribution_score"],
                evl["feasibility_score"],
                evl["overall_score"],
                evl["key_risk"],
                evl["next_steps"],
                evl["death_reason"],
                evl["evaluation_text"],
            ),
        )
        count += 1

    conn.commit()
    return count


# ---------------------------------------------------------------------------
# Stage 6: Parse digests
# ---------------------------------------------------------------------------

def stage6_parse_digests(conn: sqlite3.Connection) -> int:
    """Parse daily digest files from digests/*.md into library_digests."""
    digests_dir = KB_PATH / "digests"
    if not digests_dir.exists():
        print("  Warning: digests/ directory not found")
        return 0

    library_id = _current_library_id()
    count = 0
    for fp in sorted(digests_dir.glob("*.md")):
        text = _read_file(fp)
        if not text:
            continue

        # Parse date from filename (YYYY-MM-DD.md)
        date_str = fp.stem  # e.g. "2026-03-25"
        if not re.match(r"\d{4}-\d{2}-\d{2}$", date_str):
            print(f"  Skipping {fp.name}: filename doesn't match YYYY-MM-DD pattern")
            continue

        conn.execute(
            "INSERT OR REPLACE INTO library_digests (library_id, date, content) VALUES (?, ?, ?)",
            (library_id, date_str, text),
        )
        count += 1

    conn.commit()
    return count


# ---------------------------------------------------------------------------
# Stage 7: Merge existing DB (was stage 6)
# ---------------------------------------------------------------------------

def _find_existing_db() -> Path | None:
    """Locate the existing external agent database, if one is configured."""
    for candidate in EXISTING_AGENT_DB_CANDIDATES:
        if candidate.exists():
            return candidate
    return None


def stage7_merge_existing(conn: sqlite3.Connection) -> int:
    """Pull paper metadata from the existing agent-system database."""
    existing_path = _find_existing_db()
    if existing_path is None:
        print("  Warning: external agent database not found, skipping merge")
        return 0

    ext_conn = sqlite3.connect(str(existing_path))
    ext_conn.row_factory = sqlite3.Row

    # Check which columns exist in the external DB (triage_summary may not exist in older versions)
    ext_columns = {col[1] for col in ext_conn.execute("PRAGMA table_info(papers)").fetchall()}
    has_triage_summary = "triage_summary" in ext_columns

    select_cols = "paper_id, year, field_tags, status, triage_decision"
    if has_triage_summary:
        select_cols += ", triage_summary"

    rows = ext_conn.execute(f"SELECT {select_cols} FROM papers").fetchall()

    count = 0
    for row in rows:
        paper_id = row["paper_id"]

        # Parse field_tags from JSON string to our fields format
        fields_raw = row["field_tags"]
        fields = None
        if fields_raw:
            try:
                parsed = json.loads(fields_raw)
                if isinstance(parsed, list):
                    fields = json.dumps(parsed)
            except (json.JSONDecodeError, TypeError):
                pass

        # Only insert if paper doesn't already have a card
        triage_summary_val = row["triage_summary"] if has_triage_summary else None
        conn.execute(
            """
            INSERT INTO papers
            (paper_id, year, fields, triage_decision, triage_summary, has_card)
            VALUES (?, ?, ?, ?, ?, 0)
            ON CONFLICT(paper_id) DO UPDATE SET
                year = CASE
                    WHEN papers.has_card = 0 OR papers.has_card IS NULL THEN excluded.year
                    ELSE papers.year
                END,
                fields = CASE
                    WHEN papers.has_card = 0 OR papers.has_card IS NULL THEN COALESCE(excluded.fields, papers.fields)
                    ELSE papers.fields
                END,
                triage_decision = CASE
                    WHEN papers.has_card = 0 OR papers.has_card IS NULL THEN COALESCE(excluded.triage_decision, papers.triage_decision)
                    ELSE papers.triage_decision
                END,
                triage_summary = CASE
                    WHEN papers.has_card = 0 OR papers.has_card IS NULL THEN COALESCE(excluded.triage_summary, papers.triage_summary)
                    ELSE papers.triage_summary
                END
            """,
            (
                paper_id,
                row["year"],
                fields,
                row["triage_decision"],
                triage_summary_val,
            ),
        )
        count += 1

    ext_conn.close()
    conn.commit()
    return count


# ---------------------------------------------------------------------------
# Stage 8: Build FTS5 search index (was stage 7)
# ---------------------------------------------------------------------------

def stage8_build_fts(conn: sqlite3.Connection) -> int:
    """Populate the FTS5 search_index with all entities."""
    library_id = _current_library_id()
    count = 0

    # Clear this library's existing index rows first. search_index has no UNIQUE
    # constraint, so without this a second run of run_ingestion() (e.g. the plain
    # `python ingest.py` entrypoint) would duplicate every paper/atom/map/idea
    # row, corrupting bm25 ranking and returning duplicate hits.
    conn.execute("DELETE FROM search_index WHERE library_id = ?", (str(library_id),))

    # Ensure every ingested paper is linked to this library before the FTS JOIN
    # below. init_db()'s library_papers backfill runs at the very start of
    # run_ingestion(), before stage1 inserts any papers, so on a brand-new DB the
    # paper/atom keyword index would otherwise be built empty on the first run.
    conn.execute(
        "INSERT OR IGNORE INTO library_papers (library_id, paper_id) "
        "SELECT ?, paper_id FROM papers",
        (library_id,),
    )

    # Papers: title + all card section content
    papers = conn.execute(
        """
        SELECT p.paper_id, p.title
        FROM papers p
        JOIN library_papers lp ON lp.paper_id = p.paper_id
        WHERE lp.library_id = ?
        """,
        (library_id,),
    ).fetchall()
    for paper in papers:
        pid = paper["paper_id"]
        title = paper["title"] or ""

        # Gather all card section content
        sections = conn.execute(
            "SELECT content FROM card_sections WHERE paper_id = ?", (pid,)
        ).fetchall()
        content_parts = [s["content"] for s in sections if s["content"]]

        # Also include triage summary if available and no card sections
        if not content_parts:
            triage = conn.execute(
                "SELECT summary FROM triage_cards WHERE paper_id = ?", (pid,)
            ).fetchone()
            if triage and triage["summary"]:
                content_parts.append(triage["summary"])

        content = "\n\n".join(content_parts)

        conn.execute(
            "INSERT INTO search_index (entity_type, entity_id, title, content, library_id) VALUES (?, ?, ?, ?, ?)",
            ("paper", pid, title, content, str(library_id)),
        )
        count += 1

    # Atoms: title + description
    atoms = conn.execute(
        """
        SELECT DISTINCT a.slug, a.title, a.description
        FROM atoms a
        JOIN atom_paper_refs apr ON apr.atom_slug = a.slug
        JOIN library_papers lp ON lp.paper_id = apr.paper_id
        WHERE lp.library_id = ?
        """,
        (library_id,),
    ).fetchall()
    for atom in atoms:
        conn.execute(
            "INSERT INTO search_index (entity_type, entity_id, title, content, library_id) VALUES (?, ?, ?, ?, ?)",
            ("atom", atom["slug"], atom["title"] or "", atom["description"] or "", str(library_id)),
        )
        count += 1

    # Field maps: title + full content
    maps = conn.execute(
        """
        SELECT slug, title, content
        FROM library_field_maps
        WHERE library_id = ?
        """,
        (library_id,),
    ).fetchall()
    for fm in maps:
        conn.execute(
            "INSERT INTO search_index (entity_type, entity_id, title, content, library_id) VALUES (?, ?, ?, ?, ?)",
            ("map", fm["slug"], fm["title"] or "", fm["content"] or "", str(library_id)),
        )
        count += 1

    # Ideas: title + content
    ideas = conn.execute(
        """
        SELECT id, title, content
        FROM library_ideas
        WHERE library_id = ?
        """,
        (library_id,),
    ).fetchall()
    for idea in ideas:
        conn.execute(
            "INSERT INTO search_index (entity_type, entity_id, title, content, library_id) VALUES (?, ?, ?, ?, ?)",
            ("idea", idea["id"], idea["title"] or "", idea["content"] or "", str(library_id)),
        )
        count += 1

    conn.commit()
    return count


# ---------------------------------------------------------------------------
# Main pipeline
# ---------------------------------------------------------------------------

def run_ingestion() -> None:
    """Run all 8 ingestion stages with progress logging."""
    print("=" * 60)
    print("Knowledge Base Ingestion Pipeline")
    print("=" * 60)
    print(f"Knowledge base path: {KB_PATH}")
    print(f"Database path: {get_db_path()}")
    print()

    # Initialize schema
    print("Initializing database schema...")
    init_db()
    conn = get_connection()

    # Stage 1
    print("Stage 1: Parsing paper cards...")
    n = stage1_parse_cards(conn)
    print(f"  -> {n} paper cards ingested")

    # Stage 2
    print("Stage 2: Parsing atoms...")
    n = stage2_parse_atoms(conn)
    print(f"  -> {n} atoms ingested")

    # Stage 3
    print("Stage 3: Parsing triage records...")
    n = stage3_parse_triage(conn)
    print(f"  -> {n} triage cards ingested")

    # Stage 4
    print("Stage 4: Indexing field maps...")
    n = stage4_parse_maps(conn)
    print(f"  -> {n} field maps ingested")

    # Stage 5
    print("Stage 5: Parsing ideas...")
    n = stage5_parse_ideas(conn)
    print(f"  -> {n} ideas ingested")

    # Stage 5b
    print("Stage 5b: Parsing idea evaluations (graveyard)...")
    n = stage5b_parse_evaluations(conn)
    print(f"  -> {n} evaluations ingested")

    # Stage 6
    print("Stage 6: Parsing digests...")
    n = stage6_parse_digests(conn)
    print(f"  -> {n} digests ingested")

    # Stage 7
    print("Stage 7: Merging existing paper database...")
    n = stage7_merge_existing(conn)
    print(f"  -> {n} papers merged from existing DB")

    # Stage 8
    print("Stage 8: Building FTS5 search index...")
    n = stage8_build_fts(conn)
    print(f"  -> {n} entries indexed")

    conn.close()

    # Summary stats
    print()
    print("-" * 60)
    print("Ingestion complete. Summary:")
    conn = get_connection()
    library_id = _current_library_id()
    # Global tables ingestion populates directly.
    for table in ["papers", "paper_scores", "card_sections", "atoms",
                   "atom_paper_refs", "triage_cards"]:
        row = conn.execute(f"SELECT COUNT(*) as c FROM {table}").fetchone()
        print(f"  {table}: {row['c']} rows")
    # Library-scoped tables ingestion writes to (the legacy field_maps/ideas/
    # digests tables are no longer populated and always read 0).
    for table in ["library_field_maps", "library_ideas", "library_digests"]:
        row = conn.execute(
            f"SELECT COUNT(*) as c FROM {table} WHERE library_id = ?",
            (library_id,),
        ).fetchone()
        print(f"  {table}: {row['c']} rows")
    row = conn.execute("SELECT COUNT(*) as c FROM search_index").fetchone()
    print(f"  search_index: {row['c']} rows")
    conn.close()
    print("-" * 60)


def run_digest_ingestion() -> None:
    """Run only the digest ingestion stage (safe for incremental use)."""
    print("Ingesting digests...")
    conn = get_connection()
    n = stage6_parse_digests(conn)
    print(f"  -> {n} digests ingested")
    conn.close()


if __name__ == "__main__":
    run_ingestion()
