"""Backfill paper titles for papers missing them using source landing pages."""
import sqlite3
import requests
import time
import re
import logging
from pathlib import Path

from config import KB_DB_PATH, SOURCE_NAME, SUPPORTS_REMOTE_DISCOVERY, build_paper_url


def backfill_titles_from_source(batch_size=100, max_batches=5):
    """Fetch titles from source landing pages for papers that lack them."""
    if not SUPPORTS_REMOTE_DISCOVERY:
        print("Remote source is disabled. Title backfill from source pages is unavailable.")
        return

    conn = sqlite3.connect(str(Path(KB_DB_PATH)))

    # Get papers without titles
    missing = conn.execute(
        "SELECT paper_id FROM papers WHERE (title IS NULL OR title = '' OR title = paper_id) LIMIT ?",
        (batch_size * max_batches,)
    ).fetchall()

    if not missing:
        print("All papers have titles!")
        conn.close()
        return

    print(f"Found {len(missing)} papers without titles. Processing...")

    updated = 0
    for i in range(0, len(missing), batch_size):
        batch = missing[i:i+batch_size]

        for row in batch:
            pid = row[0]

            try:
                url = build_paper_url(pid)
                resp = requests.get(url, timeout=10, headers={'User-Agent': 'Mozilla/5.0'})
                if resp.status_code == 200:
                    # Extract title from HTML <title> tag
                    title_match = re.search(r'<title>(.*?)</title>', resp.text)
                    if title_match:
                        title = title_match.group(1).strip()
                        # Clean up common site-brand suffixes from HTML titles.
                        source_suffix = re.escape(SOURCE_NAME)
                        title = re.sub(rf'\s*(?:\||-|–|—)\s*{source_suffix}\s*$', '', title)
                        if title and title != pid:
                            conn.execute("UPDATE papers SET title = ? WHERE paper_id = ?", (title, pid))
                            updated += 1
                            if updated % 10 == 0:
                                print(f"  Updated {updated} titles...")
                                conn.commit()

                time.sleep(0.5)  # Rate limit: 2 requests/sec

            except Exception as e:
                print(f"  Error for {pid}: {e}")
                continue

        conn.commit()
        print(f"  Batch {i//batch_size + 1}: {updated} total titles updated")

    conn.commit()
    still_missing = conn.execute("SELECT COUNT(*) FROM papers WHERE title IS NULL OR title = '' OR title = paper_id").fetchone()[0]
    print(f"Done. Updated {updated} titles. Still missing: {still_missing}")
    conn.close()

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    backfill_titles_from_source(batch_size=50, max_batches=3)
