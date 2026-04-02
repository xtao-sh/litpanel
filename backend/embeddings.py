"""
Embedding computation and similarity search for the NBER knowledge base.

Uses sentence-transformers/all-MiniLM-L6-v2 (384 dimensions, ~80MB).
Embeddings stored in SQLite as numpy arrays, loaded into memory at startup.
Brute-force cosine search over ~24K vectors takes <10ms.
"""

import logging
import sqlite3
import warnings
from pathlib import Path
from typing import Optional

import aiosqlite
import numpy as np

logger = logging.getLogger("embeddings")

# ---------------------------------------------------------------------------
# Model (lazy-loaded)
# ---------------------------------------------------------------------------

_model = None
EMBEDDING_DIM = 384
MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"


def get_model():
    """Lazy-load the sentence-transformers model."""
    global _model
    if _model is None:
        from sentence_transformers import SentenceTransformer
        logger.info(f"Loading embedding model: {MODEL_NAME}")
        _model = SentenceTransformer(MODEL_NAME)
        logger.info("Model loaded")
    return _model


def embed_text(text: str) -> np.ndarray:
    """Embed a single text string. Returns (384,) float32 array."""
    model = get_model()
    vec = model.encode(text, normalize_embeddings=True)
    return np.ascontiguousarray(vec, dtype=np.float32)


def embed_texts(texts: list[str], batch_size: int = 64) -> np.ndarray:
    """Embed multiple texts. Returns (N, 384) float32 array."""
    model = get_model()
    vecs = model.encode(
        texts, normalize_embeddings=True,
        batch_size=batch_size, show_progress_bar=True,
    )
    return np.ascontiguousarray(vecs, dtype=np.float32)


# ---------------------------------------------------------------------------
# Database helpers
# ---------------------------------------------------------------------------

def get_db_path():
    from database import get_db_path as _get_db_path
    return _get_db_path()


def store_embeddings(entity_type: str, items: list[tuple[str, np.ndarray]]):
    """Store embeddings in SQLite. items = [(entity_id, vector), ...]"""
    conn = sqlite3.connect(str(get_db_path()))
    conn.executemany(
        "INSERT OR REPLACE INTO embeddings (entity_type, entity_id, vector) VALUES (?, ?, ?)",
        [(entity_type, eid, vec.astype(np.float32).tobytes()) for eid, vec in items],
    )
    conn.commit()
    conn.close()


# ---------------------------------------------------------------------------
# Compute embeddings for papers and atoms
# ---------------------------------------------------------------------------

def compute_paper_embeddings():
    """Compute and store embeddings for all papers with content."""
    conn = sqlite3.connect(str(get_db_path()))
    conn.row_factory = sqlite3.Row

    # For papers with cards: combine title + card section content
    papers_with_cards = conn.execute("""
        SELECT p.paper_id, p.title,
               GROUP_CONCAT(cs.content, ' ') as sections
        FROM papers p
        LEFT JOIN card_sections cs ON p.paper_id = cs.paper_id
        WHERE p.has_card = 1
        GROUP BY p.paper_id
    """).fetchall()

    # For papers without cards but with a title: use title + triage summary
    papers_with_title = conn.execute("""
        SELECT p.paper_id, p.title, p.triage_summary
        FROM papers p
        WHERE (p.has_card = 0 OR p.has_card IS NULL)
        AND p.title IS NOT NULL AND p.title != ''
    """).fetchall()

    # For papers with neither card nor title: fall back to triage_cards table
    papers_from_triage = conn.execute("""
        SELECT p.paper_id, tc.title, tc.summary
        FROM papers p
        JOIN triage_cards tc ON p.paper_id = tc.paper_id
        WHERE (p.has_card = 0 OR p.has_card IS NULL)
        AND (p.title IS NULL OR p.title = '')
        AND tc.title IS NOT NULL AND tc.title != ''
    """).fetchall()

    conn.close()

    # Build texts
    ids = []
    texts = []

    for p in papers_with_cards:
        pid = p["paper_id"]
        text = f"{p['title'] or pid}. {(p['sections'] or '')[:2000]}"
        ids.append(pid)
        texts.append(text)

    for p in papers_with_title:
        pid = p["paper_id"]
        text = f"{p['title'] or pid}. {(p['triage_summary'] or '')[:500]}"
        ids.append(pid)
        texts.append(text)

    for p in papers_from_triage:
        pid = p["paper_id"]
        text = f"{p['title'] or pid}. {(p['summary'] or '')[:500]}"
        ids.append(pid)
        texts.append(text)

    logger.info(f"Computing embeddings for {len(texts)} papers...")
    vectors = embed_texts(texts)

    items = list(zip(ids, vectors))
    store_embeddings("paper", items)
    logger.info(f"Stored {len(items)} paper embeddings")
    return len(items)


def compute_atom_embeddings():
    """Compute and store embeddings for all atoms."""
    conn = sqlite3.connect(str(get_db_path()))
    conn.row_factory = sqlite3.Row

    atoms = conn.execute("""
        SELECT slug, title, description, when_to_use
        FROM atoms
    """).fetchall()
    conn.close()

    ids = []
    texts = []
    for a in atoms:
        text = f"{a['title']}. {(a['description'] or '')} {(a['when_to_use'] or '')}"
        ids.append(a["slug"])
        texts.append(text.strip())

    logger.info(f"Computing embeddings for {len(texts)} atoms...")
    vectors = embed_texts(texts)

    items = list(zip(ids, vectors))
    store_embeddings("atom", items)
    logger.info(f"Stored {len(items)} atom embeddings")
    return len(items)


# ---------------------------------------------------------------------------
# In-memory index for fast search
# ---------------------------------------------------------------------------

_paper_index: Optional[dict] = None   # {"ids": [...], "vectors": np.ndarray}
_atom_index: Optional[dict] = None


async def load_index():
    """Load all embeddings into memory. Call once at startup."""
    global _paper_index, _atom_index

    db_path = get_db_path()
    if not Path(db_path).exists():
        logger.warning("Database not found at %s — skipping embedding load", db_path)
        return

    async with aiosqlite.connect(str(db_path)) as db:
        # Load paper embeddings
        cursor = await db.execute(
            "SELECT entity_id, vector FROM embeddings WHERE entity_type = 'paper'"
        )
        rows = await cursor.fetchall()
        if rows:
            ids = [r[0] for r in rows]
            vecs = np.array([np.frombuffer(r[1], dtype=np.float32) for r in rows])
            _paper_index = {"ids": ids, "vectors": vecs}
            logger.info(f"Loaded {len(ids)} paper embeddings into memory ({vecs.shape})")
        else:
            logger.info("No paper embeddings found in database")

        # Load atom embeddings
        cursor = await db.execute(
            "SELECT entity_id, vector FROM embeddings WHERE entity_type = 'atom'"
        )
        rows = await cursor.fetchall()
        if rows:
            ids = [r[0] for r in rows]
            vecs = np.array([np.frombuffer(r[1], dtype=np.float32) for r in rows])
            _atom_index = {"ids": ids, "vectors": vecs}
            logger.info(f"Loaded {len(ids)} atom embeddings into memory ({vecs.shape})")
        else:
            logger.info("No atom embeddings found in database")


def is_loaded() -> bool:
    """Check if embeddings are loaded."""
    return _paper_index is not None


def _cosine_scores(matrix: np.ndarray, query: np.ndarray) -> np.ndarray:
    """Compute cosine similarity scores (matrix @ query), suppressing MPS numpy warnings."""
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)
        return matrix @ query


def _top_k_indices(scores: np.ndarray, k: int) -> np.ndarray:
    """Return indices of top-k highest scores, sorted descending."""
    k = min(k, len(scores))
    if k <= 0:
        return np.array([], dtype=int)
    top = np.argpartition(-scores, k)[:k]
    return top[np.argsort(-scores[top])]


async def semantic_search(query: str, entity_type: str = "all", limit: int = 20) -> list[dict]:
    """Search by semantic similarity. Returns [{entity_type, entity_id, score}]."""
    if not is_loaded():
        return []

    query_vec = embed_text(query)
    results = []

    if entity_type in ("all", "paper") and _paper_index is not None:
        scores = _cosine_scores(_paper_index["vectors"], query_vec)
        for i in _top_k_indices(scores, limit):
            results.append({
                "entity_type": "paper",
                "entity_id": _paper_index["ids"][i],
                "score": float(scores[i]),
            })

    if entity_type in ("all", "atom") and _atom_index is not None:
        scores = _cosine_scores(_atom_index["vectors"], query_vec)
        for i in _top_k_indices(scores, limit):
            results.append({
                "entity_type": "atom",
                "entity_id": _atom_index["ids"][i],
                "score": float(scores[i]),
            })

    # Sort combined results by score, take top limit
    results.sort(key=lambda x: -x["score"])
    return results[:limit]


async def find_similar_papers(paper_id: str, limit: int = 20) -> list[dict]:
    """Find papers most similar to a given paper. Returns [{paper_id, score}]."""
    if _paper_index is None:
        return []

    try:
        idx = _paper_index["ids"].index(paper_id)
    except ValueError:
        return []

    query_vec = _paper_index["vectors"][idx]
    scores = _cosine_scores(_paper_index["vectors"], query_vec)
    scores[idx] = -1  # exclude self

    return [
        {"paper_id": _paper_index["ids"][i], "score": float(scores[i])}
        for i in _top_k_indices(scores, limit)
    ]


async def find_similar_atoms(atom_slug: str, limit: int = 20) -> list[dict]:
    """Find atoms most similar to a given atom."""
    if _atom_index is None:
        return []

    try:
        idx = _atom_index["ids"].index(atom_slug)
    except ValueError:
        return []

    query_vec = _atom_index["vectors"][idx]
    scores = _cosine_scores(_atom_index["vectors"], query_vec)
    scores[idx] = -1

    return [
        {"slug": _atom_index["ids"][i], "score": float(scores[i])}
        for i in _top_k_indices(scores, limit)
    ]
