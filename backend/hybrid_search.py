"""
Hybrid search combining FTS5 keyword search with semantic similarity.
Uses Reciprocal Rank Fusion (RRF) to merge ranked lists.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

logger = logging.getLogger("hybrid_search")

RRF_K = 60  # Standard RRF constant


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
    Each hit: {entity_type, entity_id, title, snippet, rank, rrf_score}
    """
    import resolvers

    ranked_lists: list[list[dict[str, Any]]] = []

    # 1. FTS5 keyword search
    fts_results = await resolvers.search(
        query, entity_type=entity_type, limit=limit * 2
    )
    if fts_results["hits"]:
        ranked_lists.append(fts_results["hits"])

    # 2. Semantic search (if embeddings are loaded)
    try:
        from embeddings import semantic_search as sem_search, is_loaded

        if is_loaded():
            sem_entity = entity_type if entity_type in ("paper", "atom") else "all"
            sem_results = await sem_search(
                query, entity_type=sem_entity, limit=limit * 2
            )
            # Convert to same format as FTS hits
            sem_hits = []
            for item in sem_results:
                sem_hits.append(
                    {
                        "entity_type": item["entity_type"],
                        "entity_id": item["entity_id"],
                        "title": "",  # Will be filled from FTS or DB lookup
                        "snippet": "",
                        "rank": item.get("score", 0.0),
                    }
                )
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

        enriched.append(item)

    # Before the return statement, get the real total from FTS
    fts_total = fts_results.get("total", 0) if fts_results else 0
    return {"hits": enriched, "total": max(fts_total, len(enriched))}


async def _lookup_title(entity_type: str, entity_id: str) -> tuple[str, str]:
    """Quick DB lookup for entity title and snippet."""
    import aiosqlite
    from resolvers import DB_PATH, _db_exists

    if not _db_exists():
        return entity_id, ""
    try:
        async with aiosqlite.connect(DB_PATH) as db:
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
        from embeddings import semantic_search as sem_search, is_loaded

        if not is_loaded():
            return []

        sem_entity = entity_type if entity_type in ("paper", "atom") else "all"
        sem_results = await sem_search(query, entity_type=sem_entity, limit=limit)

        enriched = []
        for item in sem_results:
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
