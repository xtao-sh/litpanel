"""
Shared configuration for the agent system.

The agent runtime now resolves provider settings from the app database so the
frontend can switch providers and models per processing step.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path


def _getenv(*names: str, default: str) -> str:
    for name in names:
        value = os.environ.get(name)
        if value:
            return value
    return default


# Ensure repo root is importable so agents can reuse the shared LLM runtime.
def _find_repo_root() -> Path:
    for candidate in [Path(__file__).resolve().parent, *Path(__file__).resolve().parents]:
        if (candidate / "llm_runtime.py").exists():
            return candidate
    return Path(__file__).resolve().parents[1]


REPO_ROOT = _find_repo_root()
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from llm_runtime import build_sync_client, resolve_step_runtime  # noqa: E402


# === Paths ===
PROJECT_ROOT = Path(
    _getenv(
        "KB_AGENT_PROJECT_ROOT",
        "AGENT_DATA_ROOT",
        default=str(Path(__file__).resolve().parent.parent),
    )
).expanduser()
DB_PATH = Path(
    _getenv(
        "KB_AGENT_DB_PATH",
        "AGENT_DB_PATH",
        default=str(PROJECT_ROOT / "nber_papers.db"),
    )
).expanduser()
KNOWLEDGE_BASE = Path(
    _getenv(
        "KB_CONTENT_ROOT",
        "KNOWLEDGE_BASE_DIR",
        default=str(PROJECT_ROOT / "knowledge_base"),
    )
).expanduser()

# Knowledge base subdirectories
TRIAGE_DIR = KNOWLEDGE_BASE / "triage"
CARDS_DIR = KNOWLEDGE_BASE / "cards"
ATOMS_DIR = KNOWLEDGE_BASE / "atoms"
METHODS_DIR = ATOMS_DIR / "methods"
DATASETS_DIR = ATOMS_DIR / "datasets"
MECHANISMS_DIR = ATOMS_DIR / "mechanisms"
PUZZLES_DIR = ATOMS_DIR / "puzzles"
MAPS_DIR = KNOWLEDGE_BASE / "maps"
IDEAS_DIR = KNOWLEDGE_BASE / "ideas"
DIGESTS_DIR = KNOWLEDGE_BASE / "digests"
JOURNAL_DIR = KNOWLEDGE_BASE / "journal"
PROMPTS_DIR = Path(__file__).parent / "prompts"

TRIAGE_JSONL = TRIAGE_DIR / "triage_cards.jsonl"


def get_step_runtime(step: str) -> dict[str, str]:
    return resolve_step_runtime(step)


def get_client(step: str):
    return build_sync_client(step)


def get_model(step: str) -> str:
    return str(resolve_step_runtime(step)["model"])


# Preserve a fallback symbol for modules that still import API_MODEL.
API_MODEL = get_model("scout")

# === Batch sizes ===
SCOUT_BATCH_SIZE = int(os.environ.get("SCOUT_BATCH_SIZE", "50"))
READER_BATCH_SIZE = int(os.environ.get("READER_BATCH_SIZE", "10"))
LINKER_TRIGGER_THRESHOLD = 20

# === PDF extraction ===
SCOUT_FIRST_PAGES = 3
SCOUT_LAST_PAGES = 2

# === Token limits ===
MAX_TOKENS_SCOUT = 1024
MAX_TOKENS_READER = int(os.environ.get("MAX_TOKENS_READER", "4096"))
MAX_TOKENS_LINKER = 16384
MAX_TOKENS_THINKER = 4096
MAX_TOKENS_CRITIC = 2048

# === Core research fields (used for relevance scoring) ===
CORE_FIELDS = [
    "Industrial Organization (IO)",
    "Health Economics",
    "Digital Economy & AI",
    "Product Innovation",
    "Empirical Methods",
]


def ensure_dirs():
    for d in [
        TRIAGE_DIR,
        CARDS_DIR,
        METHODS_DIR,
        DATASETS_DIR,
        MECHANISMS_DIR,
        PUZZLES_DIR,
        MAPS_DIR,
        IDEAS_DIR,
        DIGESTS_DIR,
        JOURNAL_DIR,
        PROMPTS_DIR,
    ]:
        d.mkdir(parents=True, exist_ok=True)
