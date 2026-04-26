"""
Paper ingestion pipeline: discover -> download -> process -> refresh website DB.

Supports three modes:
1. Discover new papers via an optional remote source and process them
2. Process a specific paper by ID (download from the configured source)
3. Process an uploaded PDF file
"""

from __future__ import annotations

import logging
import hashlib
import json
import os
import re
import sqlite3
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional

import requests
import resolvers

from config import (
    AGENT_DB_PATH,
    AGENTS_DIR,
    KB_DB_PATH,
    PAPERS_DIR,
    REMOTE_DISCOVERY_API_URL,
    REMOTE_DISCOVERY_LABEL,
    REMOTE_PDF_URL_TEMPLATE,
    REMOTE_SOURCE_KIND,
    SOURCE_NAME,
    SUPPORTS_REMOTE_DISCOVERY,
    build_paper_url,
)
from database import (
    add_import_batch_file,
    attach_paper_to_library,
    create_import_batch,
    ensure_default_library,
    finalize_import_batch,
    get_connection,
    get_paper_processing_state,
    get_library,
    is_duplicate_file_for_library,
    library_exists,
    list_import_batches,
    purge_library_index_data,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Maximum upload size: 50 MB
MAX_UPLOAD_BYTES = 50 * 1024 * 1024

# Agent subprocess timeout: 10 minutes
AGENT_TIMEOUT_SECONDS = 600

READING_PROFILE_CONFIG: dict[str, dict[str, object]] = {
    "auto": {
        "label": "Auto",
        "description": "Use scout triage first, then deep-read only when the paper looks worth expanding.",
        "run_scout": True,
        "reader_mode": "auto",
    },
    "metadata_only": {
        "label": "Metadata Only",
        "description": "Register the paper only, without running AI reading.",
        "run_scout": False,
        "reader_mode": "never",
    },
    "title_abstract": {
        "label": "Title + Abstract",
        "description": "Read lightweight signals and produce a scout-level summary only.",
        "run_scout": True,
        "reader_mode": "never",
    },
    "full_content": {
        "label": "Full Content",
        "description": "Read the full paper content and extract structured knowledge.",
        "run_scout": True,
        "reader_mode": "always",
    },
    "style_logic": {
        "label": "Style + Logic",
        "description": "Read the full paper and pay extra attention to argument structure and writing style.",
        "run_scout": True,
        "reader_mode": "always",
    },
}

ANALYSIS_FOCUS_OPTIONS: dict[str, dict[str, str]] = {
    "title_abstract": {
        "label": "Title & abstract",
        "description": "Capture the paper's headline framing and concise summary.",
    },
    "research_question": {
        "label": "Research question",
        "description": "Focus on what problem the paper is actually trying to answer.",
    },
    "methods_data": {
        "label": "Methods & data",
        "description": "Focus on identification strategy, methodology, and datasets.",
    },
    "findings": {
        "label": "Findings",
        "description": "Focus on core results, conclusions, and claimed contributions.",
    },
    "writing_style": {
        "label": "Writing style",
        "description": "Focus on tone, exposition style, and how the paper is written.",
    },
    "argument_logic": {
        "label": "Argument logic",
        "description": "Focus on reasoning flow, assumptions, and causal logic.",
    },
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _extract_year(paper_id: str) -> Optional[int]:
    """Guess the year from a paper_id like w35000 based on NBER numbering.

    This is a rough heuristic.  We fall back to the current year when we
    cannot determine a value.
    """
    return datetime.now().year


def _ensure_remote_discovery_enabled() -> None:
    if not SUPPORTS_REMOTE_DISCOVERY or REMOTE_SOURCE_KIND in {"", "none", "local"}:
        raise RuntimeError(
            "Remote discovery is disabled. Import PDFs locally or configure a remote source in backend/.env."
        )


def _build_remote_pdf_url(paper_id: str) -> str:
    try:
        return REMOTE_PDF_URL_TEMPLATE.format(pid=paper_id, paper_id=paper_id)
    except KeyError:
        return REMOTE_PDF_URL_TEMPLATE


def _resolve_library_runtime(library_id: int | None) -> dict:
    resolved_library_id = library_id or ensure_default_library()
    library = get_library(resolved_library_id)
    if library is None:
        raise RuntimeError("Library not found.")
    return {
        "id": resolved_library_id,
        "name": str(library["name"]),
        "papers_dir": Path(str(library["papers_dir"])).expanduser(),
        "knowledge_base_dir": Path(str(library["knowledge_base_dir"])).expanduser(),
        "agent_db_path": Path(str(library["agent_db_path"])).expanduser(),
    }


def normalize_reading_profile(reading_profile: str | None) -> str:
    key = (reading_profile or "auto").strip().lower()
    if key not in READING_PROFILE_CONFIG:
        return "auto"
    return key


def normalize_analysis_focuses(analysis_focuses: list[str] | None) -> list[str]:
    if not analysis_focuses:
        return []
    normalized: list[str] = []
    seen: set[str] = set()
    for raw in analysis_focuses:
        key = str(raw).strip().lower()
        if not key or key not in ANALYSIS_FOCUS_OPTIONS or key in seen:
            continue
        seen.add(key)
        normalized.append(key)
    return normalized


def get_pipeline_options() -> dict[str, list[dict[str, object]]]:
    reading_profiles = [
        {"value": key, **value}
        for key, value in READING_PROFILE_CONFIG.items()
    ]
    analysis_focuses = [
        {"value": key, **value}
        for key, value in ANALYSIS_FOCUS_OPTIONS.items()
    ]
    return {
        "reading_profiles": reading_profiles,
        "analysis_focuses": analysis_focuses,
    }


def _should_run_reader(reading_profile: str, triage_decision: str | None) -> bool:
    profile_key = normalize_reading_profile(reading_profile)
    reader_mode = str(READING_PROFILE_CONFIG[profile_key]["reader_mode"])
    if reader_mode == "always":
        return True
    if reader_mode == "never":
        return False
    return (triage_decision or "").upper() == "DEEP_READ"


def _agent_env(runtime: dict) -> dict[str, str]:
    env = os.environ.copy()
    env["KB_DB_PATH"] = str(KB_DB_PATH)
    env["KB_LIBRARY_ID"] = str(runtime["id"])
    env["KB_AGENT_DB_PATH"] = str(runtime["agent_db_path"])
    env["AGENT_DB_PATH"] = str(runtime["agent_db_path"])
    env["KB_CONTENT_ROOT"] = str(runtime["knowledge_base_dir"])
    env["KNOWLEDGE_BASE_DIR"] = str(runtime["knowledge_base_dir"])
    env["KB_AGENT_PROJECT_ROOT"] = str(runtime["knowledge_base_dir"].parent)
    env["EXISTING_AGENT_DB_PATHS"] = str(runtime["agent_db_path"])
    env["KB_EXISTING_AGENT_DB_PATHS"] = str(runtime["agent_db_path"])
    return env


def _ensure_agent_db_schema(agent_db_path: Path) -> None:
    agent_db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(agent_db_path))
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS papers (
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
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        existing_columns = {
            row[1]
            for row in conn.execute("PRAGMA table_info(papers)").fetchall()
        }
        if "reading_profile" not in existing_columns:
            conn.execute(
                "ALTER TABLE papers ADD COLUMN reading_profile TEXT DEFAULT 'auto'"
            )
        if "analysis_focuses" not in existing_columns:
            conn.execute(
                "ALTER TABLE papers ADD COLUMN analysis_focuses TEXT DEFAULT '[]'"
            )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_agent_papers_status ON papers(status)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_agent_papers_folder ON papers(folder)"
        )
        conn.commit()
    finally:
        conn.close()


def _get_agent_db(agent_db_path: Path) -> sqlite3.Connection:
    """Open a connection to the agent database."""
    conn = sqlite3.connect(str(agent_db_path))
    conn.row_factory = sqlite3.Row
    return conn


def _paper_exists(paper_id: str, agent_db_path: Path | None = None) -> bool:
    """Check whether a paper is already registered in the agent DB."""
    resolved_db_path = agent_db_path or AGENT_DB_PATH
    if not resolved_db_path.exists():
        return False
    conn = _get_agent_db(resolved_db_path)
    try:
        row = conn.execute(
            "SELECT 1 FROM papers WHERE paper_id = ?", (paper_id,)
        ).fetchone()
        return row is not None
    finally:
        conn.close()


def _get_agent_paper(paper_id: str, agent_db_path: Path) -> sqlite3.Row | None:
    conn = _get_agent_db(agent_db_path)
    try:
        return conn.execute(
            "SELECT * FROM papers WHERE paper_id = ?",
            (paper_id,),
        ).fetchone()
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# 1. Discover new papers
# ---------------------------------------------------------------------------

def discover_new_papers(limit: int = 20) -> list[dict]:
    """Fetch recent papers from the configured remote source.

    Returns a list of dicts with keys: paper_id, title, authors, url.
    """
    _ensure_remote_discovery_enabled()

    try:
        resp = requests.get(
            REMOTE_DISCOVERY_API_URL,
            params={"page": 1, "perPage": limit},
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
    except requests.RequestException as exc:
        logger.error("%s API request failed: %s", REMOTE_DISCOVERY_LABEL, exc)
        return []

    # The API returns results under various possible keys; try to
    # handle the most common shapes.
    results: list[dict] = []
    items = []
    if isinstance(data, dict):
        # Try common response shapes
        items = (
            data.get("results", [])
            or data.get("data", [])
            or data.get("items", [])
            or data.get("records", [])
        )
        if not items and isinstance(data, list):
            items = data
    elif isinstance(data, list):
        items = data

    for item in items:
        if not isinstance(item, dict):
            continue

        # Extract paper_id from URL like "/papers/w34971" or the item itself
        paper_id = ""
        url = item.get("url", "") or item.get("path", "") or ""
        m = re.search(r"(w\d{4,6})", url)
        if m:
            paper_id = m.group(1)
        elif item.get("paper_id"):
            paper_id = item["paper_id"]
        elif item.get("id"):
            pid = str(item["id"])
            if pid.startswith("w"):
                paper_id = pid
            else:
                paper_id = f"w{pid}"

        if not paper_id:
            continue

        # Skip papers we already have
        if _paper_exists(paper_id):
            continue

        title = item.get("title", "")
        authors_raw = item.get("authors", [])
        if isinstance(authors_raw, list):
            authors = ", ".join(
                a.get("name", str(a)) if isinstance(a, dict) else str(a)
                for a in authors_raw
            )
        else:
            authors = str(authors_raw)

        results.append({
            "paper_id": paper_id,
            "title": title,
            "authors": authors,
            "url": build_paper_url(paper_id),
        })

    return results


# ---------------------------------------------------------------------------
# 2. Download paper
# ---------------------------------------------------------------------------

def download_paper(paper_id: str, papers_dir: Path) -> Path:
    """Download a paper PDF from the configured remote source.

    If the file already exists locally it is returned immediately.
    """
    _ensure_remote_discovery_enabled()
    papers_dir.mkdir(parents=True, exist_ok=True)
    pdf_path = papers_dir / f"{paper_id}.pdf"

    if pdf_path.exists():
        logger.info("PDF already cached: %s", pdf_path)
        return pdf_path

    url = _build_remote_pdf_url(paper_id)
    logger.info("Downloading %s ...", url)

    try:
        resp = requests.get(url, timeout=60)
        resp.raise_for_status()
    except requests.RequestException as exc:
        raise RuntimeError(f"Failed to download {paper_id}: {exc}") from exc

    pdf_path.write_bytes(resp.content)
    logger.info("Saved %s (%d bytes)", pdf_path, len(resp.content))
    return pdf_path


# ---------------------------------------------------------------------------
# 3. Register paper in agent DB
# ---------------------------------------------------------------------------

def register_paper(
    paper_id: str,
    pdf_path: Path,
    library_id: int,
    agent_db_path: Path,
    title: str = "",
    authors: str = "",
    reading_profile: str = "auto",
    analysis_focuses: list[str] | None = None,
) -> bool:
    """Register a paper in the agent database as pending."""
    _ensure_agent_db_schema(agent_db_path)
    normalized_profile = normalize_reading_profile(reading_profile)
    normalized_focuses = normalize_analysis_focuses(analysis_focuses)

    conn = _get_agent_db(agent_db_path)
    try:
        conn.execute(
            "INSERT OR IGNORE INTO papers "
            "(paper_id, file_path, status, year, folder, title, authors, reading_profile, analysis_focuses) "
            "VALUES (?, ?, 'pending', ?, ?, ?, ?, ?, ?)",
            (
                paper_id,
                str(pdf_path),
                _extract_year(paper_id),
                f"library:{library_id}",
                title,
                authors,
                normalized_profile,
                json.dumps(normalized_focuses),
            ),
        )
        conn.execute(
            "UPDATE papers SET file_path = ?, year = ?, folder = ?, title = ?, authors = ?, "
            "reading_profile = ?, analysis_focuses = ?, "
            "status = CASE WHEN ? = 'metadata_only' THEN 'triaged' ELSE 'pending' END, "
            "triage_decision = CASE WHEN ? = 'metadata_only' THEN 'SKIP' ELSE NULL END, "
            "triage_summary = CASE WHEN ? = 'metadata_only' THEN 'Stored without AI reading (metadata only).' ELSE NULL END, "
            "triaged_at = CASE WHEN ? = 'metadata_only' THEN CURRENT_TIMESTAMP ELSE NULL END, "
            "completed_at = NULL, linker_batch = NULL, updated_at = CURRENT_TIMESTAMP "
            "WHERE paper_id = ?",
            (
                str(pdf_path),
                _extract_year(paper_id),
                f"library:{library_id}",
                title,
                authors,
                normalized_profile,
                json.dumps(normalized_focuses),
                normalized_profile,
                normalized_profile,
                normalized_profile,
                normalized_profile,
                paper_id,
            ),
        )
        conn.commit()
        logger.info("Registered paper %s as pending", paper_id)
        return True
    except Exception as exc:
        logger.error("Failed to register %s: %s", paper_id, exc)
        return False
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# 4. Run agent pipeline (subprocess)
# ---------------------------------------------------------------------------

def run_agent_pipeline(
    agent: str = "full-cycle",
    batch_size: int = 10,
    runtime: dict | None = None,
) -> dict:
    """Run the agent pipeline as a subprocess.  Returns result summary."""
    resolved_runtime = runtime or _resolve_library_runtime(None)
    cmd = [
        sys.executable,
        "-m",
        "agents.orchestrator",
        "--agent",
        agent,
        "--batch-size",
        str(batch_size),
    ]
    logger.info("Running agent pipeline: %s", " ".join(cmd))

    try:
        result = subprocess.run(
            cmd,
            cwd=str(AGENTS_DIR.parent),
            capture_output=True,
            text=True,
            timeout=AGENT_TIMEOUT_SECONDS,
            env=_agent_env(resolved_runtime),
        )
        return {
            "success": result.returncode == 0,
            "returncode": result.returncode,
            "stdout": result.stdout[-2000:] if result.stdout else "",
            "stderr": result.stderr[-1000:] if result.stderr else "",
        }
    except subprocess.TimeoutExpired:
        logger.error("Agent pipeline timed out after %ds", AGENT_TIMEOUT_SECONDS)
        return {
            "success": False,
            "returncode": -1,
            "stdout": "",
            "stderr": f"Timeout after {AGENT_TIMEOUT_SECONDS}s",
        }
    except Exception as exc:
        logger.error("Agent pipeline failed: %s", exc)
        return {
            "success": False,
            "returncode": -1,
            "stdout": "",
            "stderr": str(exc),
        }


# ---------------------------------------------------------------------------
# 5. Refresh website DB
# ---------------------------------------------------------------------------

def refresh_website_db(library_id: int | None = None) -> dict:
    """Re-run ingestion to sync knowledge_base -> kb.db, then recompute embeddings."""
    runtime = _resolve_library_runtime(library_id)
    results: dict = {}
    ingestion_ok = False

    try:
        results["purge"] = purge_library_index_data(runtime["id"])
    except Exception as exc:
        logger.error("Library purge failed: %s", exc)
        results["purge"] = f"error: {exc}"

    # Run ingestion
    try:
        backend_dir = Path(__file__).parent
        ingestion = subprocess.run(
            [sys.executable, "-c", "from ingest import run_ingestion; run_ingestion()"],
            cwd=str(backend_dir),
            capture_output=True,
            text=True,
            timeout=AGENT_TIMEOUT_SECONDS,
            env=_agent_env(runtime),
        )
        if ingestion.returncode == 0:
            results["ingestion"] = "ok"
            ingestion_ok = True
        else:
            stderr = (ingestion.stderr or ingestion.stdout or "").strip()
            results["ingestion"] = f"error: {stderr[:500]}"
    except Exception as exc:
        logger.error("Ingestion failed: %s", exc)
        results["ingestion"] = f"error: {exc}"

    # Recompute embeddings
    if ingestion_ok:
        try:
            from database import get_db_path
            from embeddings import (
                compute_atom_embeddings,
                compute_paper_embeddings,
                reload_index_sync,
            )  # type: ignore[import-untyped]

            embed_conn = sqlite3.connect(str(get_db_path()))
            try:
                embed_conn.execute("DELETE FROM embeddings")
                embed_conn.commit()
            finally:
                embed_conn.close()

            n_papers = compute_paper_embeddings()
            n_atoms = compute_atom_embeddings()
            reload_index_sync()
            results["embeddings"] = {
                "papers": n_papers,
                "atoms": n_atoms,
                "reloaded": True,
            }
        except Exception as exc:
            logger.error("Embeddings failed: %s", exc)
            results["embeddings"] = f"error: {exc}"
    else:
        results["embeddings"] = "skipped: ingestion failed"

    try:
        resolvers.clear_runtime_caches()
        results["cache"] = "cleared"
    except Exception as exc:
        logger.error("Resolver cache clear failed: %s", exc)
        results["cache"] = f"error: {exc}"

    return results


# ---------------------------------------------------------------------------
# 6. Process a single paper (complete flow)
# ---------------------------------------------------------------------------

async def process_paper(
    paper_id: str,
    library_id: int | None = None,
    reading_profile: str = "auto",
    analysis_focuses: list[str] | None = None,
) -> dict:
    """Complete pipeline for a single paper: download -> register -> agents -> refresh."""
    normalized_profile = normalize_reading_profile(reading_profile)
    normalized_focuses = normalize_analysis_focuses(analysis_focuses)
    profile_config = READING_PROFILE_CONFIG[normalized_profile]
    steps: dict = {
        "reading_profile": normalized_profile,
        "analysis_focuses": normalized_focuses,
    }
    runtime = _resolve_library_runtime(library_id)
    resolved_library_id = runtime["id"]

    # 1. Download
    try:
        pdf_path = download_paper(paper_id, runtime["papers_dir"])
        steps["download"] = {"status": "ok", "path": str(pdf_path)}
    except Exception as exc:
        steps["download"] = {"status": "error", "error": str(exc)}
        return steps

    # 2. Register in agent DB
    attach_paper_to_library(
        library_id=resolved_library_id,
        paper_id=paper_id,
        title=paper_id,
        source_path=str(pdf_path),
        source_url=build_paper_url(paper_id),
    )
    registered = register_paper(
        paper_id,
        pdf_path,
        resolved_library_id,
        runtime["agent_db_path"],
        title=paper_id,
        reading_profile=normalized_profile,
        analysis_focuses=normalized_focuses,
    )
    steps["registered"] = registered
    if not registered:
        steps["error"] = "Failed to register paper in agent DB"
        return steps
    get_paper_processing_state(library_id=resolved_library_id, paper_id=paper_id)

    # 3. Run scout (triage) when the profile requires any AI reading.
    if bool(profile_config["run_scout"]):
        scout_result = run_agent_pipeline("scout", batch_size=1, runtime=runtime)
        steps["scout"] = {
            "success": scout_result["success"],
            "detail": scout_result.get("stderr", "")[:200],
        }
    else:
        steps["scout"] = {
            "skipped": True,
            "reason": "metadata_only profile does not run scout",
        }

    # 4. Run reader when the selected profile requires deep reading.
    paper_record = _get_agent_paper(paper_id, runtime["agent_db_path"])
    triage_decision = None
    if paper_record is not None:
        triage_decision = paper_record["triage_decision"]
        steps["triage_decision"] = triage_decision

    should_run_reader = bool(profile_config["run_scout"]) and _should_run_reader(
        normalized_profile,
        triage_decision,
    )
    if should_run_reader and steps.get("scout", {}).get("success", True):
        reader_result = run_agent_pipeline("reader", batch_size=1, runtime=runtime)
        steps["reader"] = {
            "success": reader_result["success"],
            "detail": reader_result.get("stderr", "")[:200],
        }
    else:
        steps["reader"] = {
            "skipped": True,
            "reason": "selected profile does not require reader"
            if not _should_run_reader(normalized_profile, triage_decision)
            else "scout did not complete successfully",
        }

    # 5. Refresh website DB
    try:
        refresh_result = refresh_website_db(resolved_library_id)
        steps["refresh"] = refresh_result
    except Exception as exc:
        steps["refresh"] = {"status": "error", "error": str(exc)}

    get_paper_processing_state(library_id=resolved_library_id, paper_id=paper_id)

    return steps


async def reprocess_existing_paper(
    paper_id: str,
    *,
    library_id: int | None = None,
    reading_profile: str | None = None,
    analysis_focuses: list[str] | None = None,
) -> dict:
    runtime = _resolve_library_runtime(library_id)
    resolved_library_id = runtime["id"]

    conn = get_connection()
    try:
        row = conn.execute(
            """
            SELECT source_path
            FROM library_papers
            WHERE library_id = ? AND paper_id = ?
            LIMIT 1
            """,
            (resolved_library_id, paper_id),
        ).fetchone()
    finally:
        conn.close()

    source_path = str(row["source_path"] or "").strip() if row is not None else ""
    if not source_path:
        source_path = str(runtime["papers_dir"] / f"{paper_id}.pdf")

    pdf_path = Path(source_path).expanduser()
    if not pdf_path.is_file():
        raise RuntimeError("Local PDF file not found for this paper.")

    existing_agent_record = _get_agent_paper(paper_id, runtime["agent_db_path"])
    existing_profile = str(existing_agent_record["reading_profile"]) if existing_agent_record else "auto"
    if existing_agent_record is not None:
        try:
            parsed_focuses = json.loads(str(existing_agent_record["analysis_focuses"] or "[]"))
            existing_focuses = [str(item) for item in parsed_focuses] if isinstance(parsed_focuses, list) else []
        except json.JSONDecodeError:
            existing_focuses = []
    else:
        existing_focuses = []

    normalized_profile = normalize_reading_profile(reading_profile or existing_profile or "auto")
    normalized_focuses = normalize_analysis_focuses(
        analysis_focuses if analysis_focuses is not None else existing_focuses
    )
    profile_config = READING_PROFILE_CONFIG[normalized_profile]

    steps: dict = {
        "paper_id": paper_id,
        "library_id": resolved_library_id,
        "reading_profile": normalized_profile,
        "analysis_focuses": normalized_focuses,
        "source_path": str(pdf_path),
    }

    register_ok = register_paper(
        paper_id,
        pdf_path,
        resolved_library_id,
        runtime["agent_db_path"],
        title=paper_id,
        reading_profile=normalized_profile,
        analysis_focuses=normalized_focuses,
    )
    steps["registered"] = register_ok
    if not register_ok:
        steps["error"] = "Failed to re-register paper in agent DB"
        return steps

    get_paper_processing_state(library_id=resolved_library_id, paper_id=paper_id)

    if bool(profile_config["run_scout"]):
        scout_result = run_agent_pipeline("scout", batch_size=1, runtime=runtime)
        steps["scout"] = {
            "success": scout_result["success"],
            "detail": scout_result.get("stderr", "")[:200],
        }
    else:
        steps["scout"] = {
            "skipped": True,
            "reason": "metadata_only profile does not run scout",
        }

    refreshed_record = _get_agent_paper(paper_id, runtime["agent_db_path"])
    triage_decision = refreshed_record["triage_decision"] if refreshed_record is not None else None
    steps["triage_decision"] = triage_decision

    should_run_reader = bool(profile_config["run_scout"]) and _should_run_reader(
        normalized_profile,
        triage_decision,
    )
    if should_run_reader and steps.get("scout", {}).get("success", True):
        reader_result = run_agent_pipeline("reader", batch_size=1, runtime=runtime)
        steps["reader"] = {
            "success": reader_result["success"],
            "detail": reader_result.get("stderr", "")[:200],
        }
    else:
        steps["reader"] = {
            "skipped": True,
            "reason": "selected profile does not require reader"
            if not _should_run_reader(normalized_profile, triage_decision)
            else "scout did not complete successfully",
        }

    try:
        steps["refresh"] = refresh_website_db(resolved_library_id)
    except Exception as exc:
        steps["refresh"] = {"status": "error", "error": str(exc)}

    get_paper_processing_state(library_id=resolved_library_id, paper_id=paper_id)
    return steps


# ---------------------------------------------------------------------------
# 7. Process an uploaded PDF
# ---------------------------------------------------------------------------

def process_uploaded_pdf(
    pdf_bytes: bytes,
    library_id: int,
    paper_id: Optional[str] = None,
    filename: str = "",
    batch_id: int | None = None,
    reading_profile: str = "auto",
    analysis_focuses: list[str] | None = None,
) -> dict:
    """Process an uploaded PDF through the pipeline.

    Saves the file, registers it in the agent DB, and returns info needed
    to kick off the agent pipeline.
    """
    if len(pdf_bytes) > MAX_UPLOAD_BYTES:
        result = {
            "error": f"File too large ({len(pdf_bytes)} bytes). "
                     f"Maximum is {MAX_UPLOAD_BYTES // (1024 * 1024)} MB.",
            "status": "failed",
        }
        if batch_id is not None:
            add_import_batch_file(
                batch_id=batch_id,
                filename=filename or (paper_id or "upload.pdf"),
                paper_id=paper_id or "",
                status="failed",
                detail=result["error"],
            )
        return result

    if not library_exists(library_id):
        result = {"error": "Library not found.", "status": "failed"}
        if batch_id is not None:
            add_import_batch_file(
                batch_id=batch_id,
                filename=filename or (paper_id or "upload.pdf"),
                paper_id=paper_id or "",
                status="failed",
                detail=result["error"],
            )
        return result

    runtime = _resolve_library_runtime(library_id)
    library_dir = runtime["papers_dir"]
    library_dir.mkdir(parents=True, exist_ok=True)
    normalized_profile = normalize_reading_profile(reading_profile)
    normalized_focuses = normalize_analysis_focuses(analysis_focuses)

    file_sha256 = hashlib.sha256(pdf_bytes).hexdigest()
    if is_duplicate_file_for_library(library_id, file_sha256):
        result = {
            "paper_id": paper_id or "",
            "status": "duplicate",
            "error": "This file already exists in the selected library.",
        }
        if batch_id is not None:
            add_import_batch_file(
                batch_id=batch_id,
                filename=filename or ((paper_id or "").strip() + ".pdf"),
                paper_id=paper_id or "",
                status="duplicate",
                detail=result["error"],
            )
        return result

    # Determine paper_id
    if not paper_id:
        # Try to extract from filename (e.g. "w31161.pdf")
        match = re.match(r"(w\d{4,6})", filename)
        if match:
            paper_id = match.group(1)
        else:
            # Generate a unique ID
            existing = sorted(library_dir.glob("upload_*.pdf"))
            next_num = len(existing) + 1
            paper_id = f"upload_{next_num:04d}"

    pdf_path = library_dir / f"{paper_id}.pdf"
    pdf_path.write_bytes(pdf_bytes)
    logger.info("Saved uploaded PDF: %s (%d bytes)", pdf_path, len(pdf_bytes))

    attach_paper_to_library(
        library_id=library_id,
        paper_id=paper_id,
        title=Path(filename).stem or paper_id,
        source_path=str(pdf_path),
        file_sha256=file_sha256,
    )
    registered = register_paper(
        paper_id,
        pdf_path,
        library_id,
        runtime["agent_db_path"],
        title=Path(filename).stem or paper_id,
        reading_profile=normalized_profile,
        analysis_focuses=normalized_focuses,
    )

    result = {
        "paper_id": paper_id,
        "library_id": library_id,
        "pdf_path": str(pdf_path),
        "registered": registered,
        "duplicate": False,
        "reading_profile": normalized_profile,
        "analysis_focuses": normalized_focuses,
        "status": "registered" if registered else "registration_failed",
    }
    get_paper_processing_state(library_id=library_id, paper_id=paper_id)
    if batch_id is not None:
        add_import_batch_file(
            batch_id=batch_id,
            filename=filename or f"{paper_id}.pdf",
            paper_id=paper_id,
            status=result["status"],
            detail="" if registered else "Failed to register paper in agent DB.",
        )
    return result


def process_uploaded_batch(
    files: list[tuple[bytes, str]],
    *,
    library_id: int,
    batch_id: int | None = None,
    reading_profile: str = "auto",
    analysis_focuses: list[str] | None = None,
) -> dict:
    if not library_exists(library_id):
        return {"error": "Library not found.", "results": []}

    results: list[dict] = []
    imported = 0
    skipped = 0
    failed = 0

    for content, filename in files:
        result = process_uploaded_pdf(
            content,
            library_id=library_id,
            filename=filename,
            batch_id=batch_id,
            reading_profile=reading_profile,
            analysis_focuses=analysis_focuses,
        )
        results.append({
            "filename": filename,
            **result,
        })
        status = result.get("status")
        if status == "registered":
            imported += 1
        elif status == "duplicate":
            skipped += 1
        else:
            failed += 1

    payload = {
        "library_id": library_id,
        "total_files": len(files),
        "imported_files": imported,
        "skipped_files": skipped,
        "failed_files": failed,
        "results": results,
    }
    if batch_id is not None:
        payload["batch_id"] = batch_id
        finalize_import_batch(
            batch_id=batch_id,
            imported_files=imported,
            skipped_files=skipped,
            failed_files=failed,
        )
    return payload


def import_uploaded_file(
    pdf_bytes: bytes,
    *,
    library_id: int,
    paper_id: Optional[str] = None,
    filename: str = "",
    reading_profile: str = "auto",
    analysis_focuses: list[str] | None = None,
) -> dict:
    batch_id = create_import_batch(
        library_id=library_id,
        source_type="single_upload",
        source_label=filename or paper_id or "single upload",
        total_files=1,
    )
    result = process_uploaded_pdf(
        pdf_bytes,
        library_id=library_id,
        paper_id=paper_id,
        filename=filename,
        batch_id=batch_id,
        reading_profile=reading_profile,
        analysis_focuses=analysis_focuses,
    )
    status = result.get("status")
    finalize_import_batch(
        batch_id=batch_id,
        imported_files=1 if status == "registered" else 0,
        skipped_files=1 if status == "duplicate" else 0,
        failed_files=1 if status not in {"registered", "duplicate"} else 0,
    )
    result["batch_id"] = batch_id
    return result


def import_uploaded_batch(
    files: list[tuple[bytes, str]],
    *,
    library_id: int,
    reading_profile: str = "auto",
    analysis_focuses: list[str] | None = None,
) -> dict:
    batch_id = create_import_batch(
        library_id=library_id,
        source_type="folder_upload",
        source_label=f"{len(files)} uploaded files",
        total_files=len(files),
    )
    result = process_uploaded_batch(
        files,
        library_id=library_id,
        batch_id=batch_id,
        reading_profile=reading_profile,
        analysis_focuses=analysis_focuses,
    )
    result["batch_id"] = batch_id
    return result


def build_paper_relations(
    *,
    library_id: int | None = None,
    force_rebuild: bool = True,
    paper_ids: list[str] | None = None,
) -> dict:
    runtime = _resolve_library_runtime(library_id)
    _ensure_agent_db_schema(runtime["agent_db_path"])
    folder = f"library:{runtime['id']}"
    requested_ids = [pid.strip() for pid in (paper_ids or []) if pid and pid.strip()]
    if requested_ids and len(requested_ids) < 2:
        return {
            "library_id": runtime["id"],
            "requested_papers": len(requested_ids),
            "completed_papers": 0,
            "reset_papers": 0,
            "force_rebuild": force_rebuild,
            "error": "Select at least two papers before building relations.",
        }

    conn = _get_agent_db(runtime["agent_db_path"])
    excluded_null_ids: list[str] = []
    try:
        params: list[object] = [folder]
        selected_clause = ""
        if requested_ids:
            placeholders = ",".join("?" for _ in requested_ids)
            selected_clause = f" AND paper_id IN ({placeholders})"
            params.extend(requested_ids)

        completed_row = conn.execute(
            "SELECT COUNT(*) AS cnt FROM papers WHERE folder = ? AND status = 'completed'"
            + selected_clause,
            params,
        ).fetchone()
        completed_count = int(completed_row["cnt"]) if completed_row else 0
        if requested_ids and completed_count < 2:
            return {
                "library_id": runtime["id"],
                "requested_papers": len(requested_ids),
                "completed_papers": completed_count,
                "reset_papers": 0,
                "force_rebuild": force_rebuild,
                "error": "At least two selected papers must be completed before building relations.",
            }
        if force_rebuild and completed_count > 0:
            conn.execute(
                "UPDATE papers SET linker_batch = NULL, updated_at = CURRENT_TIMESTAMP "
                "WHERE folder = ? AND status = 'completed'" + selected_clause,
                params,
            )
        reset_count = conn.execute("SELECT changes()").fetchone()[0] if force_rebuild and completed_count > 0 else 0

        if requested_ids and completed_count > 0:
            placeholders = ",".join("?" for _ in requested_ids)
            excluded_rows = conn.execute(
                "SELECT paper_id FROM papers "
                "WHERE folder = ? AND status = 'completed' AND linker_batch IS NULL "
                f"AND paper_id NOT IN ({placeholders})",
                [folder] + requested_ids,
            ).fetchall()
            excluded_null_ids = [str(row["paper_id"]) for row in excluded_rows]
            if excluded_null_ids:
                excluded_placeholders = ",".join("?" for _ in excluded_null_ids)
                conn.execute(
                    f"UPDATE papers SET linker_batch = 0 WHERE paper_id IN ({excluded_placeholders})",
                    excluded_null_ids,
                )
        conn.commit()
    finally:
        conn.close()

    result: dict = {
        "library_id": runtime["id"],
        "requested_papers": len(requested_ids) if requested_ids else None,
        "completed_papers": completed_count,
        "reset_papers": reset_count,
        "force_rebuild": force_rebuild,
    }
    if completed_count == 0:
        if requested_ids:
            result["error"] = "None of the selected papers are completed and ready for relation building."
        else:
            result["error"] = "No completed papers are available for relation building in this library."
        return result

    try:
        linker_result = run_agent_pipeline("linker", runtime=runtime)
        result["linker"] = linker_result

        if linker_result.get("success"):
            result["refresh"] = refresh_website_db(runtime["id"])
        else:
            result["refresh"] = {"status": "skipped", "reason": "linker failed"}
    finally:
        if excluded_null_ids:
            restore_conn = _get_agent_db(runtime["agent_db_path"])
            try:
                restore_placeholders = ",".join("?" for _ in excluded_null_ids)
                restore_conn.execute(
                    f"UPDATE papers SET linker_batch = NULL WHERE paper_id IN ({restore_placeholders}) "
                    "AND linker_batch = 0",
                    excluded_null_ids,
                )
                restore_conn.commit()
            finally:
                restore_conn.close()

    return result


def get_import_history(
    *,
    library_id: int | None = None,
    limit: int = 20,
) -> dict:
    return {
        "imports": list_import_batches(
            library_id=library_id,
            limit=limit,
        )
    }


# ---------------------------------------------------------------------------
# 8. Pipeline status
# ---------------------------------------------------------------------------

def get_pipeline_status(library_id: int | None = None) -> dict:
    """Get current pipeline status: pending papers, counts, etc."""
    runtime = _resolve_library_runtime(library_id) if library_id else None
    resolved_library_id = runtime["id"] if runtime else None
    library_folder = f"library:{resolved_library_id}" if resolved_library_id else None
    target_papers_dir = runtime["papers_dir"] if runtime else PAPERS_DIR
    target_agent_db_path = runtime["agent_db_path"] if runtime else AGENT_DB_PATH
    status: dict = {
        "supports_remote_discovery": SUPPORTS_REMOTE_DISCOVERY,
        "remote_source_kind": REMOTE_SOURCE_KIND,
        "remote_source_name": SOURCE_NAME,
        "library_id": resolved_library_id,
        "agent_db_exists": target_agent_db_path.exists(),
        "papers_dir": str(target_papers_dir),
        "agent_db_path": str(target_agent_db_path),
        "papers_dir_exists": target_papers_dir.exists(),
        "downloaded_pdfs": 0,
        "counts": {},
        "timestamp": datetime.now().isoformat(),
    }

    if target_papers_dir.exists():
        status["downloaded_pdfs"] = len(list(target_papers_dir.glob("*.pdf")))

    if not target_agent_db_path.exists():
        return status

    conn = _get_agent_db(target_agent_db_path)
    try:
        status_clause = " WHERE folder = ?" if library_folder else ""
        status_binds = (library_folder,) if library_folder else ()
        for s in ["pending", "triaged", "completed", "error", "pdf_error", "timeout"]:
            row = conn.execute(
                "SELECT COUNT(*) as cnt FROM papers WHERE status = ?"
                + (" AND folder = ?" if library_folder else ""),
                (s, *status_binds),
            ).fetchone()
            status["counts"][s] = row["cnt"]

        # Count by triage decision
        for decision in ["DEEP_READ", "SKIM", "SKIP"]:
            row = conn.execute(
                "SELECT COUNT(*) as cnt FROM papers WHERE triage_decision = ?"
                + (" AND folder = ?" if library_folder else ""),
                (decision, *status_binds),
            ).fetchone()
            status["counts"][f"triage_{decision}"] = row["cnt"]

        # Total
        row = conn.execute(
            "SELECT COUNT(*) as cnt FROM papers" + status_clause,
            status_binds,
        ).fetchone()
        status["counts"]["total"] = row["cnt"]

        # Recently processed (last 10)
        recent = conn.execute(
            "SELECT paper_id, status, triage_decision, reading_profile, "
            "updated_at, completed_at "
            "FROM papers"
            + status_clause
            + " ORDER BY updated_at DESC LIMIT 10",
            status_binds,
        ).fetchall()
        status["recent"] = [dict(r) for r in recent]

    except Exception as exc:
        logger.error("Failed to read pipeline status: %s", exc)
        status["error"] = str(exc)
    finally:
        conn.close()

    return status
