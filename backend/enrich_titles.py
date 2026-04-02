"""Backfill paper titles from triage_cards into the papers table."""
import sqlite3
import logging

def enrich_titles():
    conn = sqlite3.connect('kb.db')

    # Count papers without titles
    missing = conn.execute("SELECT COUNT(*) FROM papers WHERE title IS NULL OR title = '' OR title = paper_id").fetchone()[0]
    print(f"Papers missing titles: {missing}")

    # Update from triage_cards
    updated = conn.execute("""
        UPDATE papers SET title = (
            SELECT tc.title FROM triage_cards tc WHERE tc.paper_id = papers.paper_id AND tc.title IS NOT NULL AND tc.title != ''
        ) WHERE (papers.title IS NULL OR papers.title = '' OR papers.title = papers.paper_id)
        AND EXISTS (SELECT 1 FROM triage_cards tc WHERE tc.paper_id = papers.paper_id AND tc.title IS NOT NULL AND tc.title != '')
    """).rowcount
    conn.commit()

    # Check result
    still_missing = conn.execute("SELECT COUNT(*) FROM papers WHERE title IS NULL OR title = '' OR title = paper_id").fetchone()[0]
    print(f"Updated {updated} titles. Still missing: {still_missing}")

    conn.close()

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    enrich_titles()
