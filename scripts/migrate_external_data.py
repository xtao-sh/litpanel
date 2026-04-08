"""
Migration script to re-ingest the expanded knowledge base into kb.db.

Reads the external nber_papers.db and merges paper metadata, triage decisions,
and scores into the website's kb.db, then runs the standard ingestion pipeline
and recomputes embeddings.

Usage:
    python3 scripts/migrate_external_data.py
"""

from __future__ import annotations

import json
import os
import sqlite3
import sys
import time
from pathlib import Path

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

PROJECT_ROOT = Path(__file__).resolve().parent.parent
BACKEND_DIR = PROJECT_ROOT / "backend"
DATA_DIR = PROJECT_ROOT / "Data"
CARDS_DIR = DATA_DIR / "knowledge_base" / "cards"

EXTERNAL_DB_CANDIDATES = [
    DATA_DIR / "nber_papers.db",
    DATA_DIR / "nber_papers_external.db",
]

KB_DB_PATH = BACKEND_DIR / "kb.db"

# Ensure backend modules are importable
sys.path.insert(0, str(BACKEND_DIR))


# ---------------------------------------------------------------------------
# Score column mapping: external DB column -> kb.db dimension name
# ---------------------------------------------------------------------------

SCORE_COLUMN_MAP = {
    "innovation_score": "literature_innovation",
    "theory_score": "theory_contribution",
    "empirical_rigor_score": "empirical_rigor",
    "data_quality": "data_quality",
    "method_complexity": "method_complexity",
    "technical_difficulty": "technical_difficulty",
    "method_innovation": "method_innovation",
    "reproducibility": "reproducibility",
    "narrative_clarity": "narrative_clarity",
    "structure_quality": "structure_quality",
    "lit_review_quality": "lit_review_quality",
    "presentation_quality": "presentation_quality",
    "relevance_score": "relevance_to_field",
    "data_accessibility": "data_accessibility",
    "inspiration_score": "inspiration",
}

SCORE_COLUMNS = list(SCORE_COLUMN_MAP.keys())


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def find_external_db() -> Path | None:
    """Locate the external nber_papers.db."""
    for candidate in EXTERNAL_DB_CANDIDATES:
        if candidate.exists():
            return candidate
    return None


def card_file_exists(paper_id: str) -> bool:
    """Check if a card markdown file exists for the given paper_id."""
    return (CARDS_DIR / f"{paper_id}.md").exists()


def parse_field_tags(field_tags_raw: str | None) -> str | None:
    """Convert field_tags string to a JSON array for the fields column.

    The field_tags column in the external DB is stored as a comma-separated
    string (e.g. 'Labor Economics, Technology & Innovation').  Sometimes it
    may already be a JSON array.
    """
    if not field_tags_raw:
        return None

    # Try JSON first
    try:
        parsed = json.loads(field_tags_raw)
        if isinstance(parsed, list):
            return json.dumps(parsed)
    except (json.JSONDecodeError, TypeError):
        pass

    # Fall back to comma-separated
    tags = [t.strip() for t in field_tags_raw.split(",") if t.strip()]
    return json.dumps(tags) if tags else None


# ---------------------------------------------------------------------------
# Step 1: Import paper metadata
# ---------------------------------------------------------------------------

def step1_import_papers(kb_conn: sqlite3.Connection, ext_conn: sqlite3.Connection) -> dict:
    """Import paper metadata from external DB into kb.db.

    Only inserts papers that do NOT already exist in kb.db.
    Returns stats dict.
    """
    print("\n" + "=" * 60)
    print("STEP 1: Import paper metadata from external DB")
    print("=" * 60)

    # Get existing paper_ids in kb.db
    existing = {
        row[0]
        for row in kb_conn.execute("SELECT paper_id FROM papers").fetchall()
    }
    print(f"  Papers already in kb.db: {len(existing)}")

    # Read all papers from external DB
    ext_columns = {
        col[1] for col in ext_conn.execute("PRAGMA table_info(papers)").fetchall()
    }

    select_cols = "paper_id, year, field_tags, triage_decision"
    if "triage_summary" in ext_columns:
        select_cols += ", triage_summary"
    if "authors" in ext_columns:
        select_cols += ", authors"

    rows = ext_conn.execute(f"SELECT {select_cols} FROM papers").fetchall()
    print(f"  Papers in external DB: {len(rows)}")

    inserted = 0
    skipped = 0
    errors = 0

    for row in rows:
        paper_id = row["paper_id"]

        if paper_id in existing:
            skipped += 1
            continue

        try:
            fields = parse_field_tags(row["field_tags"])
            triage_decision = row["triage_decision"]
            triage_summary = row["triage_summary"] if "triage_summary" in ext_columns else None
            year = row["year"]
            has_card = 1 if card_file_exists(paper_id) else 0

            # Parse authors if available
            authors = None
            if "authors" in ext_columns and row["authors"]:
                raw_authors = row["authors"]
                # Could be JSON array or comma-separated
                try:
                    parsed = json.loads(raw_authors)
                    if isinstance(parsed, list):
                        authors = raw_authors
                except (json.JSONDecodeError, TypeError):
                    authors = json.dumps([a.strip() for a in raw_authors.split(",") if a.strip()])

            kb_conn.execute(
                """INSERT OR IGNORE INTO papers
                   (paper_id, year, authors, fields, triage_decision,
                    triage_summary, has_card)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (paper_id, year, authors, fields, triage_decision,
                 triage_summary, has_card),
            )
            inserted += 1
        except Exception as e:
            errors += 1
            if errors <= 5:
                print(f"  ERROR on {paper_id}: {e}")

    kb_conn.commit()

    stats = {"inserted": inserted, "skipped": skipped, "errors": errors}
    print(f"  -> Inserted: {inserted}, Skipped (already exist): {skipped}, Errors: {errors}")
    return stats


# ---------------------------------------------------------------------------
# Step 2: Import scores
# ---------------------------------------------------------------------------

def step2_import_scores(kb_conn: sqlite3.Connection, ext_conn: sqlite3.Connection) -> dict:
    """Import score columns from external DB into paper_scores table.

    Also computes and updates average_score in the papers table.
    Returns stats dict.
    """
    print("\n" + "=" * 60)
    print("STEP 2: Import scores from external DB")
    print("=" * 60)

    # Check which score columns actually exist in the external DB
    ext_columns = {
        col[1] for col in ext_conn.execute("PRAGMA table_info(papers)").fetchall()
    }
    available_score_cols = [c for c in SCORE_COLUMNS if c in ext_columns]
    print(f"  Score columns available: {len(available_score_cols)}/{len(SCORE_COLUMNS)}")

    if not available_score_cols:
        print("  No score columns found in external DB, skipping.")
        return {"papers_with_scores": 0, "scores_inserted": 0, "averages_updated": 0}

    # Build SELECT for score columns
    cols_str = ", ".join(available_score_cols)
    rows = ext_conn.execute(
        f"SELECT paper_id, {cols_str} FROM papers"
    ).fetchall()

    papers_with_scores = 0
    scores_inserted = 0
    averages_updated = 0
    errors = 0

    for row in rows:
        paper_id = row["paper_id"]
        paper_scores = []

        for col in available_score_cols:
            value = row[col]
            if value is not None:
                dimension = SCORE_COLUMN_MAP[col]
                paper_scores.append((dimension, value))

        if not paper_scores:
            continue

        papers_with_scores += 1

        try:
            for dimension, score in paper_scores:
                kb_conn.execute(
                    """INSERT OR REPLACE INTO paper_scores
                       (paper_id, dimension, score) VALUES (?, ?, ?)""",
                    (paper_id, dimension, int(round(score))),
                )
                scores_inserted += 1

            # Compute average and update papers table
            avg_score = sum(s for _, s in paper_scores) / len(paper_scores)
            kb_conn.execute(
                "UPDATE papers SET average_score = ? WHERE paper_id = ?",
                (round(avg_score, 2), paper_id),
            )
            averages_updated += 1

        except Exception as e:
            errors += 1
            if errors <= 5:
                print(f"  ERROR on {paper_id}: {e}")

    kb_conn.commit()

    stats = {
        "papers_with_scores": papers_with_scores,
        "scores_inserted": scores_inserted,
        "averages_updated": averages_updated,
        "errors": errors,
    }
    print(f"  -> Papers with scores: {papers_with_scores}")
    print(f"  -> Individual scores inserted: {scores_inserted}")
    print(f"  -> Average scores updated: {averages_updated}")
    if errors:
        print(f"  -> Errors: {errors}")
    return stats


# ---------------------------------------------------------------------------
# Step 3: Run standard ingestion pipeline
# ---------------------------------------------------------------------------

def step3_run_ingestion() -> None:
    """Run the standard ingest.py pipeline to parse cards, atoms, etc."""
    print("\n" + "=" * 60)
    print("STEP 3: Run standard ingestion pipeline")
    print("=" * 60)

    from ingest import run_ingestion
    run_ingestion()


# ---------------------------------------------------------------------------
# Step 4: Recompute embeddings
# ---------------------------------------------------------------------------

def step4_recompute_embeddings() -> dict:
    """Recompute embeddings for all papers and atoms."""
    print("\n" + "=" * 60)
    print("STEP 4: Recompute embeddings")
    print("=" * 60)

    import logging
    logging.basicConfig(level=logging.INFO)

    from embeddings import compute_paper_embeddings, compute_atom_embeddings

    print("  Computing paper embeddings...")
    n_papers = compute_paper_embeddings()
    print(f"  -> {n_papers} paper embeddings computed")

    print("  Computing atom embeddings...")
    n_atoms = compute_atom_embeddings()
    print(f"  -> {n_atoms} atom embeddings computed")

    return {"paper_embeddings": n_papers, "atom_embeddings": n_atoms}


# ---------------------------------------------------------------------------
# Final summary
# ---------------------------------------------------------------------------

def print_final_summary(kb_conn: sqlite3.Connection) -> None:
    """Print summary statistics from kb.db."""
    print("\n" + "=" * 60)
    print("FINAL DATABASE SUMMARY")
    print("=" * 60)

    tables = [
        "papers", "paper_scores", "card_sections", "atoms",
        "atom_paper_refs", "field_maps", "ideas", "triage_cards",
        "digests", "embeddings",
    ]
    for table in tables:
        try:
            row = kb_conn.execute(f"SELECT COUNT(*) as c FROM {table}").fetchone()
            print(f"  {table}: {row['c']} rows")
        except sqlite3.OperationalError:
            print(f"  {table}: (table not found)")

    # Papers breakdown
    row = kb_conn.execute("SELECT COUNT(*) as c FROM papers WHERE has_card = 1").fetchone()
    print(f"\n  Papers with cards: {row['c']}")
    row = kb_conn.execute("SELECT COUNT(*) as c FROM papers WHERE has_card = 0 OR has_card IS NULL").fetchone()
    print(f"  Papers without cards: {row['c']}")
    row = kb_conn.execute("SELECT COUNT(*) as c FROM papers WHERE average_score IS NOT NULL").fetchone()
    print(f"  Papers with scores: {row['c']}")
    row = kb_conn.execute("SELECT COUNT(*) as c FROM papers WHERE triage_decision IS NOT NULL").fetchone()
    print(f"  Papers with triage decisions: {row['c']}")

    # Embeddings breakdown
    try:
        row = kb_conn.execute("SELECT COUNT(*) as c FROM embeddings WHERE entity_type = 'paper'").fetchone()
        print(f"  Paper embeddings: {row['c']}")
        row = kb_conn.execute("SELECT COUNT(*) as c FROM embeddings WHERE entity_type = 'atom'").fetchone()
        print(f"  Atom embeddings: {row['c']}")
    except sqlite3.OperationalError:
        pass

    # Search index
    try:
        row = kb_conn.execute("SELECT COUNT(*) as c FROM search_index").fetchone()
        print(f"  Search index entries: {row['c']}")
    except sqlite3.OperationalError:
        pass


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    start_time = time.time()

    print("=" * 60)
    print("NBER Knowledge Base Migration")
    print("=" * 60)
    print(f"Project root:    {PROJECT_ROOT}")
    print(f"Backend dir:     {BACKEND_DIR}")
    print(f"Cards dir:       {CARDS_DIR}")
    print(f"KB database:     {KB_DB_PATH}")

    # Locate external DB
    ext_db_path = find_external_db()
    if ext_db_path is None:
        print("\nERROR: Could not find external database.")
        print("  Looked in:")
        for p in EXTERNAL_DB_CANDIDATES:
            print(f"    {p}")
        sys.exit(1)
    print(f"External DB:     {ext_db_path}")

    # Verify cards directory
    if CARDS_DIR.exists():
        card_count = len(list(CARDS_DIR.glob("w*.md")))
        print(f"Card files:      {card_count}")
    else:
        print("WARNING: Cards directory not found")
        card_count = 0

    # Initialize kb.db schema (safe to call multiple times)
    from database import init_db
    print("\nInitializing database schema...")
    init_db()

    # Open connections
    kb_conn = sqlite3.connect(str(KB_DB_PATH))
    kb_conn.row_factory = sqlite3.Row
    kb_conn.execute("PRAGMA journal_mode=WAL")
    kb_conn.execute("PRAGMA foreign_keys=ON")

    ext_conn = sqlite3.connect(str(ext_db_path))
    ext_conn.row_factory = sqlite3.Row

    # Pre-migration counts
    pre_papers = kb_conn.execute("SELECT COUNT(*) as c FROM papers").fetchone()["c"]
    pre_scores = kb_conn.execute("SELECT COUNT(*) as c FROM paper_scores").fetchone()["c"]
    print(f"\nPre-migration: {pre_papers} papers, {pre_scores} scores in kb.db")

    # Step 1: Import paper metadata
    step1_stats = step1_import_papers(kb_conn, ext_conn)

    # Step 2: Import scores
    step2_stats = step2_import_scores(kb_conn, ext_conn)

    # Close external DB
    ext_conn.close()
    kb_conn.close()

    # Step 3: Run standard ingestion (re-parses cards, atoms, triage, etc.)
    step3_run_ingestion()

    # Step 4: Recompute embeddings
    step4_stats = step4_recompute_embeddings()

    # Final summary
    kb_conn = sqlite3.connect(str(KB_DB_PATH))
    kb_conn.row_factory = sqlite3.Row
    print_final_summary(kb_conn)

    # Post-migration counts
    post_papers = kb_conn.execute("SELECT COUNT(*) as c FROM papers").fetchone()["c"]
    post_scores = kb_conn.execute("SELECT COUNT(*) as c FROM paper_scores").fetchone()["c"]
    kb_conn.close()

    elapsed = time.time() - start_time

    print("\n" + "=" * 60)
    print("MIGRATION COMPLETE")
    print("=" * 60)
    print(f"  Time elapsed:       {elapsed:.1f}s")
    print(f"  Papers before:      {pre_papers}")
    print(f"  Papers after:       {post_papers}")
    print(f"  New papers added:   {step1_stats['inserted']}")
    print(f"  Scores before:      {pre_scores}")
    print(f"  Scores after:       {post_scores}")
    print(f"  Paper embeddings:   {step4_stats['paper_embeddings']}")
    print(f"  Atom embeddings:    {step4_stats['atom_embeddings']}")
    if step1_stats["errors"] or step2_stats.get("errors", 0):
        print(f"  Step 1 errors:      {step1_stats['errors']}")
        print(f"  Step 2 errors:      {step2_stats.get('errors', 0)}")
    print("=" * 60)


if __name__ == "__main__":
    main()
