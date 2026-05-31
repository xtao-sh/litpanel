#!/usr/bin/env python3
"""Remove plaintext API keys from a kb.db before sharing or distributing it.

The app's Setup page stores provider API keys in kb.db (ai_provider_settings).
kb.db is gitignored so it never reaches GitHub, but if you ever hand someone the
file directly (or bundle it into a desktop build), the key travels with it. Run
this first to null those keys; the runtime falls back to the key in the
environment / backend/.env, so a scrubbed DB still works locally.

Usage:
    # scrub a copy, leaving the original untouched (recommended for sharing):
    python scripts/scrub_secrets.py backend/kb.db backend/kb.shared.db

    # scrub in place (a .bak backup is written next to it):
    python scripts/scrub_secrets.py backend/kb.db
"""
from __future__ import annotations

import shutil
import sqlite3
import sys
from pathlib import Path

# (table, column) pairs that may hold plaintext secrets.
SECRET_COLUMNS = [
    ("ai_provider_settings", "api_key"),
]


def _table_exists(conn: sqlite3.Connection, table: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table,)
    ).fetchone()
    return row is not None


def scrub(db_path: Path) -> int:
    conn = sqlite3.connect(str(db_path))
    cleared = 0
    try:
        for table, column in SECRET_COLUMNS:
            if not _table_exists(conn, table):
                continue
            cols = {r[1] for r in conn.execute(f"PRAGMA table_info({table})")}
            if column not in cols:
                continue
            cur = conn.execute(
                f"UPDATE {table} SET {column} = '' "
                f"WHERE {column} IS NOT NULL AND {column} != ''"
            )
            cleared += cur.rowcount
        conn.commit()
        # Critical: a plain UPDATE leaves the old secret in the DB file's free
        # pages, so it is still recoverable with `grep`/strings. VACUUM rewrites
        # the file and physically discards the freed pages.
        conn.isolation_level = None
        conn.execute("VACUUM")
    finally:
        conn.close()
    return cleared


def main(argv: list[str]) -> int:
    if not argv or argv[0] in {"-h", "--help"}:
        print(__doc__)
        return 0

    src = Path(argv[0]).expanduser()
    if not src.is_file():
        print(f"error: {src} not found", file=sys.stderr)
        return 1

    if len(argv) >= 2:
        dest = Path(argv[1]).expanduser()
        shutil.copy2(src, dest)
        target = dest
        print(f"Copied {src} -> {dest}")
    else:
        backup = src.with_suffix(src.suffix + ".bak")
        shutil.copy2(src, backup)
        target = src
        print(f"Backed up {src} -> {backup}")

    n = scrub(target)
    print(f"Scrubbed {n} secret value(s) from {target}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
