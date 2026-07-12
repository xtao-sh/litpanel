#!/usr/bin/env python3
"""Create a small public demo SQLite database for Lit Panel."""

from __future__ import annotations

import argparse
import json
import os
import sqlite3
import sys
from datetime import date
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = ROOT / "backend"


PAPERS = [
    {
        "paper_id": "demo-001",
        "title": "Wage Posting and the Geography of Monopsony Power",
        "authors": ["Maya Chen", "Julian Hart", "Elena Rossi"],
        "year": 2026,
        "fields": ["Labor Economics", "Industrial Organization"],
        "jel": ["J42", "J31", "L13"],
        "score": 4.7,
        "summary": "A synthetic panel shows how wage-posting frictions can generate persistent local wage dispersion.",
    },
    {
        "paper_id": "demo-002",
        "title": "Credit Constraints and Climate Adaptation in Smallholder Agriculture",
        "authors": ["Amina Okafor", "Leo Marin"],
        "year": 2026,
        "fields": ["Development Economics", "Environmental Economics"],
        "jel": ["O13", "Q54"],
        "score": 4.5,
        "summary": "A randomized demo study links liquidity timing to adoption of heat-resistant inputs.",
    },
    {
        "paper_id": "demo-003",
        "title": "Algorithmic Pricing in Decentralized Markets",
        "authors": ["Noah Singh", "Clara Bell", "Mateo Alvarez"],
        "year": 2025,
        "fields": ["Industrial Organization", "Digital Economy"],
        "jel": ["L13", "D43"],
        "score": 4.3,
        "summary": "Agent-based simulations illustrate when adaptive pricing rules mimic tacit collusion.",
    },
    {
        "paper_id": "demo-004",
        "title": "School-Choice Mechanism Design under Strategic Reporting",
        "authors": ["Iris Novak", "Priya Raman"],
        "year": 2025,
        "fields": ["Public Economics", "Education"],
        "jel": ["I24", "D47"],
        "score": 4.1,
        "summary": "A clean example of matching-market rules and reporting incentives in school assignment.",
    },
    {
        "paper_id": "demo-005",
        "title": "Remote Work and the Shape of Urban Wage Premia",
        "authors": ["Maya Chen", "Daniel Reed"],
        "year": 2024,
        "fields": ["Urban Economics", "Labor Economics"],
        "jel": ["R23", "J31"],
        "score": 4.0,
        "summary": "Synthetic commuting zones reveal how hybrid work reshapes skill sorting and wage premia.",
    },
    {
        "paper_id": "demo-006",
        "title": "Public Procurement Scores and Supplier Entry",
        "authors": ["Clara Bell", "Sofia Duarte"],
        "year": 2024,
        "fields": ["Public Economics", "Industrial Organization"],
        "jel": ["H57", "L15"],
        "score": 3.9,
        "summary": "A scoring-rule demo shows when transparent procurement expands the supplier base.",
    },
    {
        "paper_id": "demo-007",
        "title": "Health Insurance Networks and Preventive Care Take-Up",
        "authors": ["Elena Rossi", "Amina Okafor"],
        "year": 2023,
        "fields": ["Health Economics", "Public Economics"],
        "jel": ["I13", "I18"],
        "score": 3.8,
        "summary": "A compact network example connects provider access to preventive-care use.",
    },
    {
        "paper_id": "demo-008",
        "title": "Inventor Teams and the Diffusion of Green Patents",
        "authors": ["Julian Hart", "Noah Singh"],
        "year": 2023,
        "fields": ["Innovation Economics", "Environmental Economics"],
        "jel": ["O31", "Q55"],
        "score": 3.7,
        "summary": "A citation-network demo follows how team composition predicts clean-tech diffusion.",
    },
]


ATOMS = [
    ("shift-share-iv", "method", "Shift-share IV", "Instrumental variation built from exposure shares and aggregate shocks.", "strong", "Identification"),
    ("difference-in-differences", "method", "Difference-in-Differences", "Compares changes across treated and control units over time.", "strong", "Identification"),
    ("monopsony-power", "mechanism", "Monopsony power", "Employers face upward-sloping labor supply and can set wages below marginal product.", "moderate", "Labor Markets"),
    ("search-frictions", "mechanism", "Search frictions", "Workers and firms do not instantly meet, producing wage dispersion and delayed adjustment.", "moderate", "Labor Markets"),
    ("liquidity-constraint", "mechanism", "Liquidity constraint", "Short-run financing gaps prevent otherwise profitable investment.", "moderate", "Development"),
    ("climate-adaptation", "puzzle", "Climate adaptation", "Who adapts, when, and why adjustment remains incomplete.", "emerging", "Climate"),
    ("algorithmic-pricing", "mechanism", "Algorithmic pricing", "Automated rules can amplify strategic interdependence across sellers.", "moderate", "Digital Markets"),
    ("tacit-collusion", "puzzle", "Tacit collusion", "Market outcomes look coordinated without explicit communication.", "emerging", "Industrial Organization"),
    ("deferred-acceptance", "method", "Deferred acceptance", "A matching mechanism that iteratively rejects low-priority assignments.", "strong", "Market Design"),
    ("strategic-reporting", "mechanism", "Strategic reporting", "Participants alter stated preferences when rules reward misrepresentation.", "moderate", "Market Design"),
    ("administrative-claims", "dataset", "Administrative claims", "Structured enrollment, billing, and service-use records.", "strong", "Health"),
    ("patent-citations", "dataset", "Patent citations", "Links among patents used to study innovation diffusion.", "moderate", "Innovation"),
]


PAPER_ATOMS = {
    "demo-001": ["monopsony-power", "search-frictions", "shift-share-iv"],
    "demo-002": ["liquidity-constraint", "climate-adaptation", "difference-in-differences"],
    "demo-003": ["algorithmic-pricing", "tacit-collusion"],
    "demo-004": ["deferred-acceptance", "strategic-reporting"],
    "demo-005": ["search-frictions", "shift-share-iv"],
    "demo-006": ["algorithmic-pricing", "difference-in-differences"],
    "demo-007": ["administrative-claims", "difference-in-differences"],
    "demo-008": ["patent-citations", "climate-adaptation"],
}


SCORE_DIMENSIONS = [
    "identification",
    "data_quality",
    "contribution",
    "external_validity",
    "clarity",
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--db",
        default=str(ROOT / "backend" / "kb.db"),
        help="Path to the SQLite database to create.",
    )
    parser.add_argument(
        "--data-root",
        default=str(ROOT / "Data"),
        help="Directory where public demo cards and runtime files are created.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Replace an existing database at --db.",
    )
    parser.add_argument(
        "--files-only",
        action="store_true",
        help="Only write the public demo knowledge-base files; do not recreate the SQLite database.",
    )
    parser.add_argument(
        "--replace-files",
        action="store_true",
        help="Clear the source-library demo cards/atoms/maps/ideas directories before writing files.",
    )
    parser.add_argument(
        "--portable-paths",
        action="store_true",
        help="Store portable placeholders in the libraries table instead of host absolute paths.",
    )
    return parser.parse_args()


def ensure_schema(db_path: Path, data_root: Path, force: bool) -> None:
    if db_path.exists() and not force:
        raise SystemExit(f"{db_path} already exists. Pass --force to replace it.")
    for suffix in ("", "-wal", "-shm"):
        path = Path(f"{db_path}{suffix}")
        if path.exists():
            path.unlink()

    db_path.parent.mkdir(parents=True, exist_ok=True)
    os.environ["KB_DB_PATH"] = str(db_path)
    os.environ["KB_DATA_ROOT"] = str(data_root)
    os.environ["KB_DISABLE_LEGACY_AI_IMPORT"] = "1"
    sys.path.insert(0, str(ROOT))
    sys.path.insert(0, str(BACKEND_DIR))

    from database import init_db

    init_db()


def json_text(value: object) -> str:
    return json.dumps(value, ensure_ascii=False)


def _card_markdown(paper: dict) -> str:
    atoms = PAPER_ATOMS.get(str(paper["paper_id"]), [])
    atom_lines = "\n".join(f"- {slug}" for slug in atoms) or "- none"
    score = float(paper["score"])
    return f"""# {paper["paper_id"]}: {paper["title"]}

## Meta
- Authors: {", ".join(paper["authors"])}
- Year: {paper["year"]}
- Fields: {", ".join(paper["fields"])}
- JEL: {", ".join(paper["jel"])}

## Research Question
{paper["summary"]}

## Methods & Data
This public demo card uses synthetic metadata and short descriptions so the UI can be shipped without private research notes.

## Findings
The example highlights how {paper["fields"][0].lower()} concepts can be represented as reusable graph atoms.

## Atoms
{atom_lines}

## Scores
- identification: {max(1, min(5, round(score)))}/5
- data_quality: {max(1, min(5, round(score - 0.2)))}/5
- contribution: {max(1, min(5, round(score + 0.1)))}/5
- external_validity: {max(1, min(5, round(score - 0.1)))}/5
- clarity: {max(1, min(5, round(score)))}/5
**Average: {score:.1f}/5**
"""


def _atom_markdown(atom: tuple[str, str, str, str, str, str]) -> str:
    slug, _atom_type, title, description, strength, theme = atom
    papers = [paper_id for paper_id, slugs in PAPER_ATOMS.items() if slug in slugs]
    paper_lines = "\n".join(f"- {paper_id}" for paper_id in papers) or "- none"
    return f"""# {title}

## Description
{description}

## Evidence Strength
{strength}

## When to Use
Use this public demo atom when exploring the {theme} portion of the synthetic corpus.

## Access
Demo

## URL

## Key References
- Public demo seed

## Papers
{paper_lines}
"""


def seed_demo_files(data_root: Path, *, replace: bool = False) -> None:
    knowledge_base_dir = data_root / "knowledge_base" / "source-library"
    cards_dir = knowledge_base_dir / "cards"
    atoms_dir = knowledge_base_dir / "atoms"
    maps_dir = knowledge_base_dir / "maps"
    ideas_dir = knowledge_base_dir / "ideas"

    if replace:
        import shutil

        for path in [cards_dir, atoms_dir, maps_dir, ideas_dir]:
            if path.exists():
                shutil.rmtree(path)

    cards_dir.mkdir(parents=True, exist_ok=True)
    for subdir in ["methods", "datasets", "mechanisms", "puzzles"]:
        (atoms_dir / subdir).mkdir(parents=True, exist_ok=True)
    maps_dir.mkdir(parents=True, exist_ok=True)
    ideas_dir.mkdir(parents=True, exist_ok=True)

    for paper in PAPERS:
        (cards_dir / f"{paper['paper_id']}.md").write_text(_card_markdown(paper), encoding="utf-8")

    atom_dir_by_type = {
        "method": "methods",
        "dataset": "datasets",
        "mechanism": "mechanisms",
        "puzzle": "puzzles",
    }
    for atom in ATOMS:
        slug, atom_type, *_ = atom
        (atoms_dir / atom_dir_by_type[atom_type] / f"{slug}.md").write_text(
            _atom_markdown(atom),
            encoding="utf-8",
        )

    (maps_dir / "demo-atlas.md").write_text(
        "# Demo Atlas\n\nThis public seed contains synthetic papers and atoms only.\n",
        encoding="utf-8",
    )
    (ideas_dir / "idea_bank.md").write_text(
        "\n\n".join(
            [
                "# Demo Ideas",
                "## IDEA-2026-001: Measure how search frictions alter wage-posting pass-through.\n**Status:** DEVELOP\n**Generated:** 2026-01-01\n**Heuristic:** demo-seed\n**Source papers:** demo-001, demo-005\n\nNovelty: 4/5 | Feasibility: 4/5 | Impact: 4/5\n\n**Composite: 4.1/5**\n\nA synthetic idea for testing the complete Ideas workflow.",
                "## IDEA-2026-002: Compare procurement score transparency across synthetic supplier markets.\n**Status:** DEVELOP\n**Generated:** 2026-01-01\n**Heuristic:** demo-seed\n**Source papers:** demo-006\n\nNovelty: 4/5 | Feasibility: 4/5 | Impact: 4/5\n\n**Composite: 3.8/5**\n\nA synthetic idea for testing the complete Ideas workflow.",
                "## IDEA-2026-003: Map green patent diffusion through inventor-team composition.\n**Status:** DEVELOP\n**Generated:** 2026-01-01\n**Heuristic:** demo-seed\n**Source papers:** demo-008\n\nNovelty: 4/5 | Feasibility: 4/5 | Impact: 4/5\n\n**Composite: 3.7/5**\n\nA synthetic idea for testing the complete Ideas workflow.",
            ]
        )
        + "\n",
        encoding="utf-8",
    )


def get_default_library_id(
    cur: sqlite3.Cursor,
    data_root: Path,
    *,
    portable_paths: bool = False,
) -> int:
    row = cur.execute("SELECT id FROM libraries ORDER BY id LIMIT 1").fetchone()
    if row is None:
        raise RuntimeError("No default library was created.")
    library_id = int(row[0])
    papers_dir = data_root / "papers" / "source-library"
    knowledge_base_dir = data_root / "knowledge_base" / "source-library"
    agent_db_path = data_root / "source-library_agent.db"
    papers_dir.mkdir(parents=True, exist_ok=True)
    knowledge_base_dir.mkdir(parents=True, exist_ok=True)
    stored_papers_dir = "__LIT_PANEL_DATA_ROOT__/papers/source-library" if portable_paths else str(papers_dir)
    stored_knowledge_base_dir = (
        "__LIT_PANEL_DATA_ROOT__/knowledge_base/source-library"
        if portable_paths
        else str(knowledge_base_dir)
    )
    stored_agent_db_path = (
        "__LIT_PANEL_DATA_ROOT__/source-library_agent.db"
        if portable_paths
        else str(agent_db_path)
    )
    cur.execute(
        """
        UPDATE libraries
        SET slug = ?, name = ?, discipline = ?, description = ?, papers_dir = ?, knowledge_base_dir = ?, agent_db_path = ?
        WHERE id = ?
        """,
        (
            "source-library",
            "Demo Library",
            "Economics",
            "Synthetic public demo corpus for Lit Panel.",
            stored_papers_dir,
            stored_knowledge_base_dir,
            stored_agent_db_path,
            library_id,
        ),
    )
    return library_id


def seed_papers(cur: sqlite3.Cursor, library_id: int) -> None:
    for paper in PAPERS:
        cur.execute(
            """
            INSERT INTO papers
            (paper_id, title, authors, year, fields, jel, triage_decision, triage_summary, average_score, has_card, abstract, nber_url)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
            """,
            (
                paper["paper_id"],
                paper["title"],
                json_text(paper["authors"]),
                paper["year"],
                json_text(paper["fields"]),
                json_text(paper["jel"]),
                "include",
                paper["summary"],
                paper["score"],
                paper["summary"],
                f"https://example.org/papers/{paper['paper_id']}",
            ),
        )
        cur.execute(
            "INSERT INTO library_papers (library_id, paper_id, source_path, file_sha256) VALUES (?, ?, ?, ?)",
            (library_id, paper["paper_id"], "", ""),
        )
        cur.execute(
            """
            INSERT INTO triage_cards
            (paper_id, title, authors, fields, methods, relevance, decision, summary, year, triaged_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                paper["paper_id"],
                paper["title"],
                json_text(paper["authors"]),
                json_text(paper["fields"]),
                json_text(["research design", "causal evidence"]),
                int(round(float(paper["score"]) * 20)),
                "include",
                paper["summary"],
                paper["year"],
                date.today().isoformat(),
            ),
        )
        cur.execute(
            """
            INSERT INTO paper_processing_state
            (library_id, paper_id, processing_status, reading_profile, analysis_focuses, reading_status)
            VALUES (?, ?, 'completed', 'deep-read', ?, 'read')
            """,
            (library_id, paper["paper_id"], json_text(["identification", "data", "contribution"])),
        )
        for idx, dimension in enumerate(SCORE_DIMENSIONS):
            score = max(1, min(5, int(round(float(paper["score"]) + ((idx % 2) * 0.3 - 0.15)))))
            cur.execute(
                "INSERT INTO paper_scores (paper_id, dimension, score) VALUES (?, ?, ?)",
                (paper["paper_id"], dimension, score),
            )
        for section, content in [
            ("Setup", paper["summary"]),
            ("Finding", f"The demo card highlights how {paper['fields'][0].lower()} evidence can be organized into reusable atoms."),
            ("Mechanism", "The example separates question, method, data, and contribution so the UI can be inspected without private data."),
        ]:
            cur.execute(
                "INSERT INTO card_sections (paper_id, section, content) VALUES (?, ?, ?)",
                (paper["paper_id"], section, content),
            )


def seed_atoms(cur: sqlite3.Cursor) -> None:
    for slug, atom_type, title, description, strength, theme in ATOMS:
        cur.execute(
            """
            INSERT INTO atoms
            (slug, type, title, description, evidence_strength, when_to_use, access, url, key_references, theme)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                slug,
                atom_type,
                title,
                description,
                strength,
                "Use this atom as a public demo concept.",
                "Demo",
                "",
                json_text([]),
                theme,
            ),
        )
    for paper_id, atom_slugs in PAPER_ATOMS.items():
        for slug in atom_slugs:
            cur.execute(
                "INSERT INTO atom_paper_refs (atom_slug, paper_id) VALUES (?, ?)",
                (slug, paper_id),
            )


def seed_maps_and_ideas(cur: sqlite3.Cursor, library_id: int) -> None:
    field_map = """# Demo Atlas

This public seed contains synthetic papers and atoms only. Replace it with your own corpus by importing PDFs or pointing `KB_DB_PATH` at a private database.
"""
    cur.execute(
        "INSERT INTO field_maps (slug, title, content, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)",
        ("demo-atlas", "Demo Atlas", field_map),
    )
    cur.execute(
        "INSERT INTO library_field_maps (library_id, slug, title, content, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)",
        (library_id, "demo-atlas", "Demo Atlas", field_map),
    )
    ideas = [
        ("IDEA-2026-001", "Measure how search frictions alter wage-posting pass-through.", ["demo-001", "demo-005"], 4.1),
        ("IDEA-2026-002", "Compare procurement score transparency across synthetic supplier markets.", ["demo-006"], 3.8),
        ("IDEA-2026-003", "Map green patent diffusion through inventor-team composition.", ["demo-008"], 3.7),
    ]
    for idea_id, title, source_papers, composite in ideas:
        content = f"Demo idea generated from {', '.join(source_papers)}."
        idea_values = (
            idea_id,
            title,
            date.today().isoformat(),
            json_text(source_papers),
            content,
            composite,
        )
        cur.execute(
            """
            INSERT INTO ideas
            (id, title, status, generated_date, heuristic, source_papers, content, novelty, feasibility, impact, composite)
            VALUES (?, ?, 'new', ?, 'demo-seed', ?, ?, 4, 4, 4, ?)
            """,
            idea_values,
        )
        cur.execute(
            """
            INSERT INTO library_ideas
            (library_id, id, title, status, generated_date, heuristic, source_papers, content, novelty, feasibility, impact, composite)
            VALUES (?, ?, ?, 'new', ?, 'demo-seed', ?, ?, 4, 4, 4, ?)
            """,
            (library_id, idea_id, title, idea_values[2], idea_values[3], content, composite),
        )


def rebuild_search_index(cur: sqlite3.Cursor, library_id: int) -> None:
    cur.execute("DELETE FROM search_index")
    for paper in PAPERS:
        cur.execute(
            """
            INSERT INTO search_index (entity_type, entity_id, title, content, library_id)
            VALUES ('paper', ?, ?, ?, ?)
            """,
            (paper["paper_id"], paper["title"], paper["summary"], library_id),
        )
    for slug, atom_type, title, description, _strength, theme in ATOMS:
        cur.execute(
            """
            INSERT INTO search_index (entity_type, entity_id, title, content, library_id)
            VALUES ('atom', ?, ?, ?, ?)
            """,
            (slug, title, f"{atom_type} {theme} {description}", library_id),
        )


def seed_demo_agent_db(data_root: Path, library_id: int, *, force: bool) -> None:
    agent_db_path = data_root / "source-library_agent.db"
    if agent_db_path.exists():
        if not force:
            raise SystemExit(
                f"{agent_db_path} already exists. Pass --force to replace the demo runtime database."
            )
        agent_db_path.unlink()

    agent_db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(agent_db_path))
    try:
        conn.executescript(
            """
            CREATE TABLE papers (
                paper_id TEXT PRIMARY KEY,
                file_path TEXT NOT NULL,
                status TEXT DEFAULT 'pending',
                year INTEGER,
                folder TEXT DEFAULT '',
                title TEXT DEFAULT '',
                authors TEXT DEFAULT '',
                relevance_score REAL,
                field_tags TEXT DEFAULT '',
                key_contribution TEXT DEFAULT '',
                triage_decision TEXT,
                triage_summary TEXT,
                triaged_at TIMESTAMP,
                completed_at TIMESTAMP,
                linker_batch INTEGER,
                reading_profile TEXT DEFAULT 'auto',
                analysis_focuses TEXT DEFAULT '[]',
                analysis_focus_prompts TEXT DEFAULT '{}',
                custom_reading_instructions TEXT DEFAULT '',
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX idx_agent_papers_status ON papers(status);
            CREATE INDEX idx_agent_papers_folder ON papers(folder);
            """
        )
        for paper in PAPERS:
            conn.execute(
                """
                INSERT INTO papers (
                    paper_id, file_path, status, year, folder, title, authors,
                    relevance_score, field_tags, key_contribution, triage_decision,
                    triage_summary, triaged_at, completed_at, reading_profile,
                    analysis_focuses
                ) VALUES (?, '', 'completed', ?, ?, ?, ?, ?, ?, ?, 'DEEP_READ', ?, CURRENT_TIMESTAMP,
                          CURRENT_TIMESTAMP, 'full_content', ?)
                """,
                (
                    paper["paper_id"],
                    paper["year"],
                    f"library:{library_id}",
                    paper["title"],
                    ", ".join(paper["authors"]),
                    int(round(float(paper["score"]) * 20)),
                    ", ".join(paper["fields"]),
                    paper["summary"],
                    paper["summary"],
                    json_text(["identification", "data", "contribution"]),
                ),
            )
        conn.commit()
    finally:
        conn.close()


def seed_demo_db(
    db_path: Path,
    data_root: Path,
    *,
    force: bool,
    portable_paths: bool = False,
) -> None:
    conn = sqlite3.connect(str(db_path))
    try:
        cur = conn.cursor()
        library_id = get_default_library_id(cur, data_root, portable_paths=portable_paths)
        seed_papers(cur, library_id)
        seed_atoms(cur)
        seed_maps_and_ideas(cur, library_id)
        rebuild_search_index(cur, library_id)
        conn.commit()
        # Remove free pages that may still contain the host paths written by
        # schema initialization before portable placeholders are applied.
        conn.execute("VACUUM")
    finally:
        conn.close()
    seed_demo_agent_db(data_root, library_id, force=force)


def main() -> None:
    args = parse_args()
    data_root = Path(args.data_root).resolve()
    if args.files_only:
        seed_demo_files(data_root, replace=args.replace_files)
        print("Wrote public demo knowledge-base files.")
        return
    db_path = Path(args.db).resolve()
    agent_db_path = data_root / "source-library_agent.db"
    if agent_db_path.exists() and not args.force:
        raise SystemExit(
            f"{agent_db_path} already exists. Pass --force to replace the demo runtime database."
        )
    ensure_schema(db_path, data_root, force=args.force)
    seed_demo_files(data_root, replace=args.replace_files)
    seed_demo_db(
        db_path,
        data_root,
        force=args.force,
        portable_paths=args.portable_paths,
    )
    print(f"Created demo database: {db_path}")


if __name__ == "__main__":
    main()
