"""Backfill paper titles for papers missing them using NBER API."""
import sqlite3
import requests
import time
import re
import logging

def backfill_from_nber_api(batch_size=100, max_batches=5):
    """Fetch titles from NBER API for papers that lack them."""
    conn = sqlite3.connect('kb.db')

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

        # Try NBER API search
        for row in batch:
            pid = row[0]
            # Extract number from paper_id (e.g., w31161 -> 31161)
            num = re.search(r'\d+', pid)
            if not num:
                continue

            try:
                # Fetch paper page from NBER
                url = f"https://www.nber.org/papers/{pid}"
                resp = requests.get(url, timeout=10, headers={'User-Agent': 'Mozilla/5.0'})
                if resp.status_code == 200:
                    # Extract title from HTML <title> tag
                    title_match = re.search(r'<title>(.*?)</title>', resp.text)
                    if title_match:
                        title = title_match.group(1).strip()
                        # Clean up: remove "| NBER" suffix
                        title = re.sub(r'\s*\|\s*NBER\s*$', '', title)
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
    backfill_from_nber_api(batch_size=50, max_batches=3)  # Process 150 papers as a start
