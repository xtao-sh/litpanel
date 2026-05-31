"""
SQLite helper functions for nber_papers.db.
"""

import sqlite3
import os
from pathlib import Path
from typing import Optional

from agents.config import DB_PATH


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH), timeout=30)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.row_factory = sqlite3.Row
    return conn


# --- Schema migration ---

def ensure_columns():
    """Add columns needed by the new agent system if they don't exist."""
    new_columns = {
        "triage_decision": "TEXT",           # legacy Scout field
        "triage_summary": "TEXT",            # legacy Scout summary / metadata note
        "triaged_at": "TIMESTAMP",
        "completed_at": "TIMESTAMP",
        "linker_batch": "INTEGER",           # which Linker cycle processed this
        "reading_profile": "TEXT DEFAULT 'auto'",
        "analysis_focuses": "TEXT DEFAULT '[]'",
        "analysis_focus_prompts": "TEXT DEFAULT '{}'",
        "custom_reading_instructions": "TEXT DEFAULT ''",
    }
    conn = get_conn()
    cursor = conn.cursor()
    # Get existing columns
    cursor.execute("PRAGMA table_info(papers)")
    existing = {row["name"] for row in cursor.fetchall()}
    for col, col_type in new_columns.items():
        if col not in existing:
            cursor.execute(f"ALTER TABLE papers ADD COLUMN {col} {col_type}")
    conn.commit()
    conn.close()


# --- Queries ---

def _target_paper_ids() -> list[str]:
    raw = os.getenv("KB_TARGET_PAPER_IDS", "")
    return [item.strip() for item in raw.split(",") if item.strip()]


def _target_clause(params: list[object]) -> str:
    target_ids = _target_paper_ids()
    if not target_ids:
        return ""
    placeholders = ",".join("?" for _ in target_ids)
    params.extend(target_ids)
    return f" AND paper_id IN ({placeholders}) "


def get_pending_papers(limit: int = 50) -> list[dict]:
    """Get papers with status='pending', ordered by paper_id descending (newest first)."""
    conn = get_conn()
    params: list[object] = []
    target_clause = _target_clause(params)
    params.append(limit)
    rows = conn.execute(
        "SELECT paper_id, file_path, year, folder, reading_profile, analysis_focuses, "
        "analysis_focus_prompts, custom_reading_instructions "
        "FROM papers "
        "WHERE status = 'pending' "
        "AND COALESCE(reading_profile, 'auto') != 'metadata_only' "
        f"{target_clause}"
        "ORDER BY paper_id DESC LIMIT ?",
        params,
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_triaged_for_reading(limit: int = 10) -> list[dict]:
    """Get papers ready for Reader.

    New reads no longer run Scout relevance triage.  Legacy triaged rows are
    still included so older imported papers can be re-read.
    """
    conn = get_conn()
    params: list[object] = []
    target_clause = _target_clause(params)
    params.append(limit)
    rows = conn.execute(
        "SELECT paper_id, file_path, year, folder, reading_profile, analysis_focuses, "
        "analysis_focus_prompts, custom_reading_instructions, triage_decision "
        "FROM papers "
        "WHERE status IN ('pending', 'triaged') "
        "AND COALESCE(reading_profile, 'auto') != 'metadata_only' "
        f"{target_clause}"
        "ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, paper_id DESC LIMIT ?",
        params,
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def count_new_cards_since_last_linker() -> int:
    """Count completed papers that haven't been processed by Linker yet."""
    conn = get_conn()
    row = conn.execute(
        "SELECT COUNT(*) as cnt FROM papers "
        "WHERE status = 'completed' AND linker_batch IS NULL"
    ).fetchone()
    conn.close()
    return row["cnt"]


def get_unlinked_papers() -> list[dict]:
    """Get completed papers not yet processed by Linker."""
    conn = get_conn()
    rows = conn.execute(
        "SELECT paper_id, file_path, year, folder, field_tags, key_contribution "
        "FROM papers WHERE status = 'completed' AND linker_batch IS NULL "
        "ORDER BY paper_id DESC"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def update_paper_triage(paper_id: str, decision: str, relevance: float,
                        field_tags: str, summary: str):
    """Update a paper after Scout triage."""
    conn = get_conn()
    conn.execute(
        "UPDATE papers SET status = 'triaged', triage_decision = ?, "
        "relevance_score = ?, field_tags = ?, triage_summary = ?, "
        "triaged_at = datetime('now') WHERE paper_id = ?",
        (decision, relevance, field_tags, summary, paper_id)
    )
    conn.commit()
    conn.close()


def update_paper_completed(paper_id: str, scores: dict, key_contribution: str,
                           field_tags: str):
    """Update a paper after Reader deep-read.

    Stores all 15-dimension scores into the paper_scores table
    (paper_id, dimension, score) and computes an average for the papers table.
    """
    conn = get_conn()

    # Compute average score across all dimensions
    avg_score = None
    if scores:
        avg_score = round(sum(scores.values()) / len(scores), 2)

    # Keep relevance_score for existing list sorting, but make it a general
    # scholarly score rather than a personal-interest triage signal.
    relevance = scores.get(
        "scholarly_relevance",
        scores.get("relevance_to_field", scores.get("relevance", avg_score)),
    )
    conn.execute(
        "UPDATE papers SET status = 'completed', "
        "relevance_score = ?, key_contribution = ?, field_tags = ?, "
        "completed_at = datetime('now') WHERE paper_id = ?",
        (relevance, key_contribution, field_tags, paper_id)
    )

    # Ensure paper_scores table exists (agent DB may differ from backend DB)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS paper_scores ("
        "paper_id TEXT NOT NULL, dimension TEXT, score INTEGER, "
        "PRIMARY KEY (paper_id, dimension))"
    )

    # Store every parsed dimension into paper_scores
    for dimension, score in scores.items():
        conn.execute(
            "INSERT OR REPLACE INTO paper_scores (paper_id, dimension, score) "
            "VALUES (?, ?, ?)",
            (paper_id, dimension, score)
        )

    conn.commit()
    conn.close()


def update_paper_status(paper_id: str, status: str):
    """Set paper status (for error handling)."""
    conn = get_conn()
    conn.execute(
        "UPDATE papers SET status = ?, updated_at = datetime('now') WHERE paper_id = ?",
        (status, paper_id)
    )
    conn.commit()
    conn.close()


def reset_errors_for_retry():
    """Reset API-error papers for retry. Do NOT reset pdf_error (permanent).

    Only resets papers with status='error' (API failures, timeouts, etc.)
    that are older than 1 hour. Papers with status='pdf_error' are corrupt
    files that should never be retried.
    """
    conn = get_conn()
    conn.execute(
        "UPDATE papers SET status = 'pending' "
        "WHERE status = 'error' "
        "AND updated_at < datetime('now', '-1 hour')"
    )
    count = conn.execute("SELECT changes()").fetchone()[0]
    conn.commit()
    conn.close()
    return count


def mark_linker_batch(paper_ids: list[str], batch_number: int):
    """Mark papers as processed by a Linker batch."""
    conn = get_conn()
    placeholders = ",".join("?" * len(paper_ids))
    conn.execute(
        f"UPDATE papers SET linker_batch = ? WHERE paper_id IN ({placeholders})",
        [batch_number] + paper_ids
    )
    conn.commit()
    conn.close()


def get_next_linker_batch_number() -> int:
    conn = get_conn()
    row = conn.execute("SELECT MAX(linker_batch) as mx FROM papers").fetchone()
    conn.close()
    return (row["mx"] or 0) + 1


def get_stats() -> dict:
    """Get current system statistics."""
    conn = get_conn()
    stats = {}
    for status in ["pending", "triaged", "completed", "error", "pdf_error", "timeout"]:
        row = conn.execute(
            "SELECT COUNT(*) as cnt FROM papers WHERE status = ?", (status,)
        ).fetchone()
        stats[status] = row["cnt"]

    # Count by triage decision
    for decision in ["DEEP_READ", "SKIM", "SKIP"]:
        row = conn.execute(
            "SELECT COUNT(*) as cnt FROM papers WHERE triage_decision = ?", (decision,)
        ).fetchone()
        stats[f"triage_{decision}"] = row["cnt"]

    stats["total"] = sum(v for k, v in stats.items()
                         if k in ["pending", "triaged", "completed", "error", "pdf_error", "timeout"])
    conn.close()
    return stats
