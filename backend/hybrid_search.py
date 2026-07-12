"""
Hybrid search combining FTS5 keyword search with semantic similarity.
Uses Reciprocal Rank Fusion (RRF) to merge ranked lists.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

logger = logging.getLogger("hybrid_search")

RRF_K = 60  # Standard RRF constant
SEMANTIC_ONLY_MIN_SCORE = {
    "paper": 0.30,
    "atom": 0.28,
    "all": 0.28,
}
SEMANTIC_WITH_FTS_MIN_SCORE = {
    "paper": 0.24,
    "atom": 0.22,
    "all": 0.22,
}


async def _filter_hits_to_active_library(
    resolvers: Any,
    hits: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    library_id = resolvers._active_library_id()
    if library_id is None or not hits:
        return hits

    paper_ids = [
        str(hit.get("entity_id"))
        for hit in hits
        if hit.get("entity_type") == "paper" and hit.get("entity_id")
    ]
    atom_ids = [
        str(hit.get("entity_id"))
        for hit in hits
        if hit.get("entity_type") == "atom" and hit.get("entity_id")
    ]

    allowed_papers: set[str] = set()
    allowed_atoms: set[str] = set()
    db = await resolvers._get_db()
    if paper_ids:
        placeholders = ", ".join("?" for _ in paper_ids)
        cursor = await db.execute(
            f"""
            SELECT paper_id
            FROM library_papers
            WHERE library_id = ? AND paper_id IN ({placeholders})
            """,
            [library_id, *paper_ids],
        )
        allowed_papers = {str(row["paper_id"]) for row in await cursor.fetchall()}

    if atom_ids:
        placeholders = ", ".join("?" for _ in atom_ids)
        cursor = await db.execute(
            f"""
            SELECT DISTINCT apr.atom_slug
            FROM atom_paper_refs apr
            JOIN library_papers lp ON lp.paper_id = apr.paper_id
            WHERE lp.library_id = ? AND apr.atom_slug IN ({placeholders})
            """,
            [library_id, *atom_ids],
        )
        allowed_atoms = {str(row["atom_slug"]) for row in await cursor.fetchall()}

    filtered: list[dict[str, Any]] = []
    for hit in hits:
        entity_type = hit.get("entity_type")
        entity_id = str(hit.get("entity_id") or "")
        if entity_type == "paper" and entity_id not in allowed_papers:
            continue
        if entity_type == "atom" and entity_id not in allowed_atoms:
            continue
        filtered.append(hit)
    return filtered


def reciprocal_rank_fusion(
    ranked_lists: list[list[dict[str, Any]]], k: int = RRF_K
) -> list[dict[str, Any]]:
    """
    Merge multiple ranked lists using RRF.
    Each item in a ranked list must have 'entity_type' and 'entity_id'.
    Returns merged list sorted by RRF score.
    """
    scores: dict[tuple[str, str], float] = {}
    items: dict[tuple[str, str], dict[str, Any]] = {}

    for ranked_list in ranked_lists:
        for rank, item in enumerate(ranked_list):
            key = (item["entity_type"], item["entity_id"])
            scores[key] = scores.get(key, 0) + 1.0 / (k + rank + 1)
            if key not in items:
                items[key] = item

    # Sort by RRF score descending
    sorted_keys = sorted(scores.keys(), key=lambda x: -scores[x])
    results = []
    for key in sorted_keys:
        item = items[key].copy()
        item["rrf_score"] = scores[key]
        results.append(item)

    return results


async def hybrid_search(
    query: str,
    entity_type: Optional[str] = None,
    limit: int = 20,
) -> dict[str, Any]:
    """
    Hybrid search combining FTS5 + semantic similarity via RRF.

    Returns: {"hits": [...], "total": int}
    Each hit: {entity_type, entity_id, title, snippet, rrf_score}
    (The raw per-list `rank` is dropped during merge because FTS and semantic
    hits use incompatible conventions; sort merged hits by `rrf_score`.)
    """
    import resolvers

    ranked_lists: list[list[dict[str, Any]]] = []
    fts_results: dict[str, Any] = {"hits": [], "total": 0}

    # 1. FTS5 keyword search
    fts_results = await resolvers.search(
        query, entity_type=entity_type, limit=limit * 2
    )
    if fts_results["hits"]:
        ranked_lists.append(fts_results["hits"])

    # 2. Semantic search (if embeddings are loaded)
    try:
        from embeddings import semantic_search as sem_search, is_loaded

        semantic_type_supported = entity_type is None or entity_type in ("paper", "atom")
        if is_loaded() and semantic_type_supported:
            sem_entity = entity_type if entity_type in ("paper", "atom") else "all"
            sem_results = await sem_search(
                query, entity_type=sem_entity, limit=limit * 2
            )
            threshold_key = sem_entity if sem_entity in ("paper", "atom") else "all"
            threshold_map = (
                SEMANTIC_WITH_FTS_MIN_SCORE
                if fts_results["hits"]
                else SEMANTIC_ONLY_MIN_SCORE
            )
            min_score = threshold_map[threshold_key]
            # Convert to same format as FTS hits
            sem_hits = []
            for item in sem_results:
                score = float(item.get("score", 0.0) or 0.0)
                if score < min_score:
                    continue
                sem_hits.append(
                    {
                        "entity_type": item["entity_type"],
                        "entity_id": item["entity_id"],
                        "title": "",  # Will be filled from FTS or DB lookup
                        "snippet": "",
                        "rank": score,
                    }
                )
            sem_hits = await _filter_hits_to_active_library(resolvers, sem_hits)
            if sem_hits:
                ranked_lists.append(sem_hits)
    except ImportError:
        pass  # embeddings module not available yet, use FTS only
    except Exception as e:
        logger.warning("Semantic search failed, falling back to FTS-only: %s", e)

    if not ranked_lists:
        return {"hits": [], "total": 0}

    # 3. Merge with RRF
    merged = reciprocal_rank_fusion(ranked_lists)[:limit]

    # 4. Enrich results that came only from semantic search (missing title/snippet)
    fts_lookup: dict[tuple[str, str], dict[str, Any]] = {}
    if fts_results["hits"]:
        for h in fts_results["hits"]:
            key = (h["entity_type"], h["entity_id"])
            fts_lookup[key] = h

    enriched: list[dict[str, Any]] = []
    for item in merged:
        key = (item["entity_type"], item["entity_id"])

        # Pull title/snippet from FTS results if the item is missing them
        if not item.get("title"):
            fts_hit = fts_lookup.get(key)
            if fts_hit:
                item["title"] = fts_hit.get("title", "")
                if not item.get("snippet"):
                    item["snippet"] = fts_hit.get("snippet", "")

        # If still no title, do a quick DB lookup
        if not item.get("title"):
            title, snippet = await _lookup_title(
                item["entity_type"], item["entity_id"]
            )
            item["title"] = title
            if not item.get("snippet"):
                item["snippet"] = snippet

        # Ensure snippet is always a string
        if not item.get("snippet"):
            item["snippet"] = ""

        # Drop the raw per-list `rank`: FTS hits carry a weighted bm25 score
        # (negative, lower=better) while semantic hits carry a cosine score
        # (0..1, higher=better), so the merged value mixes two incompatible
        # conventions. RRF already fuses by list position into `rrf_score`,
        # which is the correct field to sort merged hits by. Removing `rank`
        # prevents downstream consumers from mis-sorting on it.
        item.pop("rank", None)

        enriched.append(item)

    # Before the return statement, get the real total from FTS
    fts_total = fts_results.get("total", 0) if fts_results else 0
    return {"hits": enriched, "total": max(fts_total, len(enriched))}


async def _lookup_title(entity_type: str, entity_id: str) -> tuple[str, str]:
    """Quick DB lookup for entity title and snippet."""
    import aiosqlite
    from resolvers import _db_exists, _get_db

    if not _db_exists():
        return entity_id, ""
    try:
        db = await _get_db()
        if entity_type == "paper":
            cursor = await db.execute(
                "SELECT title FROM papers WHERE paper_id = ?", (entity_id,)
            )
            row = await cursor.fetchone()
            title = row[0] if row and row[0] else entity_id
            # Try to get a snippet from card sections
            cursor2 = await db.execute(
                "SELECT content FROM card_sections WHERE paper_id = ? LIMIT 1",
                (entity_id,),
            )
            row2 = await cursor2.fetchone()
            snippet = row2[0][:200] if row2 and row2[0] else ""
            return title, snippet
        elif entity_type == "atom":
            cursor = await db.execute(
                "SELECT title, description FROM atoms WHERE slug = ?", (entity_id,)
            )
            row = await cursor.fetchone()
            title = row[0] if row and row[0] else entity_id
            snippet = row[1][:200] if row and row[1] else ""
            return title, snippet
        else:
            return entity_id, ""
    except Exception:
        return entity_id, ""


async def semantic_search_resolver(
    query: str,
    entity_type: Optional[str] = None,
    limit: int = 20,
) -> list[dict[str, Any]]:
    """
    Pure semantic search — returns results from embeddings only.
    Useful for 'similar papers' features.

    Returns list of {entity_type, entity_id, title, score}.
    """
    try:
        import resolvers
        from embeddings import semantic_search as sem_search, is_loaded

        if not is_loaded():
            return []

        if entity_type is not None and entity_type not in ("paper", "atom"):
            return []
        sem_entity = entity_type if entity_type in ("paper", "atom") else "all"
        # The embedding index is global, while the UI is library-scoped. Fetch
        # extra candidates before filtering so a small library can still fill
        # the requested result window without leaking another library's rows.
        candidate_limit = max(limit, min(limit * 4, 200))
        sem_results = await sem_search(
            query,
            entity_type=sem_entity,
            limit=candidate_limit,
        )
        threshold_key = sem_entity if sem_entity in ("paper", "atom") else "all"
        sem_results = [
            item
            for item in sem_results
            if float(item.get("score", 0.0) or 0.0)
            >= SEMANTIC_ONLY_MIN_SCORE[threshold_key]
        ]
        sem_results = await _filter_hits_to_active_library(resolvers, sem_results)

        enriched = []
        for item in sem_results[:limit]:
            title, snippet = await _lookup_title(item["entity_type"], item["entity_id"])
            enriched.append(
                {
                    "entity_type": item["entity_type"],
                    "entity_id": item["entity_id"],
                    "title": title,
                    "snippet": snippet,
                    "score": item.get("score", 0.0),
                }
            )
        return enriched
    except ImportError:
        return []
    except Exception as e:
        logger.warning("semantic_search_resolver failed: %s", e)
        return []
