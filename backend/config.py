"""Runtime configuration for the research knowledge base application."""

from __future__ import annotations

import os
from pathlib import Path

try:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parent / ".env")
except ImportError:
    pass


def _getenv(*names: str, default: str) -> str:
    for name in names:
        value = os.environ.get(name)
        if value:
            return value
    return default


def _getbool(*names: str, default: bool) -> bool:
    raw = _getenv(*names, default=str(default).lower()).strip().lower()
    return raw not in {"0", "false", "no", "off"}


BASE_DIR = Path(__file__).resolve().parent
REPO_ROOT = BASE_DIR.parent
DATA_ROOT = Path(
    _getenv("KB_DATA_ROOT", "DATA_ROOT", default=str(REPO_ROOT / "Data"))
).expanduser()
KNOWLEDGE_BASE_DIR = Path(
    _getenv(
        "KB_CONTENT_ROOT",
        "KNOWLEDGE_BASE_DIR",
        default=str(DATA_ROOT / "knowledge_base"),
    )
).expanduser()
PAPERS_DIR = Path(
    _getenv("PAPERS_DIR", "KB_PAPERS_DIR", default=str(DATA_ROOT / "papers"))
).expanduser()
AGENT_DB_PATH = Path(
    _getenv(
        "AGENT_DB_PATH",
        "KB_AGENT_DB_PATH",
        default=str(DATA_ROOT / "agent_papers.db"),
    )
).expanduser()
AGENTS_DIR = Path(
    _getenv("AGENTS_DIR", "KB_AGENTS_DIR", default=str(REPO_ROOT / "agents"))
).expanduser()

KB_DB_PATH = _getenv("KB_DB_PATH", default=str(BASE_DIR / "kb.db"))
PROJECTS_DIR = Path(
    _getenv(
        "PROJECTS_DIR",
        "KB_PROJECTS_DIR",
        default=str(DATA_ROOT / "knowledge_base" / "projects"),
    )
).expanduser()

APP_NAME = _getenv(
    "APP_NAME",
    "KB_APP_NAME",
    default="Lit Panel",
)
APP_SHORT_NAME = _getenv(
    "APP_SHORT_NAME",
    "KB_APP_SHORT_NAME",
    default="Lit Panel",
)
APP_DESCRIPTION = _getenv(
    "APP_DESCRIPTION",
    "KB_APP_DESCRIPTION",
    default="API for searching, browsing, and exporting research paper analysis.",
)
APP_API_TITLE = _getenv(
    "APP_API_TITLE",
    default=f"{APP_NAME} API",
)

SOURCE_NAME = _getenv(
    "SOURCE_NAME",
    "KB_SOURCE_NAME",
    default="Local Library",
)
SOURCE_PAPER_LABEL = _getenv(
    "SOURCE_PAPER_LABEL",
    "KB_SOURCE_PAPER_LABEL",
    default="working papers",
)
PUBLISHER_NAME = _getenv(
    "PUBLISHER_NAME",
    "KB_PUBLISHER_NAME",
    default="National Bureau of Economic Research",
)
SERIES_NAME = _getenv(
    "SERIES_NAME",
    "KB_SERIES_NAME",
    default="Working Papers",
)
PAPER_URL_TEMPLATE = _getenv(
    "PAPER_URL_TEMPLATE",
    "KB_PAPER_URL_TEMPLATE",
    default="https://example.org/papers/{paper_id}",
)
EXPORT_BASENAME = _getenv(
    "EXPORT_BASENAME",
    "KB_EXPORT_BASENAME",
    default="papers",
)
LLM_API_BASE_URL = _getenv(
    "LLM_API_BASE_URL",
    "KB_LLM_API_BASE_URL",
    "NBER_API_BASE_URL",
    default="https://api.kimi.com/coding/",
)
LLM_API_MODEL = _getenv(
    "LLM_API_MODEL",
    "KB_LLM_MODEL",
    "NBER_AGENT_MODEL",
    default="kimi-for-coding",
)
EXTERNAL_API_KEY = _getenv(
    "API_KEY",
    "KB_API_KEY",
    "NBER_API_KEY",
    default="",
)
REMOTE_DISCOVERY_LABEL = _getenv(
    "REMOTE_DISCOVERY_LABEL",
    "KB_REMOTE_DISCOVERY_LABEL",
    default=SOURCE_NAME,
)
SUPPORTS_REMOTE_DISCOVERY = _getbool(
    "SUPPORTS_REMOTE_DISCOVERY",
    "KB_SUPPORTS_REMOTE_DISCOVERY",
    default=False,
)
REMOTE_SOURCE_KIND = _getenv(
    "REMOTE_SOURCE_KIND",
    "KB_REMOTE_SOURCE_KIND",
    default="nber" if SUPPORTS_REMOTE_DISCOVERY else "none",
).strip().lower()
REMOTE_DISCOVERY_API_URL = _getenv(
    "REMOTE_DISCOVERY_API_URL",
    "KB_REMOTE_DISCOVERY_API_URL",
    default="https://www.nber.org/api/v1/working_page_listing/contentType/working_paper/_/_/search",
)
REMOTE_PDF_URL_TEMPLATE = _getenv(
    "REMOTE_PDF_URL_TEMPLATE",
    "KB_REMOTE_PDF_URL_TEMPLATE",
    default="https://www.nber.org/system/files/working_papers/{pid}/{pid}.pdf",
)

_existing_db_candidates_raw = _getenv(
    "EXISTING_AGENT_DB_PATHS",
    "KB_EXISTING_AGENT_DB_PATHS",
    default="",
)
if _existing_db_candidates_raw.strip():
    EXISTING_AGENT_DB_CANDIDATES = [
        Path(item.strip()).expanduser()
        for item in _existing_db_candidates_raw.split(os.pathsep)
        if item.strip()
    ]
else:
    EXISTING_AGENT_DB_CANDIDATES = [
        Path.home() / "Research_Workspace" / "agent_papers.db",
        DATA_ROOT / "agent_papers.db",
    ]

_extra_origins_raw = _getenv(
    "APP_CORS_ORIGINS",
    "KB_CORS_ORIGINS",
    "NBER_CORS_ORIGINS",
    default="",
)
EXTRA_CORS_ORIGINS = [
    origin.strip()
    for origin in _extra_origins_raw.split(",")
    if origin.strip()
]


def build_paper_url(paper_id: str) -> str:
    """Build a source URL for one paper."""
    try:
        return PAPER_URL_TEMPLATE.format(paper_id=paper_id, pid=paper_id)
    except KeyError:
        return PAPER_URL_TEMPLATE
