"""Enrich papers with abstracts and source URLs."""
import sqlite3
import logging
from pathlib import Path

from config import KB_DB_PATH, build_paper_url

logger = logging.getLogger(__name__)

DB_PATH = Path(KB_DB_PATH)


def enrich_papers():
    db_path = str(DB_PATH)
    conn = sqlite3.connect(db_path)

    # 1. Set source URL for all papers
    missing_urls = conn.execute(
        "SELECT paper_id FROM papers WHERE nber_url IS NULL OR nber_url = ''"
    ).fetchall()
    if missing_urls:
        conn.executemany(
            "UPDATE papers SET nber_url = ? WHERE paper_id = ?",
            [(build_paper_url(row[0]), row[0]) for row in missing_urls],
        )

    # 2. For papers with card sections, use Research Question as abstract
    conn.execute("""
        UPDATE papers SET abstract = (
            SELECT SUBSTR(cs.content, 1, 800)
            FROM card_sections cs
            WHERE cs.paper_id = papers.paper_id
            AND cs.section = 'Research Question'
        ) WHERE abstract IS NULL AND has_card = 1
    """)

    # 3. For papers with triage cards, use summary as abstract
    conn.execute("""
        UPDATE papers SET abstract = (
            SELECT tc.summary
            FROM triage_cards tc
            WHERE tc.paper_id = papers.paper_id
        ) WHERE abstract IS NULL
    """)

    conn.commit()

    # Report
    total = conn.execute("SELECT COUNT(*) FROM papers").fetchone()[0]
    with_abstract = conn.execute(
        "SELECT COUNT(*) FROM papers WHERE abstract IS NOT NULL AND abstract != ''"
    ).fetchone()[0]
    with_url = conn.execute(
        "SELECT COUNT(*) FROM papers WHERE nber_url IS NOT NULL"
    ).fetchone()[0]
    print(f"Papers: {total} total, {with_abstract} with abstract, {with_url} with source URL")

    conn.close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    enrich_papers()
