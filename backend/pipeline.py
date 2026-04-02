"""
Paper ingestion pipeline: discover -> download -> process -> refresh website DB.

Supports three modes:
1. Discover new NBER papers via API/RSS and process them
2. Process a specific paper by ID (download from NBER)
3. Process an uploaded PDF file
"""

from __future__ import annotations

import logging
import re
import sqlite3
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional

import requests

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

NBER_API_URL = (
    "https://www.nber.org/api/v1/working_page_listing/"
    "contentType/working_paper/_/_/search"
)
NBER_PDF_URL = "https://www.nber.org/system/files/working_papers/{pid}/{pid}.pdf"

PAPERS_DIR = Path(__file__).parent.parent / "Data" / "papers"
AGENT_DB_PATH = Path(__file__).parent.parent / "Data" / "nber_papers.db"
AGENTS_DIR = Path(__file__).parent.parent / "Data"

# Maximum upload size: 50 MB
MAX_UPLOAD_BYTES = 50 * 1024 * 1024

# Agent subprocess timeout: 10 minutes
AGENT_TIMEOUT_SECONDS = 600


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _extract_year(paper_id: str) -> Optional[int]:
    """Guess the year from a paper_id like w35000 based on NBER numbering.

    This is a rough heuristic.  We fall back to the current year when we
    cannot determine a value.
    """
    return datetime.now().year


def _get_agent_db() -> sqlite3.Connection:
    """Open a connection to the agent database."""
    conn = sqlite3.connect(str(AGENT_DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def _paper_exists(paper_id: str) -> bool:
    """Check whether a paper is already registered in the agent DB."""
    if not AGENT_DB_PATH.exists():
        return False
    conn = _get_agent_db()
    try:
        row = conn.execute(
            "SELECT 1 FROM papers WHERE paper_id = ?", (paper_id,)
        ).fetchone()
        return row is not None
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# 1. Discover new papers
# ---------------------------------------------------------------------------

def discover_new_papers(limit: int = 20) -> list[dict]:
    """Fetch recent NBER papers not yet in the agent database.

    Returns a list of dicts with keys: paper_id, title, authors, url.
    """
    try:
        resp = requests.get(
            NBER_API_URL,
            params={"page": 1, "perPage": limit},
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
    except requests.RequestException as exc:
        logger.error("NBER API request failed: %s", exc)
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
            "url": f"https://www.nber.org/papers/{paper_id}",
        })

    return results


# ---------------------------------------------------------------------------
# 2. Download paper
# ---------------------------------------------------------------------------

def download_paper(paper_id: str) -> Path:
    """Download a paper PDF from NBER.  Returns the saved file path.

    If the file already exists locally it is returned immediately.
    """
    PAPERS_DIR.mkdir(parents=True, exist_ok=True)
    pdf_path = PAPERS_DIR / f"{paper_id}.pdf"

    if pdf_path.exists():
        logger.info("PDF already cached: %s", pdf_path)
        return pdf_path

    url = NBER_PDF_URL.format(pid=paper_id)
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
    title: str = "",
    authors: str = "",
) -> bool:
    """Register a paper in the agent database as pending."""
    if not AGENT_DB_PATH.exists():
        logger.error("Agent DB not found at %s", AGENT_DB_PATH)
        return False

    conn = _get_agent_db()
    try:
        conn.execute(
            "INSERT OR IGNORE INTO papers "
            "(paper_id, file_path, status, year, folder) "
            "VALUES (?, ?, 'pending', ?, ?)",
            (paper_id, str(pdf_path), _extract_year(paper_id), "uploaded"),
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
) -> dict:
    """Run the agent pipeline as a subprocess.  Returns result summary."""
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
            cwd=str(AGENTS_DIR),
            capture_output=True,
            text=True,
            timeout=AGENT_TIMEOUT_SECONDS,
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

def refresh_website_db() -> dict:
    """Re-run ingestion to sync knowledge_base -> kb.db, then recompute embeddings."""
    results: dict = {}

    # Run ingestion
    try:
        # Import from sibling modules within the backend package
        backend_dir = Path(__file__).parent
        if str(backend_dir) not in sys.path:
            sys.path.insert(0, str(backend_dir))

        from ingest import run_ingestion  # type: ignore[import-untyped]

        run_ingestion()
        results["ingestion"] = "ok"
    except Exception as exc:
        logger.error("Ingestion failed: %s", exc)
        results["ingestion"] = f"error: {exc}"

    # Recompute embeddings
    try:
        from embeddings import compute_paper_embeddings, compute_atom_embeddings  # type: ignore[import-untyped]

        n_papers = compute_paper_embeddings()
        n_atoms = compute_atom_embeddings()
        results["embeddings"] = {
            "papers": n_papers,
            "atoms": n_atoms,
        }
    except Exception as exc:
        logger.error("Embeddings failed: %s", exc)
        results["embeddings"] = f"error: {exc}"

    return results


# ---------------------------------------------------------------------------
# 6. Process a single paper (complete flow)
# ---------------------------------------------------------------------------

async def process_paper(paper_id: str) -> dict:
    """Complete pipeline for a single paper: download -> register -> agents -> refresh."""
    steps: dict = {}

    # 1. Download
    try:
        pdf_path = download_paper(paper_id)
        steps["download"] = {"status": "ok", "path": str(pdf_path)}
    except Exception as exc:
        steps["download"] = {"status": "error", "error": str(exc)}
        return steps

    # 2. Register in agent DB
    registered = register_paper(paper_id, pdf_path)
    steps["registered"] = registered
    if not registered:
        steps["error"] = "Failed to register paper in agent DB"
        return steps

    # 3. Run scout (triage)
    scout_result = run_agent_pipeline("scout", batch_size=1)
    steps["scout"] = {
        "success": scout_result["success"],
        "detail": scout_result.get("stderr", "")[:200],
    }

    # 4. Run reader (deep read) -- only meaningful if triaged as DEEP_READ
    reader_result = run_agent_pipeline("reader", batch_size=1)
    steps["reader"] = {
        "success": reader_result["success"],
        "detail": reader_result.get("stderr", "")[:200],
    }

    # 5. Refresh website DB
    try:
        refresh_result = refresh_website_db()
        steps["refresh"] = refresh_result
    except Exception as exc:
        steps["refresh"] = {"status": "error", "error": str(exc)}

    return steps


# ---------------------------------------------------------------------------
# 7. Process an uploaded PDF
# ---------------------------------------------------------------------------

def process_uploaded_pdf(
    pdf_bytes: bytes,
    paper_id: Optional[str] = None,
    filename: str = "",
) -> dict:
    """Process an uploaded PDF through the pipeline.

    Saves the file, registers it in the agent DB, and returns info needed
    to kick off the agent pipeline.
    """
    if len(pdf_bytes) > MAX_UPLOAD_BYTES:
        return {
            "error": f"File too large ({len(pdf_bytes)} bytes). "
                     f"Maximum is {MAX_UPLOAD_BYTES // (1024 * 1024)} MB.",
        }

    PAPERS_DIR.mkdir(parents=True, exist_ok=True)

    # Determine paper_id
    if not paper_id:
        # Try to extract from filename (e.g. "w31161.pdf")
        match = re.match(r"(w\d{4,6})", filename)
        if match:
            paper_id = match.group(1)
        else:
            # Generate a unique ID
            existing = sorted(PAPERS_DIR.glob("upload_*.pdf"))
            next_num = len(existing) + 1
            paper_id = f"upload_{next_num:04d}"

    pdf_path = PAPERS_DIR / f"{paper_id}.pdf"
    pdf_path.write_bytes(pdf_bytes)
    logger.info("Saved uploaded PDF: %s (%d bytes)", pdf_path, len(pdf_bytes))

    registered = register_paper(paper_id, pdf_path)

    return {
        "paper_id": paper_id,
        "pdf_path": str(pdf_path),
        "registered": registered,
        "status": "registered" if registered else "registration_failed",
    }


# ---------------------------------------------------------------------------
# 8. Pipeline status
# ---------------------------------------------------------------------------

def get_pipeline_status() -> dict:
    """Get current pipeline status: pending papers, counts, etc."""
    status: dict = {
        "agent_db_exists": AGENT_DB_PATH.exists(),
        "papers_dir": str(PAPERS_DIR),
        "papers_dir_exists": PAPERS_DIR.exists(),
        "downloaded_pdfs": 0,
        "counts": {},
        "timestamp": datetime.now().isoformat(),
    }

    if PAPERS_DIR.exists():
        status["downloaded_pdfs"] = len(list(PAPERS_DIR.glob("*.pdf")))

    if not AGENT_DB_PATH.exists():
        return status

    conn = _get_agent_db()
    try:
        for s in ["pending", "triaged", "completed", "error", "pdf_error", "timeout"]:
            row = conn.execute(
                "SELECT COUNT(*) as cnt FROM papers WHERE status = ?", (s,)
            ).fetchone()
            status["counts"][s] = row["cnt"]

        # Count by triage decision
        for decision in ["DEEP_READ", "SKIM", "SKIP"]:
            row = conn.execute(
                "SELECT COUNT(*) as cnt FROM papers WHERE triage_decision = ?",
                (decision,),
            ).fetchone()
            status["counts"][f"triage_{decision}"] = row["cnt"]

        # Total
        row = conn.execute("SELECT COUNT(*) as cnt FROM papers").fetchone()
        status["counts"]["total"] = row["cnt"]

        # Recently processed (last 10)
        recent = conn.execute(
            "SELECT paper_id, status, triage_decision, "
            "updated_at, completed_at "
            "FROM papers ORDER BY updated_at DESC LIMIT 10"
        ).fetchall()
        status["recent"] = [dict(r) for r in recent]

    except Exception as exc:
        logger.error("Failed to read pipeline status: %s", exc)
        status["error"] = str(exc)
    finally:
        conn.close()

    return status
