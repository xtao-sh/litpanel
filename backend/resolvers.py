"""Database resolvers — every function takes a db path and returns data."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import time as _time
from datetime import date
from functools import wraps
from pathlib import Path
from typing import Any

import aiosqlite

from config import KB_DB_PATH, PROJECTS_DIR
from library_context import get_active_library_id
from search import prepare_search, search_sql, count_sql

logger = logging.getLogger(__name__)

DB_PATH = KB_DB_PATH


# ---------------------------------------------------------------------------
# TTL cache for expensive aggregations
# ---------------------------------------------------------------------------

def _ttl_cache(seconds: int = 300):
    """Simple TTL cache for async functions."""
    def decorator(func):
        _cache = {}
        @wraps(func)
        async def wrapper(*args, **kwargs):
            key = (
                get_active_library_id(),
                args,
                tuple(sorted(kwargs.items())),
            )
            now = _time.time()
            if key in _cache and now - _cache[key][0] < seconds:
                return _cache[key][1]
            result = await func(*args, **kwargs)
            _cache[key] = (now, result)
            return result
        wrapper.cache_clear = lambda: _cache.clear()
        return wrapper
    return decorator


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _parse_json_list(raw: str | None) -> list[str]:
    """Safely parse a JSON array string into a Python list of strings."""
    if not raw:
        return []
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, list):
            return [str(item) for item in parsed]
    except (json.JSONDecodeError, TypeError):
        pass
    return []


def _first_sentence(text: str) -> str:
    """Extract the first sentence, capped at ~150 chars."""
    text = (text or "").strip()
    if not text:
        return ""
    match = re.match(r"(.+?[.!?])\s", text)
    if match:
        sent = match.group(1).strip()
        if len(sent) <= 150:
            return sent
        return sent[:147] + "..."
    if len(text) <= 150:
        return text
    return text[:147] + "..."


def _active_library_id() -> int | None:
    return get_active_library_id()


def _content_library_id() -> int:
    library_id = _active_library_id()
    if library_id is not None:
        return library_id
    from database import ensure_default_library
    return ensure_default_library()


def _paper_scope_where(alias: str = "p") -> tuple[str | None, list[Any]]:
    library_id = _active_library_id()
    if library_id is None:
        return None, []
    return (
        f"EXISTS (SELECT 1 FROM library_papers lp WHERE lp.paper_id = {alias}.paper_id AND lp.library_id = ?)",
        [library_id],
    )


def _with_paper_scope(where_parts: list[str], binds: list[Any], alias: str = "p") -> None:
    clause, scoped_binds = _paper_scope_where(alias)
    if clause:
        where_parts.append(clause)
        binds.extend(scoped_binds)


def _atom_scope_where(alias: str = "a") -> tuple[str | None, list[Any]]:
    library_id = _active_library_id()
    if library_id is None:
        return None, []
    return (
        "EXISTS ("
        "SELECT 1 "
        "FROM atom_paper_refs apr "
        "JOIN library_papers lp ON lp.paper_id = apr.paper_id "
        f"WHERE apr.atom_slug = {alias}.slug AND lp.library_id = ?"
        ")",
        [library_id],
    )


def _with_atom_scope(where_parts: list[str], binds: list[Any], alias: str = "a") -> None:
    clause, scoped_binds = _atom_scope_where(alias)
    if clause:
        where_parts.append(clause)
        binds.extend(scoped_binds)


def _content_scope_where(alias: str = "x") -> tuple[str, list[Any]]:
    return f"{alias}.library_id = ?", [_content_library_id()]


_db_lock = asyncio.Lock()
_db_conn: aiosqlite.Connection | None = None

async def _get_db() -> aiosqlite.Connection:
    """Return a shared database connection. Creates one if needed."""
    global _db_conn
    if _db_conn is None:
        async with _db_lock:
            if _db_conn is None:
                _db_conn = await aiosqlite.connect(DB_PATH)
                _db_conn.row_factory = aiosqlite.Row
                await _db_conn.execute("PRAGMA journal_mode=WAL")
                await _db_conn.execute("PRAGMA foreign_keys=ON")
    return _db_conn

async def _close_db():
    """Close the shared connection (call on shutdown)."""
    global _db_conn
    if _db_conn is not None:
        await _db_conn.close()
        _db_conn = None


def _db_exists() -> bool:
    return os.path.isfile(DB_PATH)


def _projects_exist() -> bool:
    return PROJECTS_DIR.is_dir()


def _raise_resolver_runtime_error(context: str, exc: Exception) -> None:
    logger.exception("%s failed", context)
    detail = str(exc).strip() or exc.__class__.__name__
    raise RuntimeError(f"{context} failed: {detail}") from exc


MAX_GRAPH_SEED_PAPERS = 60
MAX_GRAPH_CONTEXT_PAPERS = 20
MAX_GRAPH_CANDIDATE_PAPERS = 120
MAX_PAPER_SET_ATOMS = 96
MAX_PAPER_SET_ATOMS_PER_TYPE = 28
MAX_PAPER_SET_ATOMS_PER_SEED = 6
MAX_COMPLETE_ATOM_PAPERS = 6
PAPER_SET_NETWORK_CACHE_TTL = 180
PAPER_SET_NETWORK_CACHE_MAX = 64
_paper_set_network_cache: dict[
    tuple[int | None, tuple[str, ...], int],
    tuple[float, dict[str, Any]],
] = {}


def _graph_edge_relation(atom_type: str) -> str:
    return {
        "method": "uses_method",
        "dataset": "uses_dataset",
        "mechanism": "engages_mechanism",
        "puzzle": "addresses_puzzle",
    }.get(atom_type, "references_atom")


def _get_paper_set_network_cache(
    cache_key: tuple[int | None, tuple[str, ...], int],
) -> dict[str, Any] | None:
    entry = _paper_set_network_cache.get(cache_key)
    if entry is None:
        return None

    created_at, value = entry
    if _time.time() - created_at >= PAPER_SET_NETWORK_CACHE_TTL:
        _paper_set_network_cache.pop(cache_key, None)
        return None
    return value


def _set_paper_set_network_cache(
    cache_key: tuple[int | None, tuple[str, ...], int],
    value: dict[str, Any],
) -> None:
    now = _time.time()
    if len(_paper_set_network_cache) >= PAPER_SET_NETWORK_CACHE_MAX:
        oldest_key = min(
            _paper_set_network_cache.items(),
            key=lambda item: item[1][0],
        )[0]
        _paper_set_network_cache.pop(oldest_key, None)
    _paper_set_network_cache[cache_key] = (now, value)


def clear_runtime_caches() -> None:
    """Clear resolver TTL caches after imports, deletes, or reindex jobs."""
    for resolver in (
        get_jel_taxonomy,
        get_method_field_matrix,
        field_overview,
        detect_gaps,
        get_trending_topics,
        get_stats,
    ):
        cache_clear = getattr(resolver, "cache_clear", None)
        if callable(cache_clear):
            cache_clear()
    _paper_set_network_cache.clear()


def _paper_row_to_graph_node(
    row: aiosqlite.Row | dict[str, Any],
    *,
    is_seed: bool = False,
) -> dict[str, Any]:
    return {
        "id": row["paper_id"],
        "label": row["title"] or row["paper_id"],
        "type": "paper",
        "size": row.get("average_score") if isinstance(row, dict) else row["average_score"],
        "year": row.get("year") if isinstance(row, dict) else row["year"],
        "fields": _parse_json_list(
            row.get("fields") if isinstance(row, dict) else row["fields"]
        ),
        "theme": None,
        "paper_count": None,
        "is_seed": is_seed,
    }


def _atom_row_to_graph_node(
    row: aiosqlite.Row | dict[str, Any],
    *,
    paper_count: int | None = None,
    visible_paper_count: int | None = None,
    is_seed: bool = False,
) -> dict[str, Any]:
    row_paper_count = row.get("paper_count") if isinstance(row, dict) else (
        row["paper_count"] if "paper_count" in row.keys() else None
    )
    resolved_paper_count = paper_count if paper_count is not None else row_paper_count
    row_theme = row.get("theme") if isinstance(row, dict) else (
        row["theme"] if "theme" in row.keys() else None
    )
    return {
        "id": f"atom:{row['slug']}",
        "label": row["title"],
        "type": row["type"],
        "size": float(resolved_paper_count) if resolved_paper_count is not None else None,
        "year": None,
        "fields": [],
        "theme": row_theme,
        "paper_count": int(resolved_paper_count) if resolved_paper_count is not None else None,
        "visible_paper_count": (
            int(visible_paper_count) if visible_paper_count is not None else None
        ),
        "is_seed": is_seed,
    }


def _add_graph_edge(
    edges: dict[tuple[str, str, str], dict[str, Any]],
    *,
    source: str,
    target: str,
    relation: str,
    weight: float = 1.0,
) -> None:
    key = (source, target, relation)
    if key in edges:
        edges[key]["weight"] = max(float(edges[key]["weight"]), float(weight))
        return
    edges[key] = {
        "source": source,
        "target": target,
        "relation": relation,
        "weight": float(weight),
    }


def _finalize_network_graph(
    *,
    nodes: dict[str, dict[str, Any]],
    edges: dict[tuple[str, str, str], dict[str, Any]],
    mode: str,
    source_paper_count: int | None = None,
    seed_count: int = 0,
    truncated: bool = False,
    error_message: str | None = None,
    warning_message: str | None = None,
) -> dict[str, Any]:
    visible_paper_counts: dict[str, set[str]] = {}
    for edge in edges.values():
        source_node = nodes.get(edge["source"])
        target_node = nodes.get(edge["target"])
        if source_node and target_node:
            if source_node["type"] == "paper" and target_node["type"] != "paper":
                visible_paper_counts.setdefault(edge["target"], set()).add(edge["source"])
            elif target_node["type"] == "paper" and source_node["type"] != "paper":
                visible_paper_counts.setdefault(edge["source"], set()).add(edge["target"])

    for node_id, paper_ids in visible_paper_counts.items():
        node = nodes.get(node_id)
        if node is not None and node["type"] != "paper":
            node["visible_paper_count"] = len(paper_ids)

    total_paper_nodes = sum(1 for node in nodes.values() if node["type"] == "paper")
    return {
        "nodes": list(nodes.values()),
        "edges": list(edges.values()),
        "mode": mode,
        "source_paper_count": source_paper_count,
        "seed_count": seed_count,
        "total_paper_nodes": total_paper_nodes,
        "truncated": truncated,
        "error_message": error_message,
        "warning_message": warning_message,
    }


def _graph_runtime_error(mode: str, exc: Exception) -> dict[str, Any]:
    raw_message = str(exc).strip()
    detail = raw_message if raw_message else exc.__class__.__name__
    return _finalize_network_graph(
        nodes={},
        edges={},
        mode=mode,
        seed_count=0,
        error_message=f"Failed to build the {mode.replace('_', ' ')} graph: {detail}",
    )


def _read_json_file(path: Path) -> Any | None:
    try:
        return json.loads(path.read_text())
    except (OSError, json.JSONDecodeError):
        logger.exception("Failed to read JSON file %s", path)
        return None


def _project_manifest_to_dict(project_dir: Path, raw: dict[str, Any]) -> dict[str, Any]:
    slug = str(raw.get("slug") or project_dir.name)
    paper_ids = raw.get("paper_ids")
    if not isinstance(paper_ids, list):
        paper_ids = []

    overview_path = project_dir / "overview.md"
    overview_content: str | None = None
    if overview_path.is_file():
        try:
            overview_content = overview_path.read_text()
        except OSError:
            logger.exception("Failed to read overview for project %s", slug)

    return {
        "slug": slug,
        "title": str(raw.get("title") or slug),
        "description": str(raw.get("description") or ""),
        "status": str(raw.get("status") or "draft"),
        "scope_type": str(raw.get("scope_type") or "curated_paper_set"),
        "selection_rule": str(raw.get("selection_rule") or "manual"),
        "paper_ids": [str(pid) for pid in paper_ids],
        "updated_at": str(raw.get("updated_at") or ""),
        "overview_content": overview_content,
        "origin_type": raw.get("origin_type"),
        "origin_query": raw.get("origin_query"),
        "origin_filters_summary": raw.get("origin_filters_summary"),
        "source_paper_count": raw.get("source_paper_count", len(paper_ids)),
    }


def _slugify_project_value(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "project-draft"


def _ensure_unique_project_slug(base_slug: str) -> str:
    candidate = base_slug
    counter = 2
    while (PROJECTS_DIR / candidate).exists():
        candidate = f"{base_slug}-{counter}"
        counter += 1
    return candidate


def _summarize_project_filters(filters: dict[str, Any] | None, sort: str = "") -> str:
    if not isinstance(filters, dict):
        filters = {}

    parts: list[str] = []

    fields = filters.get("fields")
    if isinstance(fields, list) and fields:
        parts.append("Fields: " + ", ".join(str(field) for field in fields[:3]))
        if len(fields) > 3:
            parts[-1] += f" (+{len(fields) - 3} more)"

    year_min = filters.get("yearMin")
    year_max = filters.get("yearMax")
    if year_min is not None or year_max is not None:
        if year_min is not None and year_max is not None:
            parts.append(f"Years: {year_min}-{year_max}")
        elif year_min is not None:
            parts.append(f"Years: >= {year_min}")
        else:
            parts.append(f"Years: <= {year_max}")

    score_min = filters.get("scoreMin")
    score_max = filters.get("scoreMax")
    if score_min is not None or score_max is not None:
        if score_min is not None and score_max is not None:
            parts.append(f"Score: {score_min}-{score_max}")
        elif score_min is not None:
            parts.append(f"Score: >= {score_min}")
        else:
            parts.append(f"Score: <= {score_max}")

    if filters.get("hasCard") is True:
        parts.append("Only papers with cards")

    atom_slugs = filters.get("atomSlugs")
    if isinstance(atom_slugs, list) and atom_slugs:
        parts.append("Atoms: " + ", ".join(str(slug) for slug in atom_slugs[:3]))
        if len(atom_slugs) > 3:
            parts[-1] += f" (+{len(atom_slugs) - 3} more)"

    if sort:
        parts.append(f"Sort: {sort}")

    return " | ".join(parts) if parts else "No additional filters."


def _build_project_overview(
    *,
    title: str,
    query: str,
    paper_count: int,
    filter_summary: str,
    selection_rule: str,
) -> str:
    return "\n".join(
        [
            f"# {title}",
            "",
            "## Research Draft Origin",
            "",
            "This Research Draft was created directly from a Research-mode paper set.",
            "",
            f"- Source query: `{query}`",
            f"- Matched papers captured: {paper_count}",
            f"- Filter summary: {filter_summary}",
            f"- Selection rule: `{selection_rule}`",
            "",
            "## What This Research Draft Preserves",
            "",
            "- The current paper set at the moment the Research Draft was created",
            "- The originating query and filter context",
            "- A starting review shell that can be expanded into themes, methods, data, and gap analysis",
            "",
            "## Next Steps",
            "",
            "- Confirm which papers should remain in scope",
            "- Add thematic groupings and comparison structure",
            "- Convert recurring methods, datasets, and claims into structured project annotations",
        ]
    )


def create_project_draft(
    *,
    title: str,
    query: str,
    filters: dict[str, Any] | None,
    sort: str,
    paper_ids: list[str],
    description: str | None = None,
) -> dict[str, Any]:
    PROJECTS_DIR.mkdir(parents=True, exist_ok=True)

    normalized_ids = [str(pid).strip() for pid in paper_ids if str(pid).strip()]
    deduped_ids = list(dict.fromkeys(normalized_ids))
    if not deduped_ids:
        raise ValueError("A Research Draft requires at least one paper.")

    clean_title = title.strip() or query.strip() or "Research Draft"
    slug = _ensure_unique_project_slug(_slugify_project_value(clean_title))
    project_dir = PROJECTS_DIR / slug
    filter_summary = _summarize_project_filters(filters, sort)
    today = date.today().isoformat()
    manifest = {
        "slug": slug,
        "title": clean_title,
        "description": description
        or f"Research Draft created from the Research query “{query.strip() or clean_title}” with {len(deduped_ids)} matched papers.",
        "status": "draft",
        "scope_type": "curated_paper_set",
        "selection_rule": "research_query",
        "paper_ids": deduped_ids,
        "updated_at": today,
        "origin_type": "research",
        "origin_query": query.strip() or clean_title,
        "origin_filters_summary": filter_summary,
        "source_paper_count": len(deduped_ids),
    }

    overview = _build_project_overview(
        title=clean_title,
        query=manifest["origin_query"],
        paper_count=len(deduped_ids),
        filter_summary=filter_summary,
        selection_rule=manifest["selection_rule"],
    )

    project_dir.mkdir(parents=True, exist_ok=False)
    (project_dir / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    (project_dir / "overview.md").write_text(overview + "\n")

    return _project_manifest_to_dict(project_dir, manifest)


async def get_papers_by_ids(paper_ids: list[str]) -> list[dict[str, Any]]:
    """Return papers by ID while preserving the input order."""
    if not paper_ids or not _db_exists():
        return []
    try:
        db = await _get_db()
        placeholders = ", ".join("?" for _ in paper_ids)
        where_parts = [f"p.paper_id IN ({placeholders})"]
        binds: list[Any] = list(paper_ids)
        _with_paper_scope(where_parts, binds, "p")
        cursor = await db.execute(
            f"SELECT p.* FROM papers p WHERE {' AND '.join(where_parts)}",
            binds,
        )
        rows = await cursor.fetchall()
        papers = [_row_to_paper(row) for row in rows]
        by_id = {p["paper_id"]: p for p in papers}
        return [by_id[pid] for pid in paper_ids if pid in by_id]
    except Exception:
        logger.exception("get_papers_by_ids failed")
        return []


async def get_projects() -> list[dict[str, Any]]:
    """List curated review projects defined in the configured projects directory."""
    if not _projects_exist():
        return []

    projects: list[dict[str, Any]] = []
    try:
        for project_dir in sorted(PROJECTS_DIR.iterdir(), key=lambda p: p.name):
            if not project_dir.is_dir():
                continue
            if project_dir.name.startswith(".") or project_dir.name.startswith("_"):
                continue

            manifest_path = project_dir / "manifest.json"
            if not manifest_path.is_file():
                continue

            raw = _read_json_file(manifest_path)
            if not isinstance(raw, dict):
                continue

            projects.append(_project_manifest_to_dict(project_dir, raw))

        projects.sort(key=lambda p: (p["updated_at"], p["title"]), reverse=True)
        return projects
    except Exception as exc:
        _raise_resolver_runtime_error("get_projects", exc)


async def get_project(slug: str) -> dict[str, Any] | None:
    """Load one curated project by slug."""
    if not _projects_exist():
        return None

    project_dir = PROJECTS_DIR / slug
    manifest_path = project_dir / "manifest.json"
    if not project_dir.is_dir() or not manifest_path.is_file():
        return None

    raw = _read_json_file(manifest_path)
    if not isinstance(raw, dict):
        return None

    return _project_manifest_to_dict(project_dir, raw)


# ---------------------------------------------------------------------------
# Paper resolvers
# ---------------------------------------------------------------------------

def _row_to_paper(row: aiosqlite.Row) -> dict[str, Any]:
    """Convert a papers table row to a dict ready for the Paper type."""
    d = {
        "paper_id": row["paper_id"],
        "title": row["title"],
        "authors": _parse_json_list(row["authors"]),
        "year": row["year"],
        "fields": _parse_json_list(row["fields"]),
        "jel": _parse_json_list(row["jel"]),
        "triage_decision": row["triage_decision"],
        "average_score": row["average_score"],
        "has_card": bool(row["has_card"]),
    }
    # Include abstract and nber_url if present in the row
    try:
        d["abstract"] = row["abstract"]
    except (IndexError, KeyError):
        d["abstract"] = None
    try:
        d["nber_url"] = row["nber_url"]
    except (IndexError, KeyError):
        d["nber_url"] = None
    try:
        d["triage_summary"] = row["triage_summary"]
    except (IndexError, KeyError):
        d["triage_summary"] = None
    return d


async def get_paper(paper_id: str) -> dict[str, Any] | None:
    if not _db_exists():
        return None
    try:
        db = await _get_db()
        where_parts = ["p.paper_id = ?"]
        binds: list[Any] = [paper_id]
        _with_paper_scope(where_parts, binds, "p")
        cursor = await db.execute(
            f"SELECT p.* FROM papers p WHERE {' AND '.join(where_parts)}",
            binds,
        )
        row = await cursor.fetchone()
        if row is None:
            return None
        return _row_to_paper(row)
    except Exception:
        logger.exception("get_paper failed for %s", paper_id)
        return None


async def get_papers(
    *,
    filter_: dict[str, Any] | None = None,
    sort: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> dict[str, Any]:
    """Return {items: [...], total: int}."""
    empty = {"items": [], "total": 0}
    if not _db_exists():
        return empty

    try:
        db = await _get_db()

        where_parts: list[str] = []
        binds: list[Any] = []
        need_triage_join = False
        _with_paper_scope(where_parts, binds, "p")

        if filter_:
            if filter_.get("search"):
                where_parts.append("(p.title LIKE ? OR p.paper_id LIKE ? OR LOWER(p.authors) LIKE ?)")
                term = f"%{filter_['search']}%"
                binds.extend([term, term, term.lower()])
            if filter_.get("year_min") is not None:
                where_parts.append("p.year >= ?")
                binds.append(filter_["year_min"])
            if filter_.get("year_max") is not None:
                where_parts.append("p.year <= ?")
                binds.append(filter_["year_max"])
            if filter_.get("score_min") is not None:
                where_parts.append("p.average_score >= ?")
                binds.append(filter_["score_min"])
            if filter_.get("score_max") is not None:
                where_parts.append("p.average_score <= ?")
                binds.append(filter_["score_max"])
            if filter_.get("has_card") is not None:
                where_parts.append("p.has_card = ?")
                binds.append(1 if filter_["has_card"] else 0)
            if filter_.get("triage_decision"):
                placeholders = ", ".join("?" for _ in filter_["triage_decision"])
                where_parts.append(f"p.triage_decision IN ({placeholders})")
                binds.extend(filter_["triage_decision"])
            if filter_.get("fields"):
                field_clauses = []
                for f in filter_["fields"]:
                    field_clauses.append("p.fields LIKE ?")
                    binds.append(f"%{f}%")
                where_parts.append(f"({' OR '.join(field_clauses)})")
            if filter_.get("authors"):
                author_clauses = []
                for a in filter_["authors"]:
                    author_clauses.append("LOWER(p.authors) LIKE ?")
                    binds.append(f"%{a.lower()}%")
                where_parts.append(f"({' OR '.join(author_clauses)})")
            if filter_.get("methods"):
                need_triage_join = True
                method_clauses = []
                for m in filter_["methods"]:
                    method_clauses.append("LOWER(tc.methods) LIKE ?")
                    binds.append(f'%"{m.lower()}"%')
                where_parts.append(f"({' OR '.join(method_clauses)})")
            if filter_.get("score_dimensions"):
                for sd in filter_["score_dimensions"]:
                    where_parts.append(
                        "p.paper_id IN ("
                        "SELECT ps.paper_id FROM paper_scores ps "
                        "WHERE ps.dimension = ? AND ps.score >= ?"
                        ")"
                    )
                    binds.append(sd["dimension"])
                    binds.append(sd["min_score"])
            if filter_.get("atom_slugs"):
                # AND logic: paper must be linked to ALL specified atoms
                for slug in filter_["atom_slugs"]:
                    where_parts.append(
                        "p.paper_id IN ("
                        "SELECT paper_id FROM atom_paper_refs WHERE atom_slug = ?"
                        ")"
                    )
                    binds.append(slug)

        where_sql = (" WHERE " + " AND ".join(where_parts)) if where_parts else ""
        from_sql = "papers p"
        if need_triage_join:
            from_sql = "papers p INNER JOIN triage_cards tc ON p.paper_id = tc.paper_id"

        # Order
        order_map = {
            "year_desc": "p.year DESC",
            "year_asc": "p.year ASC",
            "score_desc": "p.average_score DESC",
            "score_asc": "p.average_score ASC",
            "id_desc": "p.paper_id DESC",
        }
        order_sql = "ORDER BY " + order_map.get(sort or "", "p.paper_id DESC")

        # Total count
        count_cursor = await db.execute(
            f"SELECT COUNT(DISTINCT p.paper_id) FROM {from_sql}{where_sql}", binds
        )
        total = (await count_cursor.fetchone())[0]

        # Page
        cursor = await db.execute(
            f"SELECT DISTINCT p.* FROM {from_sql}{where_sql} {order_sql} LIMIT ? OFFSET ?",
            binds + [limit, offset],
        )
        rows = await cursor.fetchall()
        items = [_row_to_paper(r) for r in rows]
        tldrs = await _prefetch_paper_tldrs(
            db,
            [item["paper_id"] for item in items],
            paper_rows=items,
        )
        for item in items:
            item["tldr"] = tldrs.get(item["paper_id"])

        return {"items": items, "total": total}
    except Exception as exc:
        _raise_resolver_runtime_error("get_papers", exc)


# ---------------------------------------------------------------------------
# Author & Method lookups (cached)
# ---------------------------------------------------------------------------

_author_cache: dict[str, list[tuple[str, int]]] | None = None


async def _load_author_index() -> list[tuple[str, int]]:
    """Parse all author JSON arrays, count occurrences, return sorted by count desc."""
    global _author_cache
    if _author_cache is not None:
        return _author_cache.get("all", [])
    if not _db_exists():
        return []
    from collections import Counter
    counts: Counter[str] = Counter()
    try:
        db = await _get_db()
        cursor = await db.execute(
            "SELECT authors FROM papers WHERE authors IS NOT NULL AND authors != '' AND authors != '[]'"
        )
        rows = await cursor.fetchall()
        for row in rows:
            try:
                authors = json.loads(row[0])
                if isinstance(authors, list):
                    for a in authors:
                        if isinstance(a, str) and a.strip():
                            counts[a.strip()] += 1
            except (json.JSONDecodeError, TypeError):
                pass
        result = sorted(counts.items(), key=lambda x: (-x[1], x[0]))
        _author_cache = {"all": result}
        return result
    except Exception:
        logger.exception("_load_author_index failed")
        return []


async def get_author_suggestions(*, query: str, limit: int = 20) -> list[str]:
    """Return author names matching a partial query, ordered by frequency."""
    if len(query) < 2:
        return []
    index = await _load_author_index()
    q = query.lower()
    matches = []
    for name, _count in index:
        if q in name.lower():
            matches.append(name)
            if len(matches) >= limit:
                break
    return matches


_methods_cache: list[str] | None = None


async def get_available_methods() -> list[str]:
    """Get all unique method tags from triage cards, ordered by frequency."""
    global _methods_cache
    if _methods_cache is not None:
        return _methods_cache
    if not _db_exists():
        return []
    from collections import Counter
    counts: Counter[str] = Counter()
    try:
        db = await _get_db()
        cursor = await db.execute(
            "SELECT methods FROM triage_cards WHERE methods IS NOT NULL"
        )
        rows = await cursor.fetchall()
        for row in rows:
            try:
                methods = json.loads(row[0])
                if isinstance(methods, list):
                    for m in methods:
                        if isinstance(m, str) and m.strip():
                            counts[m.strip()] += 1
            except (json.JSONDecodeError, TypeError):
                pass
        result = [m for m, _ in counts.most_common()]
        _methods_cache = result
        return result
    except Exception:
        logger.exception("get_available_methods failed")
        return []


async def get_paper_scores(paper_id: str) -> list[dict[str, Any]]:
    if not _db_exists():
        return []
    try:
        db = await _get_db()
        cursor = await db.execute(
            "SELECT dimension, score FROM paper_scores WHERE paper_id = ?",
            (paper_id,),
        )
        return [{"dimension": r["dimension"], "score": r["score"]} for r in await cursor.fetchall()]
    except Exception:
        logger.exception("get_paper_scores failed for %s", paper_id)
        return []


async def get_card_sections(paper_id: str) -> list[dict[str, Any]]:
    if not _db_exists():
        return []
    try:
        db = await _get_db()
        cursor = await db.execute(
            "SELECT section, content FROM card_sections WHERE paper_id = ?",
            (paper_id,),
        )
        return [{"section": r["section"], "content": r["content"]} for r in await cursor.fetchall()]
    except Exception:
        logger.exception("get_card_sections failed for %s", paper_id)
        return []


async def get_paper_tldr(paper_id: str) -> str | None:
    """Get a one-line summary for a paper.

    Priority:
      1. First sentence of the research_question card section
      2. First sentence of the triage summary
      3. None (frontend can fall back to title)
    """
    if not _db_exists():
        return None

    try:
        db = await _get_db()
        # Try Research Question section first
        cursor = await db.execute(
            "SELECT content FROM card_sections WHERE paper_id = ? AND section = 'Research Question'",
            (paper_id,),
        )
        row = await cursor.fetchone()
        if row and row["content"] and row["content"].strip():
            return _first_sentence(row["content"])

        # Fall back to triage summary
        cursor = await db.execute(
            "SELECT summary FROM triage_cards WHERE paper_id = ?",
            (paper_id,),
        )
        row = await cursor.fetchone()
        if row and row["summary"] and row["summary"].strip():
            return _first_sentence(row["summary"])

        return None
    except Exception:
        logger.exception("get_paper_tldr failed for %s", paper_id)
        return None


async def _prefetch_paper_tldrs(
    db: aiosqlite.Connection,
    paper_ids: list[str],
    *,
    paper_rows: list[dict[str, Any]] | None = None,
) -> dict[str, str | None]:
    """Batch-load TLDRs for a paper list to avoid GraphQL field-level N+1 queries."""
    if not paper_ids:
        return {}

    placeholders = ", ".join("?" for _ in paper_ids)
    result: dict[str, str | None] = {paper_id: None for paper_id in paper_ids}

    try:
        cursor = await db.execute(
            f"""
            SELECT paper_id, content
            FROM card_sections
            WHERE section = 'Research Question' AND paper_id IN ({placeholders})
            """,
            paper_ids,
        )
        for row in await cursor.fetchall():
            content = row["content"]
            if content:
                result[row["paper_id"]] = _first_sentence(content)
    except Exception:
        logger.exception("_prefetch_paper_tldrs failed loading card sections")

    triage_summaries: dict[str, str | None] = {}
    if paper_rows is not None:
        triage_summaries = {
            row["paper_id"]: row.get("triage_summary")
            for row in paper_rows
            if row.get("paper_id")
        }
    else:
        try:
            cursor = await db.execute(
                f"SELECT paper_id, triage_summary FROM papers WHERE paper_id IN ({placeholders})",
                paper_ids,
            )
            triage_summaries = {
                row["paper_id"]: row["triage_summary"]
                for row in await cursor.fetchall()
            }
        except Exception:
            logger.exception("_prefetch_paper_tldrs failed loading triage summaries")

    for paper_id in paper_ids:
        if result.get(paper_id):
            continue
        summary = triage_summaries.get(paper_id)
        if summary:
            result[paper_id] = _first_sentence(summary)

    return result


async def get_idea_count_for_paper(paper_id: str) -> int:
    """Count how many ideas were inspired by this paper."""
    if not _db_exists():
        return 0
    try:
        db = await _get_db()
        scope_sql, scope_binds = _content_scope_where("li")
        cursor = await db.execute(
            f"SELECT COUNT(*) FROM library_ideas li WHERE {scope_sql} AND li.source_papers LIKE ?",
            [*scope_binds, f"%{paper_id}%"],
        )
        row = await cursor.fetchone()
        return row[0] if row else 0
    except Exception:
        logger.exception("get_idea_count_for_paper failed for %s", paper_id)
        return 0


async def get_paper_atoms(paper_id: str) -> list[dict[str, Any]]:
    """Atoms linked to a paper via atom_paper_refs."""
    if not _db_exists():
        return []
    try:
        db = await _get_db()
        cursor = await db.execute(
            """
            SELECT a.* FROM atoms a
            JOIN atom_paper_refs apr ON a.slug = apr.atom_slug
            WHERE apr.paper_id = ?
            """,
            (paper_id,),
        )
        return [_row_to_atom(r) for r in await cursor.fetchall()]
    except Exception:
        logger.exception("get_paper_atoms failed for %s", paper_id)
        return []


async def get_related_papers(paper_id: str, limit: int = 10) -> list[dict[str, Any]]:
    """Papers sharing at least one atom with the given paper."""
    if not _db_exists():
        return []
    try:
        db = await _get_db()
        scope_clause, scope_binds = _paper_scope_where("p")
        cursor = await db.execute(
            """
            SELECT DISTINCT p.* FROM atom_paper_refs apr1
            JOIN atom_paper_refs apr2 ON apr1.atom_slug = apr2.atom_slug
            JOIN papers p ON p.paper_id = apr2.paper_id
            WHERE apr1.paper_id = ? AND apr2.paper_id != ?
            """ + (f" AND {scope_clause}" if scope_clause else "") + """
            LIMIT ?
            """,
            [paper_id, paper_id, *scope_binds, limit],
        )
        return [_row_to_paper(r) for r in await cursor.fetchall()]
    except Exception:
        logger.exception("get_related_papers failed for %s", paper_id)
        return []


async def get_related_papers_scored(paper_id: str, limit: int = 10) -> list[dict[str, Any]]:
    """Papers sharing atoms, ranked by number of shared atoms."""
    if not _db_exists():
        return []
    try:
        db = await _get_db()
        scope_clause, scope_binds = _paper_scope_where("p")
        cursor = await db.execute(
            """
            SELECT p.*, COUNT(DISTINCT apr1.atom_slug) as shared_count,
                   GROUP_CONCAT(DISTINCT apr1.atom_slug) as shared_slugs
            FROM atom_paper_refs apr1
            JOIN atom_paper_refs apr2 ON apr1.atom_slug = apr2.atom_slug
            JOIN papers p ON p.paper_id = apr2.paper_id
            WHERE apr1.paper_id = ? AND apr2.paper_id != ?
            """ + (f" AND {scope_clause}" if scope_clause else "") + """
            GROUP BY apr2.paper_id
            ORDER BY shared_count DESC
            LIMIT ?
            """,
            [paper_id, paper_id, *scope_binds, limit],
        )
        results = []
        for r in await cursor.fetchall():
            paper = _row_to_paper(r)
            paper["shared_atom_count"] = r["shared_count"]
            paper["shared_atoms"] = (r["shared_slugs"] or "").split(",") if r["shared_slugs"] else []
            results.append(paper)
        return results
    except Exception:
        logger.exception("get_related_papers_scored failed for %s", paper_id)
        return []


async def get_related_papers_by_axis(
    paper_id: str, axis: str = "all", limit: int = 10
) -> list[dict[str, Any]]:
    """Find related papers filtered by relationship axis.

    axis options:
    - "all": current behaviour (all shared atoms)
    - "method": only papers sharing METHOD atoms
    - "dataset": only papers sharing DATASET atoms
    - "mechanism": only papers sharing MECHANISM atoms
    - "topic": semantically similar (embedding) regardless of atoms
    """
    if axis == "all":
        return await get_related_papers_scored(paper_id, limit=limit)

    if axis == "topic":
        return await get_similar_papers(paper_id, limit=limit)

    # Filter by atom type
    valid_types = {"method", "dataset", "mechanism"}
    if axis not in valid_types:
        return []

    if not _db_exists():
        return []

    try:
        db = await _get_db()
        scope_clause, scope_binds = _paper_scope_where("p")
        cursor = await db.execute(
            """
            SELECT p.*, COUNT(DISTINCT apr1.atom_slug) as shared_count,
                   GROUP_CONCAT(DISTINCT apr1.atom_slug) as shared_slugs
            FROM atom_paper_refs apr1
            JOIN atom_paper_refs apr2 ON apr1.atom_slug = apr2.atom_slug
            JOIN atoms a ON a.slug = apr1.atom_slug
            JOIN papers p ON p.paper_id = apr2.paper_id
            WHERE apr1.paper_id = ? AND apr2.paper_id != ?
            AND a.type = ?
            """ + (f" AND {scope_clause}" if scope_clause else "") + """
            GROUP BY apr2.paper_id
            ORDER BY shared_count DESC
            LIMIT ?
            """,
            [paper_id, paper_id, axis, *scope_binds, limit],
        )
        results = []
        for r in await cursor.fetchall():
            paper = _row_to_paper(r)
            paper["shared_atom_count"] = r["shared_count"]
            paper["shared_atoms"] = (
                (r["shared_slugs"] or "").split(",") if r["shared_slugs"] else []
            )
            results.append(paper)
        return results
    except Exception:
        logger.exception(
            "get_related_papers_by_axis failed for %s axis=%s", paper_id, axis
        )
        return []


# ---------------------------------------------------------------------------
# Atom resolvers
# ---------------------------------------------------------------------------

def _row_to_atom(row: aiosqlite.Row) -> dict[str, Any]:
    d = {
        "slug": row["slug"],
        "type": row["type"],
        "title": row["title"],
        "description": row["description"],
        "evidence_strength": row["evidence_strength"],
        "when_to_use": row["when_to_use"],
        "access": row["access"],
        "url": row["url"],
    }
    try:
        d["theme"] = row["theme"]
    except (IndexError, KeyError):
        d["theme"] = None
    return d


async def get_atom(slug: str) -> dict[str, Any] | None:
    if not _db_exists():
        return None
    try:
        db = await _get_db()
        where_parts = ["a.slug = ?"]
        binds: list[Any] = [slug]
        _with_atom_scope(where_parts, binds, "a")
        cursor = await db.execute(
            f"SELECT a.* FROM atoms a WHERE {' AND '.join(where_parts)}",
            binds,
        )
        row = await cursor.fetchone()
        if row is None:
            return None
        return _row_to_atom(row)
    except Exception:
        logger.exception("get_atom failed for %s", slug)
        return None


async def get_atoms(
    *,
    filter_: dict[str, Any] | None = None,
    limit: int = 50,
    offset: int = 0,
) -> dict[str, Any]:
    empty = {"items": [], "total": 0}
    if not _db_exists():
        return empty
    try:
        db = await _get_db()

        where_parts: list[str] = []
        binds: list[Any] = []
        _with_atom_scope(where_parts, binds, "a")

        if filter_:
            if filter_.get("search"):
                where_parts.append("(title LIKE ? OR description LIKE ?)")
                term = f"%{filter_['search']}%"
                binds.extend([term, term])
            if filter_.get("type"):
                where_parts.append("type = ?")
                binds.append(filter_["type"])
            if filter_.get("evidence_strength"):
                where_parts.append("evidence_strength = ?")
                binds.append(filter_["evidence_strength"])
            if filter_.get("access"):
                where_parts.append("access LIKE ?")
                binds.append(f"%{filter_['access']}%")
            if filter_.get("theme"):
                where_parts.append("theme = ?")
                binds.append(filter_["theme"])

        where_sql = (" WHERE " + " AND ".join(where_parts)) if where_parts else ""

        count_cursor = await db.execute(
            f"SELECT COUNT(*) FROM atoms a{where_sql}",
            binds,
        )
        total = (await count_cursor.fetchone())[0]

        cursor = await db.execute(
            f"SELECT a.* FROM atoms a{where_sql} ORDER BY a.title LIMIT ? OFFSET ?",
            binds + [limit, offset],
        )
        rows = await cursor.fetchall()
        return {"items": [_row_to_atom(r) for r in rows], "total": total}
    except Exception:
        logger.exception("get_atoms failed")
        return empty


async def get_top_atoms(limit: int = 20) -> list[dict[str, Any]]:
    """Return atoms ordered by linked paper count descending."""
    if not _db_exists():
        return []
    try:
        db = await _get_db()
        where_parts: list[str] = []
        where_binds: list[Any] = []
        _with_atom_scope(where_parts, where_binds, "a")

        join_binds: list[Any] = []
        library_id = _active_library_id()
        if library_id is not None:
            count_join = (
                "LEFT JOIN library_papers lp_count "
                "ON lp_count.paper_id = apr.paper_id AND lp_count.library_id = ?"
            )
            count_expr = "COUNT(DISTINCT lp_count.paper_id)"
            join_binds.append(library_id)
        else:
            count_join = ""
            count_expr = "COUNT(DISTINCT apr.paper_id)"

        where_sql = (" WHERE " + " AND ".join(where_parts)) if where_parts else ""
        cursor = await db.execute(
            f"""
            SELECT a.*, {count_expr} AS linked_paper_count
            FROM atoms a
            LEFT JOIN atom_paper_refs apr ON apr.atom_slug = a.slug
            {count_join}
            {where_sql}
            GROUP BY a.slug
            ORDER BY linked_paper_count DESC, a.title ASC
            LIMIT ?
            """,
            join_binds + where_binds + [max(1, min(limit, 100))],
        )
        return [_row_to_atom(r) for r in await cursor.fetchall()]
    except Exception:
        logger.exception("get_top_atoms failed")
        return []


async def get_atom_year_distribution(slug: str) -> list[dict[str, int]]:
    """Return linked paper counts by year for one atom."""
    if not _db_exists():
        return []
    try:
        db = await _get_db()
        where_parts = ["apr.atom_slug = ?", "p.year IS NOT NULL"]
        binds: list[Any] = [slug]
        _with_paper_scope(where_parts, binds, "p")
        cursor = await db.execute(
            f"""
            SELECT p.year AS year, COUNT(DISTINCT p.paper_id) AS count
            FROM atom_paper_refs apr
            JOIN papers p ON p.paper_id = apr.paper_id
            WHERE {' AND '.join(where_parts)}
            GROUP BY p.year
            ORDER BY p.year ASC
            """,
            binds,
        )
        return [
            {"year": int(row["year"]), "count": int(row["count"])}
            for row in await cursor.fetchall()
            if row["year"] is not None
        ]
    except Exception:
        logger.exception("get_atom_year_distribution failed for %s", slug)
        return []


async def get_atom_papers(slug: str) -> list[dict[str, Any]]:
    if not _db_exists():
        return []
    try:
        db = await _get_db()
        where_parts = ["apr.atom_slug = ?"]
        binds: list[Any] = [slug]
        _with_paper_scope(where_parts, binds, "p")
        cursor = await db.execute(
            """
            SELECT p.* FROM papers p
            JOIN atom_paper_refs apr ON p.paper_id = apr.paper_id
            WHERE """
            + " AND ".join(where_parts),
            binds,
        )
        return [_row_to_paper(r) for r in await cursor.fetchall()]
    except Exception:
        logger.exception("get_atom_papers failed for %s", slug)
        return []


async def get_atom_paper_count(slug: str) -> int:
    if not _db_exists():
        return 0
    try:
        db = await _get_db()
        where_parts = ["apr.atom_slug = ?"]
        binds: list[Any] = [slug]
        paper_scope, paper_scope_binds = _paper_scope_where("p")
        if paper_scope:
            where_parts.append(paper_scope)
            binds.extend(paper_scope_binds)
            cursor = await db.execute(
                """
                SELECT COUNT(DISTINCT apr.paper_id)
                FROM atom_paper_refs apr
                JOIN papers p ON p.paper_id = apr.paper_id
                WHERE """
                + " AND ".join(where_parts),
                binds,
            )
        else:
            cursor = await db.execute(
                "SELECT COUNT(*) FROM atom_paper_refs apr WHERE apr.atom_slug = ?",
                (slug,),
            )
        return (await cursor.fetchone())[0]
    except Exception:
        logger.exception("get_atom_paper_count failed for %s", slug)
        return 0


# ---------------------------------------------------------------------------
# Atom theme resolvers
# ---------------------------------------------------------------------------

async def get_atom_themes(atom_type: str | None = None) -> list[dict[str, Any]]:
    """Get themes with atom counts, grouped by type.
    Returns: [{theme, atom_type, count, top_atoms: [{slug, title, description, paper_count}]}]
    """
    if not _db_exists():
        return []
    try:
        db = await _get_db()

        where_parts: list[str] = ["a.theme IS NOT NULL"]
        binds: list[Any] = []
        _with_atom_scope(where_parts, binds, "a")
        if atom_type:
            where_parts.append("a.type = ?")
            binds.append(atom_type)
        where_sql = " WHERE " + " AND ".join(where_parts)

        # Get theme counts
        cursor = await db.execute(
            f"SELECT a.theme, a.type, COUNT(*) as cnt FROM atoms a{where_sql} GROUP BY a.theme, a.type ORDER BY cnt DESC",
            binds,
        )
        theme_rows = await cursor.fetchall()

        results = []
        for tr in theme_rows:
            theme = tr["theme"]
            atype = tr["type"]
            count = tr["cnt"]

            # Get top 10 atoms for this theme
            top_where_parts = ["a.theme = ?", "a.type = ?"]
            top_binds: list[Any] = [theme, atype]
            _with_atom_scope(top_where_parts, top_binds, "a")
            top_cursor = await db.execute(
                """SELECT a.slug, a.title, a.type, a.description,
                          a.evidence_strength, a.access,
                          COUNT(DISTINCT apr.paper_id) as paper_count
                   FROM atoms a
                   LEFT JOIN atom_paper_refs apr ON a.slug = apr.atom_slug
                   LEFT JOIN library_papers lp ON lp.paper_id = apr.paper_id
                   WHERE """
                + " AND ".join(top_where_parts)
                + """
                   GROUP BY a.slug
                   ORDER BY paper_count DESC
                   LIMIT 10""",
                top_binds,
            )
            top_atoms = []
            for ar in await top_cursor.fetchall():
                top_atoms.append({
                    "slug": ar["slug"],
                    "title": ar["title"],
                    "type": ar["type"],
                    "description": ar["description"],
                    "evidence_strength": ar["evidence_strength"],
                    "access": ar["access"],
                    "paper_count": ar["paper_count"],
                    "paper_ids": [],
                })

            results.append({
                "theme": theme,
                "atom_type": atype,
                "count": count,
                "top_atoms": top_atoms,
            })

        return results
    except Exception:
        logger.exception("get_atom_themes failed")
        return []


async def get_available_themes(atom_type: str | None = None) -> list[str]:
    """Get all distinct theme names, optionally filtered by atom type."""
    if not _db_exists():
        return []
    try:
        db = await _get_db()
        where_parts = ["a.theme IS NOT NULL"]
        binds: list[Any] = []
        _with_atom_scope(where_parts, binds, "a")
        if atom_type:
            where_parts.append("a.type = ?")
            binds.append(atom_type)
        cursor = await db.execute(
            "SELECT DISTINCT a.theme FROM atoms a WHERE "
            + " AND ".join(where_parts)
            + " ORDER BY a.theme",
            binds,
        )
        rows = await cursor.fetchall()
        return [r[0] for r in rows]
    except Exception:
        logger.exception("get_available_themes failed")
        return []


# ---------------------------------------------------------------------------
# Field map resolvers
# ---------------------------------------------------------------------------

async def get_field_map(slug: str) -> dict[str, Any] | None:
    if not _db_exists():
        return None
    try:
        db = await _get_db()
        scope_sql, scope_binds = _content_scope_where("lfm")
        cursor = await db.execute(
            f"SELECT * FROM library_field_maps lfm WHERE {scope_sql} AND lfm.slug = ?",
            [*scope_binds, slug],
        )
        row = await cursor.fetchone()
        if row is None:
            return None
        return {"slug": row["slug"], "title": row["title"], "content": row["content"]}
    except Exception:
        logger.exception("get_field_map failed for %s", slug)
        return None


async def get_field_maps() -> list[dict[str, Any]]:
    if not _db_exists():
        return []
    try:
        db = await _get_db()
        scope_sql, scope_binds = _content_scope_where("lfm")
        cursor = await db.execute(
            f"SELECT * FROM library_field_maps lfm WHERE {scope_sql} ORDER BY lfm.title",
            scope_binds,
        )
        return [
            {"slug": r["slug"], "title": r["title"], "content": r["content"]}
            for r in await cursor.fetchall()
        ]
    except Exception:
        logger.exception("get_field_maps failed")
        return []


# ---------------------------------------------------------------------------
# JEL Code resolvers
# ---------------------------------------------------------------------------

JEL_FIRST_LEVEL = {
    "A": "General Economics",
    "B": "History of Economic Thought",
    "C": "Mathematical and Quantitative Methods",
    "D": "Microeconomics",
    "E": "Macroeconomics and Monetary Economics",
    "F": "International Economics",
    "G": "Financial Economics",
    "H": "Public Economics",
    "I": "Health, Education, and Welfare",
    "J": "Labor and Demographic Economics",
    "K": "Law and Economics",
    "L": "Industrial Organization",
    "M": "Business Administration",
    "N": "Economic History",
    "O": "Economic Development and Innovation",
    "P": "Economic Systems",
    "Q": "Agricultural and Environmental Economics",
    "R": "Urban and Regional Economics",
    "Z": "Other Special Topics",
}


@_ttl_cache(300)
async def get_jel_taxonomy() -> list[dict[str, Any]]:
    """Get JEL codes organized by first level with paper counts."""
    if not _db_exists():
        return []
    try:
        db = await _get_db()
        cursor = await db.execute(
            "SELECT jel FROM papers WHERE jel IS NOT NULL AND jel != '[]'"
        )
        rows = await cursor.fetchall()

        # Count all JEL codes and group by first letter
        code_counts: dict[str, int] = {}
        for row in rows:
            try:
                codes = json.loads(row["jel"])
                if isinstance(codes, list):
                    for code in codes:
                        code = str(code).strip()
                        if code:
                            code_counts[code] = code_counts.get(code, 0) + 1
            except (json.JSONDecodeError, TypeError):
                pass

        # Build taxonomy: group by first letter
        first_level: dict[str, dict[str, Any]] = {}
        for code, count in code_counts.items():
            fl = code[0].upper() if code else "?"
            if fl not in first_level:
                first_level[fl] = {"code": fl, "label": JEL_FIRST_LEVEL.get(fl, "Unknown"), "count": 0, "subcodes": {}}
            first_level[fl]["count"] += count
            if len(code) > 1:  # subcodes like "L11", "C26", etc.
                if code not in first_level[fl]["subcodes"]:
                    first_level[fl]["subcodes"][code] = 0
                first_level[fl]["subcodes"][code] += count

        # Convert to sorted list
        result = []
        for fl in sorted(first_level.keys()):
            entry = first_level[fl]
            subcodes = [
                {"code": sc, "count": c}
                for sc, c in sorted(entry["subcodes"].items())
            ]
            result.append({
                "code": entry["code"],
                "label": entry["label"],
                "count": entry["count"],
                "subcodes": subcodes,
            })
        return result
    except Exception as exc:
        _raise_resolver_runtime_error("get_jel_taxonomy", exc)


async def get_papers_by_jel(
    code: str,
    limit: int = 20,
    offset: int = 0,
) -> dict[str, Any]:
    """Get papers with a specific JEL code (first-level or full code)."""
    if not _db_exists():
        return {"items": [], "total": 0}
    try:
        db = await _get_db()
        code = code.strip().upper()

        # Fetch all papers with JEL codes
        cursor = await db.execute(
            "SELECT * FROM papers WHERE jel IS NOT NULL AND jel != '[]'"
        )
        all_rows = await cursor.fetchall()

        # Filter in Python: match first-level (1 char) or exact code
        matching = []
        for row in all_rows:
            try:
                jel_codes = json.loads(row["jel"])
                if isinstance(jel_codes, list):
                    for jel in jel_codes:
                        jel_str = str(jel).strip().upper()
                        if len(code) == 1:
                            if jel_str.startswith(code):
                                matching.append(row)
                                break
                        else:
                            if jel_str == code:
                                matching.append(row)
                                break
            except (json.JSONDecodeError, TypeError):
                pass

        total = len(matching)
        # Sort by year descending, then by paper_id
        matching.sort(key=lambda r: (-(r["year"] or 0), r["paper_id"]))
        page = matching[offset : offset + limit]
        items = [_row_to_paper(r) for r in page]
        return {"items": items, "total": total}
    except Exception as exc:
        _raise_resolver_runtime_error(f"get_papers_by_jel[{code}]", exc)


# ---------------------------------------------------------------------------
# Frontier Gaps resolver
# ---------------------------------------------------------------------------

async def get_frontier_gaps() -> list[dict[str, Any]]:
    """Parse the frontier_gaps field map into structured gap entries."""
    if not _db_exists():
        return []
    try:
        db = await _get_db()
        scope_sql, scope_binds = _content_scope_where("lfm")
        cursor = await db.execute(
            f"SELECT lfm.content FROM library_field_maps lfm WHERE {scope_sql} AND lfm.slug = 'frontier_gaps'"
            ,
            scope_binds,
        )
        row = await cursor.fetchone()
        if row is None:
            return []
        content = row["content"]
        gaps = _parse_frontier_gaps(content)

        # Enrich with paper titles
        all_paper_ids: set[str] = set()
        for gap in gaps:
            all_paper_ids.update(gap.get("closest_paper_ids", []))

        if all_paper_ids:
            ph = ", ".join("?" for _ in all_paper_ids)
            title_cursor = await db.execute(
                f"SELECT paper_id, title FROM papers WHERE paper_id IN ({ph})",
                list(all_paper_ids),
            )
            title_map: dict[str, str] = {}
            for tr in await title_cursor.fetchall():
                title_map[tr["paper_id"]] = tr["title"] or tr["paper_id"]

            for gap in gaps:
                gap["closest_paper_titles"] = {
                    pid: title_map.get(pid, pid)
                    for pid in gap.get("closest_paper_ids", [])
                }
        else:
            for gap in gaps:
                gap["closest_paper_titles"] = {}

        return gaps
    except Exception as exc:
        _raise_resolver_runtime_error("get_frontier_gaps", exc)


def _parse_frontier_gaps(content: str) -> list[dict[str, Any]]:
    """Parse markdown content into structured gap entries."""
    gaps: list[dict[str, Any]] = []

    # Split on ## Gap N: Title pattern
    gap_pattern = re.compile(r"^##\s+Gap\s+\d+:\s*(.+)$", re.MULTILINE)
    splits = gap_pattern.split(content)

    # splits[0] is content before first gap (title/intro)
    # Then alternating: title, body, title, body, ...
    i = 1
    while i < len(splits) - 1:
        title = splits[i].strip()
        body = splits[i + 1].strip()
        i += 2

        gap_entry: dict[str, Any] = {
            "title": title,
            "description": "",
            "why_it_matters": "",
            "what_is_needed": "",
            "closest_paper_ids": [],
            "feasibility": "",
        }

        # Extract the main description (the **Gap**: ... paragraph)
        gap_match = re.search(r"\*\*Gap\*\*:\s*(.+?)(?=\n\n|\n\*\*)", body, re.DOTALL)
        if gap_match:
            gap_entry["description"] = gap_match.group(1).strip()

        # Extract "Why it matters"
        wim_match = re.search(r"\*\*Why it matters\*\*:\s*(.+?)(?=\n\n|\n\*\*)", body, re.DOTALL)
        if wim_match:
            gap_entry["why_it_matters"] = wim_match.group(1).strip()

        # Extract "What's needed"
        wn_match = re.search(r"\*\*What(?:'|')s needed\*\*:\s*\n(.+?)(?=\n\*\*)", body, re.DOTALL)
        if wn_match:
            gap_entry["what_is_needed"] = wn_match.group(1).strip()

        # Extract "Closest papers" and parse paper IDs
        cp_match = re.search(r"\*\*Closest papers\*\*:\s*(.+?)(?=\n\n|\n\*\*)", body, re.DOTALL)
        if cp_match:
            cp_text = cp_match.group(1).strip()
            # Extract paper IDs like w34964, w34953
            paper_ids = re.findall(r"(w\d{4,6})", cp_text)
            gap_entry["closest_paper_ids"] = list(dict.fromkeys(paper_ids))  # deduplicate, preserve order

        # Extract "Feasibility"
        feas_match = re.search(r"\*\*Feasibility\*\*:\s*(.+?)(?:\n---|\n##|\Z)", body, re.DOTALL)
        if feas_match:
            gap_entry["feasibility"] = feas_match.group(1).strip()

        gaps.append(gap_entry)

    return gaps


# ---------------------------------------------------------------------------
# Idea resolvers
# ---------------------------------------------------------------------------

def _parse_source_papers(raw: str | None) -> list[str]:
    """Parse source_papers which is stored as free-form text, not JSON.

    First try JSON array (future-proof), then fall back to extracting
    paper IDs from the free-form text so each entry is one paper reference.
    """
    if not raw:
        return []
    # Try JSON first (in case format changes)
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, list):
            return [str(item) for item in parsed]
    except (json.JSONDecodeError, TypeError):
        pass
    # Extract individual paper references by splitting on common separators
    # The format is typically: "w34950 (desc), w34951 (desc)"
    refs = re.findall(r"w\d{4,5}(?:\s*\([^)]*\))?", raw)
    if refs:
        return [r.strip() for r in refs]
    # Fall back: return the whole string as one element if non-empty
    stripped = raw.strip()
    return [stripped] if stripped else []


def _row_to_idea(row: aiosqlite.Row) -> dict[str, Any]:
    data = {
        "id": row["id"],
        "title": row["title"],
        "status": row["status"],
        "generated_date": row["generated_date"],
        "heuristic": row["heuristic"],
        "source_papers": _parse_source_papers(row["source_papers"]),
        "content": row["content"],
        "novelty": row["novelty"],
        "feasibility": row["feasibility"],
        "impact": row["impact"],
        "composite": row["composite"],
    }
    try:
        data["evaluation"] = row["evaluation"]
    except (IndexError, KeyError):
        pass
    return data


async def get_idea(idea_id: str) -> dict[str, Any] | None:
    """Fetch a single idea by ID."""
    if not _db_exists():
        return None
    try:
        db = await _get_db()
        scope_sql, scope_binds = _content_scope_where("li")
        cursor = await db.execute(
            f"SELECT * FROM library_ideas li WHERE {scope_sql} AND li.id = ?",
            [*scope_binds, idea_id],
        )
        row = await cursor.fetchone()
        if row is None:
            return None
        return _row_to_idea(row)
    except Exception:
        logger.exception("get_idea failed for %s", idea_id)
        return None


async def get_ideas(status: str | None = None) -> list[dict[str, Any]]:
    if not _db_exists():
        return []
    try:
        db = await _get_db()
        scope_sql, scope_binds = _content_scope_where("li")
        if status:
            cursor = await db.execute(
                f"SELECT * FROM library_ideas li WHERE {scope_sql} AND li.status = ? ORDER BY li.composite DESC",
                [*scope_binds, status],
            )
        else:
            cursor = await db.execute(
                f"SELECT * FROM library_ideas li WHERE {scope_sql} ORDER BY li.composite DESC",
                scope_binds,
            )
        rows = await cursor.fetchall()
        ideas = [_row_to_idea(r) for r in rows]
        evaluations = await _prefetch_idea_evaluations(
            db,
            [idea["id"] for idea in ideas],
        )
        for idea in ideas:
            idea["evaluation"] = evaluations.get(idea["id"])
        return ideas
    except Exception as exc:
        _raise_resolver_runtime_error("get_ideas", exc)


async def _prefetch_idea_evaluations(
    db: aiosqlite.Connection,
    idea_ids: list[str],
) -> dict[str, dict[str, Any] | None]:
    if not idea_ids:
        return {}

    placeholders = ", ".join("?" for _ in idea_ids)
    result: dict[str, dict[str, Any] | None] = {idea_id: None for idea_id in idea_ids}

    try:
        scope_sql, scope_binds = _content_scope_where("lie")
        cursor = await db.execute(
            f"SELECT * FROM library_idea_evaluations lie WHERE {scope_sql} AND lie.idea_id IN ({placeholders})",
            [*scope_binds, *idea_ids],
        )
        for row in await cursor.fetchall():
            result[row["idea_id"]] = {
                "idea_id": row["idea_id"],
                "verdict": row["verdict"],
                "novelty_score": row["novelty_score"],
                "identification_score": row["identification_score"],
                "data_score": row["data_score"],
                "contribution_score": row["contribution_score"],
                "feasibility_score": row["feasibility_score"],
                "overall_score": row["overall_score"],
                "key_risk": row["key_risk"],
                "next_steps": row["next_steps"],
                "death_reason": row["death_reason"],
                "evaluation_text": row["evaluation_text"],
            }
    except Exception:
        logger.exception("_prefetch_idea_evaluations failed")

    return result


VALID_IDEA_STATUSES = {"new", "exploring", "developing", "promoted", "killed"}


async def set_idea_status(idea_id: str, status: str) -> bool:
    """Update a system idea's status."""
    if not _db_exists():
        return False
    if status not in VALID_IDEA_STATUSES:
        return False
    try:
        db = await _get_db()
        scope_sql, scope_binds = _content_scope_where("li")
        cursor = await db.execute(
            f"UPDATE library_ideas AS li SET status = ? WHERE {scope_sql} AND li.id = ?",
            [status, *scope_binds, idea_id],
        )
        await db.commit()
        return cursor.rowcount > 0
    except Exception:
        logger.exception("set_idea_status failed for %s", idea_id)
        return False


async def get_idea_evaluation(idea_id: str) -> dict[str, Any] | None:
    """Get critic evaluation for an idea from the graveyard."""
    if not _db_exists():
        return None
    try:
        db = await _get_db()
        scope_sql, scope_binds = _content_scope_where("lie")
        cursor = await db.execute(
            f"SELECT * FROM library_idea_evaluations lie WHERE {scope_sql} AND lie.idea_id = ?",
            [*scope_binds, idea_id],
        )
        row = await cursor.fetchone()
        if row is None:
            return None
        return {
            "idea_id": row["idea_id"],
            "verdict": row["verdict"],
            "novelty_score": row["novelty_score"],
            "identification_score": row["identification_score"],
            "data_score": row["data_score"],
            "contribution_score": row["contribution_score"],
            "feasibility_score": row["feasibility_score"],
            "overall_score": row["overall_score"],
            "key_risk": row["key_risk"],
            "next_steps": row["next_steps"],
            "death_reason": row["death_reason"],
            "evaluation_text": row["evaluation_text"],
        }
    except Exception:
        logger.exception("get_idea_evaluation failed for %s", idea_id)
        return None


@_ttl_cache(300)
async def get_method_field_matrix(
    top_methods: int = 15, top_fields: int = 10
) -> dict[str, Any]:
    """Get method x field co-occurrence matrix from triage cards."""
    if not _db_exists():
        return {"methods": [], "fields": [], "matrix": []}
    try:
        db = await _get_db()
        paper_scope, paper_scope_binds = _paper_scope_where("p")
        cursor = await db.execute(
            "SELECT tc.methods, tc.fields FROM triage_cards tc "
            "JOIN papers p ON p.paper_id = tc.paper_id "
            "WHERE tc.methods IS NOT NULL AND tc.fields IS NOT NULL"
            + (f" AND {paper_scope}" if paper_scope else ""),
            paper_scope_binds,
        )
        rows = await cursor.fetchall()

        # Count co-occurrences
        pairs: dict[tuple[str, str], int] = {}
        method_totals: dict[str, int] = {}
        field_totals: dict[str, int] = {}
        for r in rows:
            try:
                methods = json.loads(r["methods"]) if r["methods"] else []
                fields = json.loads(r["fields"]) if r["fields"] else []
            except (json.JSONDecodeError, TypeError):
                continue
            for m in methods:
                method_totals[m] = method_totals.get(m, 0) + 1
                for f in fields:
                    field_totals[f] = field_totals.get(f, 0) + 1
                    key = (m, f)
                    pairs[key] = pairs.get(key, 0) + 1

        # Select top methods and fields by frequency
        top_m = sorted(method_totals.items(), key=lambda x: -x[1])[:top_methods]
        top_f = sorted(field_totals.items(), key=lambda x: -x[1])[:top_fields]
        method_names = [m for m, _ in top_m]
        field_names = [f for f, _ in top_f]

        # Build matrix
        matrix = []
        for m in method_names:
            row = [pairs.get((m, f), 0) for f in field_names]
            matrix.append(row)

        return {
            "methods": method_names,
            "fields": field_names,
            "matrix": matrix,
        }
    except Exception:
        logger.exception("get_method_field_matrix failed")
        return {"methods": [], "fields": [], "matrix": []}


# ---------------------------------------------------------------------------
# Search
# ---------------------------------------------------------------------------

async def search(
    query: str,
    entity_type: str | None = None,
    limit: int = 20,
) -> dict[str, Any]:
    empty = {"hits": [], "total": 0}
    if not _db_exists():
        return empty

    params = prepare_search(query, entity_type, limit)
    if params is None:
        return empty

    try:
        db = await _get_db()
        active_library_id = _active_library_id()

        sql, binds = search_sql(params, library_id=active_library_id or _content_library_id())
        cursor = await db.execute(sql, binds)
        rows = await cursor.fetchall()

        hits = []
        for r in rows:
            if active_library_id is not None:
                if r["entity_type"] == "paper":
                    scoped = await db.execute(
                        "SELECT 1 FROM library_papers WHERE library_id = ? AND paper_id = ?",
                        (active_library_id, r["entity_id"]),
                    )
                    if await scoped.fetchone() is None:
                        continue
                elif r["entity_type"] == "atom":
                    scoped = await db.execute(
                        """
                        SELECT 1
                        FROM atom_paper_refs apr
                        JOIN library_papers lp ON lp.paper_id = apr.paper_id
                        WHERE lp.library_id = ? AND apr.atom_slug = ?
                        LIMIT 1
                        """,
                        (active_library_id, r["entity_id"]),
                    )
                    if await scoped.fetchone() is None:
                        continue
            hits.append(
                {
                    "entity_type": r["entity_type"],
                    "entity_id": r["entity_id"],
                    "title": r["title"],
                    "snippet": r["snippet"],
                    "rank": float(r["rank"]),
                }
            )

        c_sql, c_binds = count_sql(params, library_id=active_library_id or _content_library_id())
        count_cursor = await db.execute(c_sql, c_binds)
        total = (await count_cursor.fetchone())[0]

        return {"hits": hits, "total": total}
    except Exception:
        logger.exception("search failed for query=%s", query)
        return empty


async def hybrid_search_resolver(
    query: str,
    entity_type: str | None = None,
    limit: int = 20,
) -> dict[str, Any]:
    """Hybrid search using FTS5 + semantic similarity via RRF."""
    from hybrid_search import hybrid_search
    return await hybrid_search(query, entity_type=entity_type, limit=limit)


# ---------------------------------------------------------------------------
# Network graph resolvers
# ---------------------------------------------------------------------------

async def paper_network(paper_id: str, depth: int = 1) -> dict[str, Any]:
    empty = _finalize_network_graph(nodes={}, edges={}, mode="paper", seed_count=0)
    if not _db_exists():
        return _finalize_network_graph(
            nodes={},
            edges={},
            mode="paper",
            seed_count=0,
            warning_message="The graph database is not available yet. Reindex the library first.",
        )

    try:
        db = await _get_db()
        paper_scope, paper_scope_binds = _paper_scope_where("p")

        nodes: dict[str, dict[str, Any]] = {}
        edges: dict[tuple[str, str, str], dict[str, Any]] = {}

        # Seed paper
        seed_sql = "SELECT p.* FROM papers p WHERE p.paper_id = ?"
        seed_binds: list[Any] = [paper_id]
        if paper_scope:
            seed_sql += f" AND {paper_scope}"
            seed_binds.extend(paper_scope_binds)
        cursor = await db.execute(seed_sql, seed_binds)
        paper = await cursor.fetchone()
        if paper is None:
            return empty

        nodes[paper_id] = _paper_row_to_graph_node(paper, is_seed=True)

        # BFS by depth
        frontier = {paper_id}
        visited_papers: set[str] = {paper_id}

        for _ in range(depth):
            if not frontier:
                break
            next_frontier: set[str] = set()

            for pid in frontier:
                # Get atoms for this paper
                atom_where_parts = ["apr.paper_id = ?"]
                atom_binds: list[Any] = [pid]
                atom_count_scope, atom_count_scope_binds = _paper_scope_where("p_all")
                if atom_count_scope:
                    atom_where_parts.append(atom_count_scope)
                    atom_binds.extend(atom_count_scope_binds)
                atom_cursor = await db.execute(
                    """
                    SELECT a.*,
                           COUNT(DISTINCT apr_all.paper_id) as paper_count
                    FROM atoms a
                    JOIN atom_paper_refs apr ON a.slug = apr.atom_slug
                    LEFT JOIN atom_paper_refs apr_all ON a.slug = apr_all.atom_slug
                    LEFT JOIN papers p_all ON p_all.paper_id = apr_all.paper_id
                    WHERE """
                    + " AND ".join(atom_where_parts)
                    + """
                    GROUP BY a.slug
                    """,
                    atom_binds,
                )
                atom_rows = await atom_cursor.fetchall()

                for ar in atom_rows:
                    atom_id = f"atom:{ar['slug']}"
                    if atom_id not in nodes:
                        nodes[atom_id] = _atom_row_to_graph_node(ar)
                    _add_graph_edge(
                        edges,
                        source=pid,
                        target=atom_id,
                        relation=_graph_edge_relation(ar["type"]),
                    )

                    # Get papers sharing this atom
                    shared_where_parts = ["apr.atom_slug = ?", "p.paper_id != ?"]
                    shared_binds: list[Any] = [ar["slug"], pid]
                    _with_paper_scope(shared_where_parts, shared_binds, "p")
                    shared_cursor = await db.execute(
                        """
                        SELECT p.* FROM papers p
                        JOIN atom_paper_refs apr ON p.paper_id = apr.paper_id
                        WHERE """
                        + " AND ".join(shared_where_parts),
                        shared_binds,
                    )
                    shared_rows = await shared_cursor.fetchall()
                    for sr in shared_rows:
                        sp_id = sr["paper_id"]
                        if sp_id not in nodes:
                            nodes[sp_id] = _paper_row_to_graph_node(sr)
                        _add_graph_edge(
                            edges,
                            source=sp_id,
                            target=atom_id,
                            relation=_graph_edge_relation(ar["type"]),
                        )
                        if sp_id not in visited_papers:
                            next_frontier.add(sp_id)

            visited_papers.update(next_frontier)
            frontier = next_frontier

        return _finalize_network_graph(
            nodes=nodes,
            edges=edges,
            mode="paper",
            source_paper_count=1,
            seed_count=1,
        )
    except Exception as exc:
        logger.exception("paper_network failed for %s", paper_id)
        return _graph_runtime_error("paper", exc)


async def atom_neighborhood(slug: str, depth: int = 1) -> dict[str, Any]:
    empty = _finalize_network_graph(nodes={}, edges={}, mode="atom", seed_count=0)
    if not _db_exists():
        return _finalize_network_graph(
            nodes={},
            edges={},
            mode="atom",
            seed_count=0,
            warning_message="The graph database is not available yet. Reindex the library first.",
        )

    try:
        db = await _get_db()

        nodes: dict[str, dict[str, Any]] = {}
        edges: dict[tuple[str, str, str], dict[str, Any]] = {}

        # Seed atom
        atom_where_parts = ["a.slug = ?"]
        atom_binds: list[Any] = [slug]
        _with_atom_scope(atom_where_parts, atom_binds, "a")
        cursor = await db.execute(
            """
            SELECT a.*,
                   COUNT(DISTINCT apr.paper_id) as paper_count
            FROM atoms a
            LEFT JOIN atom_paper_refs apr ON a.slug = apr.atom_slug
            LEFT JOIN papers p ON p.paper_id = apr.paper_id
            WHERE """
            + " AND ".join(atom_where_parts)
            + """
            GROUP BY a.slug
            """,
            atom_binds,
        )
        atom = await cursor.fetchone()
        if atom is None:
            return empty

        atom_id = f"atom:{slug}"
        nodes[atom_id] = _atom_row_to_graph_node(atom, is_seed=True)

        frontier_atoms: set[str] = {slug}
        frontier_papers: set[str] = set()
        visited_atoms: set[str] = {slug}
        visited_papers: set[str] = set()

        for ring in range(depth):
            if ring % 2 == 0:
                next_papers: set[str] = set()
                for current_slug in frontier_atoms:
                    paper_where_parts = ["apr.atom_slug = ?"]
                    paper_binds: list[Any] = [current_slug]
                    _with_paper_scope(paper_where_parts, paper_binds, "p")
                    paper_cursor = await db.execute(
                        """
                        SELECT p.* FROM papers p
                        JOIN atom_paper_refs apr ON p.paper_id = apr.paper_id
                        WHERE """
                        + " AND ".join(paper_where_parts),
                        paper_binds,
                    )
                    paper_rows = await paper_cursor.fetchall()
                    current_atom = nodes.get(f"atom:{current_slug}")
                    relation = _graph_edge_relation(
                        (current_atom or {}).get("type", "atom")
                    )

                    for pr in paper_rows:
                        pid = pr["paper_id"]
                        if pid not in nodes:
                            nodes[pid] = _paper_row_to_graph_node(pr)
                        _add_graph_edge(
                            edges,
                            source=pid,
                            target=f"atom:{current_slug}",
                            relation=relation,
                        )
                        if pid not in visited_papers:
                            next_papers.add(pid)

                visited_papers.update(next_papers)
                frontier_papers = next_papers
                frontier_atoms = set()
                continue

            next_atoms: set[str] = set()
            for pid in frontier_papers:
                other_where_parts = ["apr.paper_id = ?"]
                other_binds: list[Any] = [pid]
                atom_count_scope, atom_count_scope_binds = _paper_scope_where("p_all")
                if atom_count_scope:
                    other_where_parts.append(atom_count_scope)
                    other_binds.extend(atom_count_scope_binds)
                other_cursor = await db.execute(
                    """
                    SELECT a.*,
                           COUNT(DISTINCT apr_all.paper_id) as paper_count
                    FROM atoms a
                    JOIN atom_paper_refs apr ON a.slug = apr.atom_slug
                    LEFT JOIN atom_paper_refs apr_all ON a.slug = apr_all.atom_slug
                    LEFT JOIN papers p_all ON p_all.paper_id = apr_all.paper_id
                    WHERE """
                    + " AND ".join(other_where_parts)
                    + """
                    GROUP BY a.slug
                    """,
                    other_binds,
                )
                other_rows = await other_cursor.fetchall()

                for oar in other_rows:
                    oa_slug = oar["slug"]
                    oa_id = f"atom:{oa_slug}"
                    if oa_id not in nodes:
                        nodes[oa_id] = _atom_row_to_graph_node(oar)
                    _add_graph_edge(
                        edges,
                        source=pid,
                        target=oa_id,
                        relation=_graph_edge_relation(oar["type"]),
                    )
                    if oa_slug not in visited_atoms:
                        next_atoms.add(oa_slug)

            visited_atoms.update(next_atoms)
            frontier_atoms = next_atoms
            frontier_papers = set()

        return _finalize_network_graph(
            nodes=nodes,
            edges=edges,
            mode="atom",
            seed_count=1,
        )
    except Exception as exc:
        logger.exception("atom_neighborhood failed for %s", slug)
        return _graph_runtime_error("atom", exc)


async def paper_set_network(paper_ids: list[str], depth: int = 1) -> dict[str, Any]:
    empty = _finalize_network_graph(
        nodes={},
        edges={},
        mode="paper_set",
        source_paper_count=len(paper_ids),
        seed_count=0,
    )
    if not _db_exists():
        return _finalize_network_graph(
            nodes={},
            edges={},
            mode="paper_set",
            source_paper_count=len(paper_ids),
            seed_count=0,
            warning_message="The graph database is not available yet. Reindex the library first.",
        )

    deduped_ids: list[str] = []
    seen_ids: set[str] = set()
    for pid in paper_ids:
        normalized = str(pid).strip()
        if not normalized or normalized in seen_ids:
            continue
        deduped_ids.append(normalized)
        seen_ids.add(normalized)

    if not deduped_ids:
        return empty

    source_paper_count = len(deduped_ids)
    candidate_ids = deduped_ids[:MAX_GRAPH_CANDIDATE_PAPERS]
    active_library_id = _active_library_id()
    cache_key = (active_library_id, tuple(candidate_ids), depth)
    cached = _get_paper_set_network_cache(cache_key)
    if cached is not None:
        return cached

    try:
        db = await _get_db()
        paper_scope, paper_scope_binds = _paper_scope_where("p")

        if paper_scope:
            scoped_placeholders = ", ".join("?" for _ in candidate_ids)
            scope_cursor = await db.execute(
                f"""
                SELECT p.paper_id
                FROM papers p
                WHERE p.paper_id IN ({scoped_placeholders})
                  AND {paper_scope}
                """,
                [*candidate_ids, *paper_scope_binds],
            )
            allowed_ids = {row["paper_id"] for row in await scope_cursor.fetchall()}
            candidate_ids = [pid for pid in candidate_ids if pid in allowed_ids]
            if not candidate_ids:
                return empty
            source_paper_count = len(candidate_ids)

        nodes: dict[str, dict[str, Any]] = {}
        edges: dict[tuple[str, str, str], dict[str, Any]] = {}
        candidate_placeholders = ", ".join("?" for _ in candidate_ids)

        candidate_atom_link_cursor = await db.execute(
            f"""
            SELECT a.slug, a.type, a.title, a.theme, apr.paper_id
            FROM atoms a
            JOIN atom_paper_refs apr ON a.slug = apr.atom_slug
            WHERE apr.paper_id IN ({candidate_placeholders})
            """,
            candidate_ids,
        )
        candidate_atom_link_rows = await candidate_atom_link_cursor.fetchall()

        atom_candidate_papers: dict[str, set[str]] = {}
        papers_with_any_atoms: set[str] = set()
        for row in candidate_atom_link_rows:
            atom_candidate_papers.setdefault(row["slug"], set()).add(row["paper_id"])
            papers_with_any_atoms.add(row["paper_id"])

        if depth <= 1:
            connected_candidate_papers = {
                paper_id
                for linked_papers in atom_candidate_papers.values()
                if len(linked_papers) >= 2
                for paper_id in linked_papers
            }
        else:
            connected_candidate_papers = set(papers_with_any_atoms)

        preferred_seed_ids = [
            pid for pid in candidate_ids if pid in connected_candidate_papers
        ]
        fallback_seed_ids = [
            pid for pid in candidate_ids if pid in papers_with_any_atoms and pid not in connected_candidate_papers
        ]
        remaining_seed_ids = [
            pid for pid in candidate_ids if pid not in connected_candidate_papers and pid not in papers_with_any_atoms
        ]

        seed_ids = (
            preferred_seed_ids
            + fallback_seed_ids
            + remaining_seed_ids
        )[:MAX_GRAPH_SEED_PAPERS]
        truncated = source_paper_count > len(seed_ids)
        seed_set = set(seed_ids)

        if not seed_ids:
            return empty

        placeholders = ", ".join("?" for _ in seed_ids)
        paper_cursor = await db.execute(
            f"SELECT p.* FROM papers p WHERE p.paper_id IN ({placeholders})",
            seed_ids,
        )
        paper_rows = await paper_cursor.fetchall()
        for row in paper_rows:
            nodes[row["paper_id"]] = _paper_row_to_graph_node(row, is_seed=True)

        if not nodes:
            return empty

        atom_link_rows = [row for row in candidate_atom_link_rows if row["paper_id"] in seed_set]

        atom_info: dict[str, dict[str, Any]] = {}
        atom_seed_papers: dict[str, set[str]] = {}
        for row in atom_link_rows:
            atom_info.setdefault(
                row["slug"],
                {
                    "slug": row["slug"],
                    "type": row["type"],
                    "title": row["title"],
                    "theme": row["theme"],
                },
            )
            atom_seed_papers.setdefault(row["slug"], set()).add(row["paper_id"])

        if not atom_info:
            result = _finalize_network_graph(
                nodes=nodes,
                edges=edges,
                mode="paper_set",
                source_paper_count=source_paper_count,
                seed_count=len(nodes),
                truncated=truncated,
            )
            _set_paper_set_network_cache(cache_key, result)
            return result

        atom_slugs = list(atom_info.keys())
        atom_placeholders = ", ".join("?" for _ in atom_slugs)
        if paper_scope:
            count_cursor = await db.execute(
                f"""
                SELECT apr.atom_slug, COUNT(DISTINCT apr.paper_id) as cnt
                FROM atom_paper_refs apr
                JOIN papers p ON p.paper_id = apr.paper_id
                WHERE apr.atom_slug IN ({atom_placeholders})
                  AND {paper_scope}
                GROUP BY apr.atom_slug
                """,
                [*atom_slugs, *paper_scope_binds],
            )
        else:
            count_cursor = await db.execute(
                f"""
                SELECT atom_slug, COUNT(*) as cnt
                FROM atom_paper_refs
                WHERE atom_slug IN ({atom_placeholders})
                GROUP BY atom_slug
                """,
                atom_slugs,
            )
        atom_counts = {
            row["atom_slug"]: row["cnt"] for row in await count_cursor.fetchall()
        }

        if depth <= 1:
            type_order = {
                "method": 0,
                "dataset": 1,
                "mechanism": 2,
                "puzzle": 3,
            }
            seed_order = {paper_id: index for index, paper_id in enumerate(seed_ids)}
            selected_atom_slugs: list[str] = []
            selected_set: set[str] = set()
            selected_by_type: dict[str, int] = {}
            selected_by_seed: dict[str, int] = {paper_id: 0 for paper_id in seed_ids}

            def add_visible_atom(slug: str, *, enforce_seed_budget: bool) -> bool:
                if slug in selected_set or len(selected_atom_slugs) >= MAX_PAPER_SET_ATOMS:
                    return False

                info = atom_info.get(slug)
                if info is None:
                    return False

                atom_type = str(info.get("type") or "")
                if selected_by_type.get(atom_type, 0) >= MAX_PAPER_SET_ATOMS_PER_TYPE:
                    return False

                linked_seeds = atom_seed_papers.get(slug, set())
                if enforce_seed_budget and linked_seeds:
                    if all(
                        selected_by_seed.get(paper_id, 0) >= MAX_PAPER_SET_ATOMS_PER_SEED
                        for paper_id in linked_seeds
                    ):
                        return False

                selected_set.add(slug)
                selected_atom_slugs.append(slug)
                selected_by_type[atom_type] = selected_by_type.get(atom_type, 0) + 1
                for paper_id in linked_seeds:
                    selected_by_seed[paper_id] = selected_by_seed.get(paper_id, 0) + 1
                return True

            shared_atom_slugs = [
                slug for slug, linked_papers in atom_seed_papers.items() if len(linked_papers) >= 2
            ]
            shared_atom_slugs.sort(
                key=lambda slug: (
                    -len(atom_seed_papers.get(slug, set())),
                    type_order.get(str(atom_info.get(slug, {}).get("type") or ""), 99),
                    -(atom_counts.get(slug) or 0),
                    str(atom_info.get(slug, {}).get("title") or slug).lower(),
                )
            )
            for slug in shared_atom_slugs:
                add_visible_atom(slug, enforce_seed_budget=False)

            seed_atom_candidates: list[tuple[int, int, int, str, str]] = []
            for slug, linked_papers in atom_seed_papers.items():
                if slug in selected_set:
                    continue
                info = atom_info.get(slug)
                if info is None:
                    continue
                atom_type = str(info.get("type") or "")
                best_seed_rank = min(
                    (seed_order.get(paper_id, len(seed_order)) for paper_id in linked_papers),
                    default=len(seed_order),
                )
                seed_atom_candidates.append(
                    (
                        best_seed_rank,
                        type_order.get(atom_type, 99),
                        -(atom_counts.get(slug) or 0),
                        str(info.get("title") or slug).lower(),
                        slug,
                    )
                )

            for *_, slug in sorted(seed_atom_candidates):
                add_visible_atom(slug, enforce_seed_budget=True)

            visible_atom_slugs = selected_atom_slugs
        else:
            visible_atom_slugs = atom_slugs

        for atom_slug in visible_atom_slugs:
            info = atom_info[atom_slug]
            atom_id = f"atom:{atom_slug}"
            nodes[atom_id] = _atom_row_to_graph_node(
                info,
                paper_count=atom_counts.get(atom_slug, len(atom_seed_papers[atom_slug])),
            )
            relation = _graph_edge_relation(info["type"])
            for pid in sorted(atom_seed_papers[atom_slug]):
                if pid in seed_set and pid in nodes:
                    _add_graph_edge(
                        edges,
                        source=pid,
                        target=atom_id,
                        relation=relation,
                    )

        if visible_atom_slugs:
            complete_atom_slugs = [
                slug
                for slug in visible_atom_slugs
                if 0 < (atom_counts.get(slug) or 0) <= MAX_COMPLETE_ATOM_PAPERS
            ]
            missing_context_budget = MAX_GRAPH_CONTEXT_PAPERS
            if complete_atom_slugs and missing_context_budget > 0:
                complete_placeholders = ", ".join("?" for _ in complete_atom_slugs)
                complete_where_parts = [
                    f"apr.atom_slug IN ({complete_placeholders})",
                    f"p.paper_id NOT IN ({placeholders})",
                ]
                complete_binds: list[Any] = [*complete_atom_slugs, *seed_ids]
                _with_paper_scope(complete_where_parts, complete_binds, "p")
                complete_cursor = await db.execute(
                    f"""
                    SELECT p.*, apr.atom_slug
                    FROM atom_paper_refs apr
                    JOIN papers p ON p.paper_id = apr.paper_id
                    WHERE {' AND '.join(complete_where_parts)}
                    ORDER BY p.average_score DESC, p.year DESC, p.paper_id DESC
                    LIMIT {missing_context_budget}
                    """,
                    complete_binds,
                )
                complete_rows = await complete_cursor.fetchall()
                for row in complete_rows:
                    paper_id = row["paper_id"]
                    atom_slug = row["atom_slug"]
                    info = atom_info.get(atom_slug)
                    if info is None:
                        continue
                    if paper_id not in nodes:
                        nodes[paper_id] = _paper_row_to_graph_node(row)
                    _add_graph_edge(
                        edges,
                        source=paper_id,
                        target=f"atom:{atom_slug}",
                        relation=_graph_edge_relation(info["type"]),
                    )

        if depth >= 3 and visible_atom_slugs:
            visible_placeholders = ", ".join("?" for _ in visible_atom_slugs)
            external_where_parts = [
                f"apr.atom_slug IN ({visible_placeholders})",
                f"p.paper_id NOT IN ({placeholders})",
            ]
            external_binds: list[Any] = [*visible_atom_slugs, *seed_ids]
            _with_paper_scope(external_where_parts, external_binds, "p")
            external_cursor = await db.execute(
                f"""
                SELECT p.*, COUNT(DISTINCT apr.atom_slug) as shared_atom_count
                FROM atom_paper_refs apr
                JOIN papers p ON p.paper_id = apr.paper_id
                WHERE {' AND '.join(external_where_parts)}
                GROUP BY p.paper_id
                ORDER BY shared_atom_count DESC, p.average_score DESC, p.year DESC
                LIMIT {MAX_GRAPH_CONTEXT_PAPERS}
                """,
                external_binds,
            )
            external_rows = await external_cursor.fetchall()
            external_ids: list[str] = []
            for row in external_rows:
                ext_id = row["paper_id"]
                external_ids.append(ext_id)
                nodes[ext_id] = _paper_row_to_graph_node(row)

            if external_ids:
                external_placeholders = ", ".join("?" for _ in external_ids)
                external_link_cursor = await db.execute(
                    f"""
                    SELECT atom_slug, paper_id
                    FROM atom_paper_refs
                    WHERE atom_slug IN ({visible_placeholders})
                      AND paper_id IN ({external_placeholders})
                    """,
                    [*visible_atom_slugs, *external_ids],
                )
                external_links = await external_link_cursor.fetchall()
                for row in external_links:
                    atom_slug = row["atom_slug"]
                    info = atom_info.get(atom_slug)
                    if info is None:
                        continue
                    _add_graph_edge(
                        edges,
                        source=row["paper_id"],
                        target=f"atom:{atom_slug}",
                        relation=_graph_edge_relation(info["type"]),
                    )

        if edges:
            connected_node_ids: set[str] = set()
            for edge in edges.values():
                connected_node_ids.add(edge["source"])
                connected_node_ids.add(edge["target"])

            nodes = {
                node_id: node
                for node_id, node in nodes.items()
                if node_id in connected_node_ids or node.get("is_seed")
            }

        result = _finalize_network_graph(
            nodes=nodes,
            edges=edges,
            mode="paper_set",
            source_paper_count=source_paper_count,
            seed_count=len(seed_ids),
            truncated=truncated,
        )
        _set_paper_set_network_cache(cache_key, result)
        return result
    except Exception as exc:
        logger.exception("paper_set_network failed")
        return _graph_runtime_error("paper_set", exc)


# ---------------------------------------------------------------------------
# Dashboard / aggregation resolvers
# ---------------------------------------------------------------------------

@_ttl_cache(300)
async def field_overview() -> list[dict[str, Any]]:
    """Per-field summary: paper count, atom count, average score.

    Because ``fields`` is stored as a JSON array string we unpack it in Python
    to stay compatible with SQLite builds lacking json_each().
    """
    if not _db_exists():
        return []
    try:
        db = await _get_db()
        paper_scope, paper_scope_binds = _paper_scope_where("p")
        paper_where_sql = f" WHERE {paper_scope}" if paper_scope else ""

        # Gather per-field paper stats
        cursor = await db.execute(
            f"SELECT p.fields, p.average_score FROM papers p{paper_where_sql}",
            paper_scope_binds,
        )
        rows = await cursor.fetchall()

        field_papers: dict[str, list[float | None]] = {}
        for r in rows:
            for f in _parse_json_list(r["fields"]):
                field_papers.setdefault(f, []).append(r["average_score"])

        # Gather per-field atom count via papers -> atom_paper_refs -> atoms
        # Simpler: count atoms whose linked papers belong to the field.
        atom_cursor = await db.execute(
            """
            SELECT apr.atom_slug, p.fields FROM atom_paper_refs apr
            JOIN papers p ON p.paper_id = apr.paper_id
            """ + (f" WHERE {paper_scope}" if paper_scope else ""),
            paper_scope_binds,
        )
        atom_rows = await atom_cursor.fetchall()

        field_atoms: dict[str, set[str]] = {}
        for ar in atom_rows:
            for f in _parse_json_list(ar["fields"]):
                field_atoms.setdefault(f, set()).add(ar["atom_slug"])

        results = []
        for field in sorted(field_papers):
            scores = [s for s in field_papers[field] if s is not None]
            avg = sum(scores) / len(scores) if scores else None
            results.append({
                "field": field,
                "paper_count": len(field_papers[field]),
                "atom_count": len(field_atoms.get(field, set())),
                "avg_score": round(avg, 2) if avg is not None else None,
            })
        return results
    except Exception as exc:
        _raise_resolver_runtime_error("field_overview", exc)


async def year_distribution() -> list[dict[str, Any]]:
    if not _db_exists():
        return []
    try:
        db = await _get_db()
        where_parts = ["p.year IS NOT NULL"]
        binds: list[Any] = []
        _with_paper_scope(where_parts, binds, "p")
        cursor = await db.execute(
            f"SELECT p.year, COUNT(*) as cnt FROM papers p WHERE {' AND '.join(where_parts)} GROUP BY p.year ORDER BY p.year",
            binds,
        )
        return [{"year": r[0], "count": r[1]} for r in await cursor.fetchall()]
    except Exception as exc:
        _raise_resolver_runtime_error("year_distribution", exc)


@_ttl_cache(300)
async def detect_gaps(limit: int = 20) -> dict[str, Any]:
    """Find atoms that bridge different fields (high betweenness centrality proxy)."""
    empty: dict[str, Any] = {"bridge_atoms": [], "weak_connections": [], "total_orphan_atoms": 0}
    if not _db_exists():
        return empty
    try:
        db = await _get_db()
        paper_scope, paper_scope_binds = _paper_scope_where("p")

        # --- Bridge atoms: atoms connected to papers from 3+ fields ---
        # We need to unpack the JSON fields array in Python since SQLite
        # may not have json_each().  Fetch all atom -> paper -> fields rows.
        cursor = await db.execute(
            """
            SELECT a.slug, a.title, a.type, apr.paper_id, p.fields
            FROM atoms a
            JOIN atom_paper_refs apr ON a.slug = apr.atom_slug
            JOIN papers p ON p.paper_id = apr.paper_id
            """ + (f" WHERE {paper_scope}" if paper_scope else ""),
            paper_scope_binds,
        )
        rows = await cursor.fetchall()

        # Build: atom_slug -> {fields: set, paper_ids: set, title, type}
        atom_info: dict[str, dict[str, Any]] = {}
        for r in rows:
            slug = r["slug"]
            if slug not in atom_info:
                atom_info[slug] = {
                    "slug": slug,
                    "title": r["title"],
                    "type": r["type"],
                    "fields": set(),
                    "paper_ids": set(),
                }
            atom_info[slug]["paper_ids"].add(r["paper_id"])
            for f in _parse_json_list(r["fields"]):
                atom_info[slug]["fields"].add(f)

        # Bridge atoms: connected to 3+ different fields
        bridge_atoms = []
        for info in atom_info.values():
            if len(info["fields"]) >= 3:
                bridge_atoms.append({
                    "slug": info["slug"],
                    "title": info["title"],
                    "type": info["type"],
                    "connected_fields": sorted(info["fields"]),
                    "field_count": len(info["fields"]),
                    "paper_count": len(info["paper_ids"]),
                })
        bridge_atoms.sort(key=lambda x: (-x["field_count"], -x["paper_count"]))
        bridge_atoms = bridge_atoms[:limit]

        # --- Orphan atoms: connected to only 1 paper ---
        orphan_count_cursor = await db.execute(
            """
            SELECT COUNT(*) FROM (
                SELECT atom_slug FROM atom_paper_refs
                JOIN library_papers lp ON lp.paper_id = atom_paper_refs.paper_id
                WHERE lp.library_id = ?
                GROUP BY atom_slug HAVING COUNT(DISTINCT atom_paper_refs.paper_id) = 1
            )
            """
            if _active_library_id() is not None
            else """
            SELECT COUNT(*) FROM (
                SELECT atom_slug FROM atom_paper_refs
                GROUP BY atom_slug HAVING COUNT(DISTINCT atom_paper_refs.paper_id) = 1
            )
            """,
            [_active_library_id()] if _active_library_id() is not None else [],
        )
        total_orphan_atoms = (await orphan_count_cursor.fetchone())[0]

        # --- Weak connections: field pairs that share few atoms ---
        # Build: field -> set of atom slugs
        field_atoms: dict[str, set[str]] = {}
        for info in atom_info.values():
            for f in info["fields"]:
                field_atoms.setdefault(f, set()).add(info["slug"])

        fields_list = sorted(field_atoms.keys())
        weak_connections = []
        for i, fa in enumerate(fields_list):
            for fb in fields_list[i + 1:]:
                shared = field_atoms[fa] & field_atoms[fb]
                weak_connections.append({
                    "field_a": fa,
                    "field_b": fb,
                    "shared_atom_count": len(shared),
                })

        # Sort by fewest shared atoms (weakest links first)
        weak_connections.sort(key=lambda x: x["shared_atom_count"])
        weak_connections = weak_connections[:limit]

        return {
            "bridge_atoms": bridge_atoms,
            "weak_connections": weak_connections,
            "total_orphan_atoms": total_orphan_atoms,
        }
    except Exception as exc:
        _raise_resolver_runtime_error("detect_gaps", exc)


@_ttl_cache(300)
async def get_trending_topics(window: int = 1, limit: int = 20) -> list[dict[str, Any]]:
    """Compute trending topics by comparing most recent year to prior years.

    Only uses papers with populated fields/methods data so that NULL-heavy
    older papers don't skew the comparison.

    window=1 means compare latest year vs the previous year.
    Returns: [{name, category, recent_count, historical_avg, growth_rate, trend}]
    where trend is 'rising', 'stable', or 'declining'.
    """
    if not _db_exists():
        return []

    try:
        db = await _get_db()
        paper_scope, paper_scope_binds = _paper_scope_where("p")
        triage_scope, triage_scope_binds = _paper_scope_where("p")

        results: list[dict[str, Any]] = []

        # --- Field trends (only papers that HAVE fields data) ---
        cursor = await db.execute(
            """SELECT p.year, p.fields FROM papers p
               WHERE year IS NOT NULL
                 AND fields IS NOT NULL AND fields != '' AND fields != '[]'"""
            + (f" AND {paper_scope}" if paper_scope else ""),
            paper_scope_binds,
        )
        rows = await cursor.fetchall()

        if rows:
            all_years = [r["year"] for r in rows]
            latest_year = max(all_years)
            prior_year = latest_year - window

            field_year_counts: dict[str, dict[int, int]] = {}
            for r in rows:
                year = r["year"]
                for f in _parse_json_list(r["fields"]):
                    field_year_counts.setdefault(f, {})
                    field_year_counts[f][year] = field_year_counts[f].get(year, 0) + 1

            for field, year_counts in field_year_counts.items():
                latest_count = year_counts.get(latest_year, 0)
                # Average over the `window` prior years
                prior_counts = [year_counts.get(prior_year - i, 0) for i in range(window)]
                prior_avg = sum(prior_counts) / len(prior_counts) if prior_counts else 0

                # Only include fields with at least 3 papers in the latest year
                if latest_count < 3:
                    continue

                if prior_avg > 0:
                    growth_rate = (latest_count - prior_avg) / prior_avg
                elif latest_count > 0:
                    growth_rate = 1.0
                else:
                    growth_rate = 0.0

                if growth_rate > 0.3:
                    trend = "rising"
                elif growth_rate < -0.3:
                    trend = "declining"
                else:
                    trend = "stable"

                results.append({
                    "name": field,
                    "category": "field",
                    "recent_count": latest_count,
                    "historical_avg": round(prior_avg, 2),
                    "growth_rate": round(growth_rate, 4),
                    "trend": trend,
                })

        # --- Method trends (from triage_cards which have method tags) ---
        method_cursor = await db.execute(
            """SELECT tc.methods, tc.year
               FROM triage_cards tc
               JOIN papers p ON p.paper_id = tc.paper_id
               WHERE tc.year IS NOT NULL
                 AND tc.methods IS NOT NULL AND tc.methods != '' AND tc.methods != '[]'"""
            + (f" AND {triage_scope}" if triage_scope else ""),
            triage_scope_binds,
        )
        method_rows = await method_cursor.fetchall()

        if method_rows:
            all_method_years = [r["year"] for r in method_rows]
            latest_method_year = max(all_method_years)
            prior_method_year = latest_method_year - window

            method_year_counts: dict[str, dict[int, int]] = {}
            for r in method_rows:
                year = r["year"]
                for m in _parse_json_list(r["methods"]):
                    method_year_counts.setdefault(m, {})
                    method_year_counts[m][year] = method_year_counts[m].get(year, 0) + 1

            for method_name, year_counts in method_year_counts.items():
                latest_count = year_counts.get(latest_method_year, 0)
                prior_counts = [year_counts.get(prior_method_year - i, 0) for i in range(window)]
                prior_avg = sum(prior_counts) / len(prior_counts) if prior_counts else 0

                # Only include methods with at least 3 papers in the latest year
                if latest_count < 3:
                    continue

                if prior_avg > 0:
                    growth_rate = (latest_count - prior_avg) / prior_avg
                elif latest_count > 0:
                    growth_rate = 1.0
                else:
                    growth_rate = 0.0

                if growth_rate > 0.3:
                    trend = "rising"
                elif growth_rate < -0.3:
                    trend = "declining"
                else:
                    trend = "stable"

                results.append({
                    "name": method_name,
                    "category": "method",
                    "recent_count": latest_count,
                    "historical_avg": round(prior_avg, 2),
                    "growth_rate": round(growth_rate, 4),
                    "trend": trend,
                })

        # Also pull method trends from atoms as a supplement
        atom_cursor = await db.execute(
            """SELECT a.title, p.year
               FROM atoms a
               JOIN atom_paper_refs apr ON a.slug = apr.atom_slug
               JOIN papers p ON p.paper_id = apr.paper_id
               WHERE a.type = 'method' AND p.year IS NOT NULL"""
            + (f" AND {paper_scope}" if paper_scope else ""),
            paper_scope_binds,
        )
        atom_rows = await atom_cursor.fetchall()

        if atom_rows:
            all_atom_years = [r["year"] for r in atom_rows]
            latest_atom_year = max(all_atom_years)
            prior_atom_year = latest_atom_year - window

            # Track which methods we already have from triage_cards
            existing_methods = {r["name"] for r in results if r["category"] == "method"}

            atom_year_counts: dict[str, dict[int, int]] = {}
            for r in atom_rows:
                name = r["title"]
                year = r["year"]
                atom_year_counts.setdefault(name, {})
                atom_year_counts[name][year] = atom_year_counts[name].get(year, 0) + 1

            for method_name, year_counts in atom_year_counts.items():
                if method_name in existing_methods:
                    continue

                latest_count = year_counts.get(latest_atom_year, 0)
                prior_counts = [year_counts.get(prior_atom_year - i, 0) for i in range(window)]
                prior_avg = sum(prior_counts) / len(prior_counts) if prior_counts else 0

                if latest_count < 3:
                    continue

                if prior_avg > 0:
                    growth_rate = (latest_count - prior_avg) / prior_avg
                elif latest_count > 0:
                    growth_rate = 1.0
                else:
                    growth_rate = 0.0

                if growth_rate > 0.3:
                    trend = "rising"
                elif growth_rate < -0.3:
                    trend = "declining"
                else:
                    trend = "stable"

                results.append({
                    "name": method_name,
                    "category": "method",
                    "recent_count": latest_count,
                    "historical_avg": round(prior_avg, 2),
                    "growth_rate": round(growth_rate, 4),
                    "trend": trend,
                })

        # Sort by absolute growth_rate descending and limit
        results.sort(key=lambda x: -abs(x["growth_rate"]))
        return results[:limit]

    except Exception as exc:
        _raise_resolver_runtime_error("get_trending_topics", exc)


@_ttl_cache(300)
async def get_stats() -> dict[str, int]:
    zeros = {
        "total_papers": 0, "total_cards": 0, "total_atoms": 0,
        "total_mechanisms": 0, "total_methods": 0, "total_datasets": 0,
        "total_puzzles": 0, "total_ideas": 0,
    }
    if not _db_exists():
        return zeros
    try:
        db = await _get_db()
        result: dict[str, int] = {}
        paper_scope, paper_scope_binds = _paper_scope_where("p")
        content_library_id = _content_library_id()
        for key, sql, binds in [
            (
                "total_papers",
                "SELECT COUNT(*) FROM papers p" + (f" WHERE {paper_scope}" if paper_scope else ""),
                paper_scope_binds,
            ),
            (
                "total_cards",
                "SELECT COUNT(*) FROM papers p WHERE p.has_card = 1" + (f" AND {paper_scope}" if paper_scope else ""),
                paper_scope_binds,
            ),
            (
                "total_atoms",
                """
                SELECT COUNT(DISTINCT a.slug)
                FROM atoms a
                JOIN atom_paper_refs apr ON a.slug = apr.atom_slug
                JOIN papers p ON p.paper_id = apr.paper_id
                """
                + (f" WHERE {paper_scope}" if paper_scope else ""),
                paper_scope_binds,
            ),
            (
                "total_mechanisms",
                """
                SELECT COUNT(DISTINCT a.slug)
                FROM atoms a
                JOIN atom_paper_refs apr ON a.slug = apr.atom_slug
                JOIN papers p ON p.paper_id = apr.paper_id
                WHERE a.type = 'mechanism'
                """
                + (f" AND {paper_scope}" if paper_scope else ""),
                paper_scope_binds,
            ),
            (
                "total_methods",
                """
                SELECT COUNT(DISTINCT a.slug)
                FROM atoms a
                JOIN atom_paper_refs apr ON a.slug = apr.atom_slug
                JOIN papers p ON p.paper_id = apr.paper_id
                WHERE a.type = 'method'
                """
                + (f" AND {paper_scope}" if paper_scope else ""),
                paper_scope_binds,
            ),
            (
                "total_datasets",
                """
                SELECT COUNT(DISTINCT a.slug)
                FROM atoms a
                JOIN atom_paper_refs apr ON a.slug = apr.atom_slug
                JOIN papers p ON p.paper_id = apr.paper_id
                WHERE a.type = 'dataset'
                """
                + (f" AND {paper_scope}" if paper_scope else ""),
                paper_scope_binds,
            ),
            (
                "total_puzzles",
                """
                SELECT COUNT(DISTINCT a.slug)
                FROM atoms a
                JOIN atom_paper_refs apr ON a.slug = apr.atom_slug
                JOIN papers p ON p.paper_id = apr.paper_id
                WHERE a.type = 'puzzle'
                """
                + (f" AND {paper_scope}" if paper_scope else ""),
                paper_scope_binds,
            ),
            (
                "total_ideas",
                "SELECT COUNT(*) FROM library_ideas WHERE library_id = ?",
                [content_library_id],
            ),
        ]:
            cursor = await db.execute(sql, binds)
            result[key] = (await cursor.fetchone())[0]
        return result
    except Exception as exc:
        _raise_resolver_runtime_error("get_stats", exc)


async def get_whats_changed(since: str) -> dict[str, Any]:
    """Return papers, atoms, and ideas added or updated since a given date."""
    if not _db_exists():
        return {"new_papers": [], "new_atoms": [], "new_ideas": [], "updated_papers": []}
    try:
        db = await _get_db()
        content_library_id = _content_library_id()

        # New papers (registered after 'since' date, approximated by paper_id or year)
        cursor = await db.execute(
            "SELECT * FROM papers WHERE paper_id IN (SELECT paper_id FROM triage_cards WHERE triaged_at >= ?) ORDER BY paper_id DESC LIMIT 50",
            (since,),
        )
        new_papers = [_row_to_paper(r) for r in await cursor.fetchall()]

        # Papers that got new cards since the date
        # (Use card_sections — papers whose sections were recently added)
        cursor2 = await db.execute(
            "SELECT DISTINCT paper_id FROM papers WHERE has_card = 1 AND paper_id NOT IN (SELECT paper_id FROM triage_cards WHERE triaged_at < ?) LIMIT 50",
            (since,),
        )
        updated_ids = [r["paper_id"] for r in await cursor2.fetchall()]
        updated_papers = await get_papers_by_ids(updated_ids) if updated_ids else []

        # New ideas
        cursor3 = await db.execute(
            """
            SELECT *
            FROM library_ideas
            WHERE library_id = ? AND generated_date >= ?
            ORDER BY composite DESC
            LIMIT 20
            """,
            (content_library_id, since),
        )
        new_ideas = []
        for r in await cursor3.fetchall():
            new_ideas.append({
                "id": r["id"], "title": r["title"], "status": r["status"],
                "composite": r["composite"], "generated_date": r["generated_date"],
            })

        # New digests
        cursor4 = await db.execute(
            """
            SELECT date, content
            FROM library_digests
            WHERE library_id = ? AND date >= ?
            ORDER BY date DESC
            LIMIT 10
            """,
            (content_library_id, since),
        )
        new_digests = [{"date": r["date"], "content": r["content"][:200]} for r in await cursor4.fetchall()]

        return {
            "new_papers": new_papers,
            "updated_papers": updated_papers,
            "new_ideas": new_ideas,
            "new_digests": new_digests,
            "total_new_papers": len(new_papers),
            "total_updated_papers": len(updated_papers),
            "total_new_ideas": len(new_ideas),
        }
    except Exception:
        logger.exception("get_whats_changed failed")
        return {"new_papers": [], "updated_papers": [], "new_ideas": [], "new_digests": [],
                "total_new_papers": 0, "total_updated_papers": 0, "total_new_ideas": 0}


async def get_whats_new(limit: int = 10) -> dict[str, Any]:
    """Return the latest papers (by paper_id DESC), recent ideas count, and total papers.

    Since the papers table has no created_at column, we approximate recency
    by sorting on paper_id descending -- NBER working paper numbers are
    sequential, so higher IDs correspond to more recently released papers.
    """
    empty: dict[str, Any] = {
        "latest_papers": [],
        "latest_papers_count": 0,
        "recent_ideas_count": 0,
        "total_papers": 0,
    }
    if not _db_exists():
        return empty
    try:
        db = await _get_db()
        paper_scope, paper_scope_binds = _paper_scope_where("p")
        content_library_id = _content_library_id()

        # Total papers
        cursor = await db.execute(
            "SELECT COUNT(*) FROM papers p" + (f" WHERE {paper_scope}" if paper_scope else ""),
            paper_scope_binds,
        )
        total_papers = (await cursor.fetchone())[0]

        # Latest papers by ID (descending)
        cursor = await db.execute(
            "SELECT p.* FROM papers p"
            + (f" WHERE {paper_scope}" if paper_scope else "")
            + " ORDER BY p.paper_id DESC LIMIT ?",
            paper_scope_binds + [max(1, min(limit, 50))],
        )
        rows = await cursor.fetchall()
        latest_papers = [_row_to_paper(r) for r in rows]
        tldrs = await _prefetch_paper_tldrs(
            db,
            [paper["paper_id"] for paper in latest_papers],
            paper_rows=latest_papers,
        )
        for paper in latest_papers:
            paper["tldr"] = tldrs.get(paper["paper_id"])

        # Recent ideas count (ideas generated in the last 30 days)
        recent_ideas_count = 0
        try:
            cursor = await db.execute(
                """
                SELECT COUNT(*)
                FROM library_ideas
                WHERE library_id = ? AND generated_date >= date('now', '-30 days')
                """,
                (content_library_id,),
            )
            recent_ideas_count = (await cursor.fetchone())[0]
        except Exception:
            # ideas table may not have generated_date or may not exist
            pass

        return {
            "latest_papers": latest_papers,
            "latest_papers_count": len(latest_papers),
            "recent_ideas_count": recent_ideas_count,
            "total_papers": total_papers,
        }
    except Exception:
        logger.exception("get_whats_new failed")
        return empty


# ---------------------------------------------------------------------------
# Bookmark resolvers
# ---------------------------------------------------------------------------

async def get_bookmarks(limit: int = 50, offset: int = 0) -> dict[str, Any]:
    """Return bookmarked papers: {items: [...], total: int}."""
    empty = {"items": [], "total": 0}
    if not _db_exists():
        return empty
    try:
        db = await _get_db()

        count_cursor = await db.execute("SELECT COUNT(*) FROM user_bookmarks")
        total = (await count_cursor.fetchone())[0]

        cursor = await db.execute(
            """
            SELECT p.* FROM papers p
            JOIN user_bookmarks ub ON p.paper_id = ub.paper_id
            ORDER BY ub.created_at DESC
            LIMIT ? OFFSET ?
            """,
            (limit, offset),
        )
        rows = await cursor.fetchall()
        return {"items": [_row_to_paper(r) for r in rows], "total": total}
    except Exception:
        logger.exception("get_bookmarks failed")
        return empty


async def is_bookmarked(paper_id: str) -> bool:
    if not _db_exists():
        return False
    try:
        db = await _get_db()
        cursor = await db.execute(
            "SELECT 1 FROM user_bookmarks WHERE paper_id = ?", (paper_id,)
        )
        return (await cursor.fetchone()) is not None
    except Exception:
        logger.exception("is_bookmarked failed for %s", paper_id)
        return False


async def add_bookmark(paper_id: str) -> bool:
    if not _db_exists():
        return False
    try:
        db = await _get_db()
        await db.execute(
            "INSERT OR IGNORE INTO user_bookmarks (paper_id) VALUES (?)",
            (paper_id,),
        )
        await db.commit()
        return True
    except Exception:
        logger.exception("add_bookmark failed for %s", paper_id)
        return False


async def remove_bookmark(paper_id: str) -> bool:
    if not _db_exists():
        return False
    try:
        db = await _get_db()
        await db.execute(
            "DELETE FROM user_bookmarks WHERE paper_id = ?", (paper_id,)
        )
        await db.commit()
        return True
    except Exception:
        logger.exception("remove_bookmark failed for %s", paper_id)
        return False


# ---------------------------------------------------------------------------
# Reading status resolvers
# ---------------------------------------------------------------------------

async def get_reading_status(paper_id: str) -> str | None:
    if not _db_exists():
        return None
    try:
        db = await _get_db()
        cursor = await db.execute(
            "SELECT status FROM user_reading_status WHERE paper_id = ?",
            (paper_id,),
        )
        row = await cursor.fetchone()
        return row["status"] if row else None
    except Exception:
        logger.exception("get_reading_status failed for %s", paper_id)
        return None


async def set_reading_status(paper_id: str, status: str) -> bool:
    if not _db_exists():
        return False
    try:
        db = await _get_db()
        await db.execute(
            """
            INSERT INTO user_reading_status (paper_id, status, updated_at)
            VALUES (?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(paper_id) DO UPDATE SET
                status = excluded.status,
                updated_at = CURRENT_TIMESTAMP
            """,
            (paper_id, status),
        )
        await db.commit()
        return True
    except Exception:
        logger.exception("set_reading_status failed for %s", paper_id)
        return False


async def get_papers_by_reading_status(
    status: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> dict[str, Any]:
    """Return papers filtered by reading status: {items: [...], total: int}."""
    empty = {"items": [], "total": 0}
    if not _db_exists():
        return empty
    try:
        db = await _get_db()

        where = ""
        binds: list[Any] = []
        if status:
            where = " WHERE urs.status = ?"
            binds.append(status)

        count_cursor = await db.execute(
            f"SELECT COUNT(*) FROM user_reading_status urs{where}", binds
        )
        total = (await count_cursor.fetchone())[0]

        cursor = await db.execute(
            f"""
            SELECT p.* FROM papers p
            JOIN user_reading_status urs ON p.paper_id = urs.paper_id
            {where}
            ORDER BY urs.updated_at DESC
            LIMIT ? OFFSET ?
            """,
            binds + [limit, offset],
        )
        rows = await cursor.fetchall()
        return {"items": [_row_to_paper(r) for r in rows], "total": total}
    except Exception:
        logger.exception("get_papers_by_reading_status failed")
        return empty


# ---------------------------------------------------------------------------
# Notes resolvers
# ---------------------------------------------------------------------------

async def get_note(entity_type: str, entity_id: str) -> dict[str, Any] | None:
    if not _db_exists():
        return None
    try:
        db = await _get_db()
        cursor = await db.execute(
            "SELECT * FROM user_notes WHERE entity_type = ? AND entity_id = ?",
            (entity_type, entity_id),
        )
        row = await cursor.fetchone()
        if row is None:
            return None
        return {
            "id": row["id"],
            "entity_type": row["entity_type"],
            "entity_id": row["entity_id"],
            "note": row["note"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }
    except Exception:
        logger.exception("get_note failed for %s/%s", entity_type, entity_id)
        return None


async def set_note(entity_type: str, entity_id: str, note: str) -> dict[str, Any]:
    """Upsert a note. Returns the saved note dict."""
    empty = {"entity_type": entity_type, "entity_id": entity_id, "note": note}
    if not _db_exists():
        return empty
    try:
        db = await _get_db()
        await db.execute(
            """
            INSERT INTO user_notes (entity_type, entity_id, note, updated_at)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(entity_type, entity_id) DO UPDATE SET
                note = excluded.note,
                updated_at = CURRENT_TIMESTAMP
            """,
            (entity_type, entity_id, note),
        )
        await db.commit()
        return empty
    except Exception:
        logger.exception("set_note failed for %s/%s", entity_type, entity_id)
        return empty


async def delete_note(entity_type: str, entity_id: str) -> bool:
    if not _db_exists():
        return False
    try:
        db = await _get_db()
        await db.execute(
            "DELETE FROM user_notes WHERE entity_type = ? AND entity_id = ?",
            (entity_type, entity_id),
        )
        await db.commit()
        return True
    except Exception:
        logger.exception("delete_note failed for %s/%s", entity_type, entity_id)
        return False


async def get_all_notes(limit: int = 50, offset: int = 0) -> dict[str, Any]:
    """Return all notes: {items: [...], total: int}."""
    empty: dict[str, Any] = {"items": [], "total": 0}
    if not _db_exists():
        return empty
    try:
        db = await _get_db()

        count_cursor = await db.execute("SELECT COUNT(*) FROM user_notes")
        total = (await count_cursor.fetchone())[0]

        cursor = await db.execute(
            "SELECT * FROM user_notes ORDER BY updated_at DESC LIMIT ? OFFSET ?",
            (limit, offset),
        )
        rows = await cursor.fetchall()
        items = [
            {
                "id": r["id"],
                "entity_type": r["entity_type"],
                "entity_id": r["entity_id"],
                "note": r["note"],
                "created_at": r["created_at"],
                "updated_at": r["updated_at"],
            }
            for r in rows
        ]
        return {"items": items, "total": total}
    except Exception:
        logger.exception("get_all_notes failed")
        return empty


# ---------------------------------------------------------------------------
# Backlink resolvers (linked notes)
# ---------------------------------------------------------------------------


async def get_note_backlinks(entity_type: str, entity_id: str) -> list[dict[str, Any]]:
    """Find all notes that reference this entity via [[entity_id]] syntax.

    Scans note content for [[entity_id]] patterns and returns matching notes.
    """
    if not _db_exists():
        return []
    try:
        pattern = f"%[[{entity_id}]]%"
        db = await _get_db()
        cursor = await db.execute(
            "SELECT entity_type, entity_id, note, updated_at FROM user_notes WHERE note LIKE ?",
            (pattern,),
        )
        rows = await cursor.fetchall()
        results = []
        for r in rows:
            # Don't include the entity's own note as a backlink
            if r["entity_type"] == entity_type and r["entity_id"] == entity_id:
                continue
            note_text = r["note"] or ""
            preview = note_text[:100].strip()
            if len(note_text) > 100:
                preview += "..."
            results.append({
                "entity_type": r["entity_type"],
                "entity_id": r["entity_id"],
                "note_preview": preview,
            })
        return results
    except Exception:
        logger.exception("get_note_backlinks failed for %s/%s", entity_type, entity_id)
        return []


# ---------------------------------------------------------------------------
# Digest resolvers
# ---------------------------------------------------------------------------

async def get_digests(limit: int = 30) -> list[dict[str, Any]]:
    """Get all digests ordered by date desc."""
    if not _db_exists():
        return []
    try:
        db = await _get_db()
        scope_sql, scope_binds = _content_scope_where("ld")
        cursor = await db.execute(
            f"SELECT ld.date, ld.content FROM library_digests ld WHERE {scope_sql} ORDER BY ld.date DESC LIMIT ?",
            [*scope_binds, limit],
        )
        return [{"date": r["date"], "content": r["content"]} for r in await cursor.fetchall()]
    except Exception:
        logger.exception("get_digests failed")
        return []


async def get_digest(date: str) -> dict[str, Any] | None:
    """Get a single digest by date."""
    if not _db_exists():
        return None
    try:
        db = await _get_db()
        scope_sql, scope_binds = _content_scope_where("ld")
        cursor = await db.execute(
            f"SELECT ld.date, ld.content FROM library_digests ld WHERE {scope_sql} AND ld.date = ?",
            [*scope_binds, date],
        )
        row = await cursor.fetchone()
        if row is None:
            return None
        return {"date": row["date"], "content": row["content"]}
    except Exception:
        logger.exception("get_digest failed for %s", date)
        return None


# ---------------------------------------------------------------------------
# RAG session resolvers
# ---------------------------------------------------------------------------

async def save_rag_turn(
    session_id: str,
    role: str,
    content: str,
    context_items: list | None = None,
    citations: list | None = None,
) -> None:
    """Save a conversation turn to the session."""
    if not _db_exists():
        return
    try:
        db = await _get_db()
        await db.execute(
            """INSERT INTO rag_sessions (session_id, role, content, context_items, citations)
               VALUES (?, ?, ?, ?, ?)""",
            (
                session_id,
                role,
                content,
                json.dumps(context_items) if context_items else None,
                json.dumps(citations) if citations else None,
            ),
        )
        await db.commit()
    except Exception:
        logger.exception("save_rag_turn failed for session %s", session_id)


async def get_session_history(session_id: str, max_turns: int = 10) -> list[dict[str, Any]]:
    """Get previous turns for a session, ordered by creation time."""
    if not _db_exists():
        return []
    try:
        db = await _get_db()
        cursor = await db.execute(
            """SELECT role, content FROM rag_sessions
               WHERE session_id = ?
               ORDER BY created_at ASC
               LIMIT ?""",
            (session_id, max_turns * 2),  # *2 because each turn has user + assistant
        )
        return [{"role": r["role"], "content": r["content"]} for r in await cursor.fetchall()]
    except Exception:
        logger.exception("get_session_history failed for session %s", session_id)
        return []


# ---------------------------------------------------------------------------
# Similarity resolvers (embedding-based)
# ---------------------------------------------------------------------------

async def get_similar_papers(paper_id: str, limit: int = 10) -> list[dict]:
    """Get semantically similar papers via embeddings (batch-fetched)."""
    try:
        from embeddings import find_similar_papers as _find_similar, is_loaded
        if not is_loaded():
            return []
        similar = await _find_similar(paper_id, limit=limit)
        if not similar:
            return []
        paper_ids = [s["paper_id"] for s in similar]
        papers_list = await get_papers_by_ids(paper_ids)
        papers_by_id = {p["paper_id"]: p for p in papers_list}
        results = []
        for s in similar:
            paper = papers_by_id.get(s["paper_id"])
            if paper:
                paper["similarity_score"] = s["score"]
                results.append(paper)
        return results
    except Exception:
        logger.exception("get_similar_papers failed for %s", paper_id)
        return []


async def get_similar_atoms(atom_slug: str, limit: int = 10) -> list[dict]:
    """Get semantically similar atoms via embeddings (batch-fetched)."""
    try:
        from embeddings import find_similar_atoms as _find_similar, is_loaded
        if not is_loaded():
            return []
        similar = await _find_similar(atom_slug, limit=limit)
        if not similar:
            return []
        slugs = [s["slug"] for s in similar]
        if _db_exists():
            db = await _get_db()
            placeholders = ", ".join("?" for _ in slugs)
            where_parts = [f"a.slug IN ({placeholders})"]
            binds: list[Any] = list(slugs)
            _with_atom_scope(where_parts, binds, "a")
            cursor = await db.execute(
                "SELECT a.* FROM atoms a WHERE " + " AND ".join(where_parts),
                binds,
            )
            rows = await cursor.fetchall()
            atoms = [_row_to_atom(r) for r in rows]
            atoms_by_slug = {a["slug"]: a for a in atoms}
        else:
            atoms_by_slug = {}
        results = []
        for s in similar:
            atom = atoms_by_slug.get(s["slug"])
            if atom:
                atom["similarity_score"] = s["score"]
                results.append(atom)
        return results
    except Exception:
        logger.exception("get_similar_atoms failed for %s", atom_slug)
        return []


async def get_cooccurring_atoms(slug: str, limit: int = 10) -> list[dict[str, Any]]:
    """Find atoms that frequently appear alongside this one (in the same papers)."""
    if not _db_exists():
        return []
    try:
        db = await _get_db()
        where_parts = ["apr1.atom_slug = ?", "apr2.atom_slug != ?"]
        binds: list[Any] = [slug, slug]
        paper_scope, paper_scope_binds = _paper_scope_where("p")
        if paper_scope:
            where_parts.append(paper_scope)
            binds.extend(paper_scope_binds)
        cursor = await db.execute("""
            SELECT a2.slug, a2.title, a2.type, a2.description,
                   a2.evidence_strength, a2.when_to_use, a2.access, a2.url,
                   COUNT(DISTINCT apr2.paper_id) as co_count
            FROM atom_paper_refs apr1
            JOIN atom_paper_refs apr2 ON apr1.paper_id = apr2.paper_id
            JOIN atoms a2 ON a2.slug = apr2.atom_slug
            JOIN papers p ON p.paper_id = apr2.paper_id
            WHERE """
            + " AND ".join(where_parts)
            + """
            GROUP BY a2.slug
            ORDER BY co_count DESC
            LIMIT ?
        """, [*binds, limit])
        rows = await cursor.fetchall()
        return [
            {
                "slug": r["slug"],
                "title": r["title"],
                "type": r["type"],
                "description": r["description"],
                "evidence_strength": r["evidence_strength"],
                "when_to_use": r["when_to_use"],
                "access": r["access"],
                "url": r["url"],
                "co_count": r["co_count"],
            }
            for r in rows
        ]
    except Exception:
        logger.exception("get_cooccurring_atoms failed for %s", slug)
        return []


# ---------------------------------------------------------------------------
# Research Mode resolvers
# ---------------------------------------------------------------------------

async def research_search_papers(
    query: str,
    filters: dict[str, Any] | None = None,
    sort: str | None = None,
    limit: int = 20,
    offset: int = 0,
) -> dict[str, Any]:
    """Hybrid search for papers + return all matching IDs for landscape analysis.

    Returns: {
        "papers": {"items": [...], "total": N},
        "all_paper_ids": ["w31161", ...]
    }
    """
    empty: dict[str, Any] = {
        "papers": {"items": [], "total": 0},
        "all_paper_ids": [],
    }
    if not _db_exists():
        return empty

    try:
        # 1. Run hybrid search to get up to 200 matching papers
        search_results = await hybrid_search_resolver(
            query, entity_type="paper", limit=200
        )
        search_hits = search_results.get("hits", [])

        if not search_hits:
            return empty

        # 2. Extract paper IDs from search results
        search_paper_ids = [
            h["entity_id"] for h in search_hits if h.get("entity_type") == "paper"
        ]

        if not search_paper_ids:
            return empty

        # 3. Fetch full paper metadata for all matched papers
        db = await _get_db()
        paper_scope, paper_scope_binds = _paper_scope_where("p")

        if paper_scope:
            scoped_placeholders = ", ".join("?" for _ in search_paper_ids)
            scope_cursor = await db.execute(
                f"""
                SELECT p.paper_id
                FROM papers p
                WHERE p.paper_id IN ({scoped_placeholders})
                  AND {paper_scope}
                """,
                [*search_paper_ids, *paper_scope_binds],
            )
            allowed_ids = {row["paper_id"] for row in await scope_cursor.fetchall()}
            search_paper_ids = [pid for pid in search_paper_ids if pid in allowed_ids]
            if not search_paper_ids:
                return empty

        placeholders = ", ".join("?" for _ in search_paper_ids)
        cursor = await db.execute(
            f"SELECT p.* FROM papers p WHERE p.paper_id IN ({placeholders})",
            search_paper_ids,
        )
        rows = await cursor.fetchall()

        papers_by_id = {}
        for r in rows:
            papers_by_id[r["paper_id"]] = _row_to_paper(r)

        # 4. Apply filters
        filtered_papers = []
        for pid in search_paper_ids:
            paper = papers_by_id.get(pid)
            if not paper:
                continue

            if filters:
                # fields filter
                if filters.get("fields"):
                    paper_fields = paper.get("fields", [])
                    if not any(f in paper_fields for f in filters["fields"]):
                        continue

                # year filters
                if filters.get("year_min") is not None:
                    if (paper.get("year") or 0) < filters["year_min"]:
                        continue
                if filters.get("year_max") is not None:
                    if (paper.get("year") or 9999) > filters["year_max"]:
                        continue

                # score filters
                if filters.get("score_min") is not None:
                    if (paper.get("average_score") or 0) < filters["score_min"]:
                        continue
                if filters.get("score_max") is not None:
                    if (paper.get("average_score") or 0) > filters["score_max"]:
                        continue

                # has_card filter
                if filters.get("has_card") is not None:
                    if paper.get("has_card") != filters["has_card"]:
                        continue

                # atom_slugs filter: paper must have at least one of the atoms
                if filters.get("atom_slugs"):
                    atom_placeholders = ", ".join("?" for _ in filters["atom_slugs"])
                    atom_cursor = await db.execute(
                        f"""SELECT 1 FROM atom_paper_refs
                            WHERE paper_id = ?
                            AND atom_slug IN ({atom_placeholders})
                            LIMIT 1""",
                        [pid] + filters["atom_slugs"],
                    )
                    if not await atom_cursor.fetchone():
                        continue

            filtered_papers.append(paper)

        # 5. Sort
        if sort == "year_desc":
            filtered_papers.sort(key=lambda p: -(p.get("year") or 0))
        elif sort == "year_asc":
            filtered_papers.sort(key=lambda p: (p.get("year") or 0))
        elif sort == "score_desc":
            filtered_papers.sort(key=lambda p: -(p.get("average_score") or 0))
        elif sort == "score_asc":
            filtered_papers.sort(key=lambda p: (p.get("average_score") or 0))
        # else: keep relevance order from search

        # 6. Collect all paper IDs, then paginate
        all_paper_ids = [p["paper_id"] for p in filtered_papers]
        total = len(filtered_papers)
        page = filtered_papers[offset : offset + limit]

        return {
            "papers": {"items": page, "total": total},
            "all_paper_ids": all_paper_ids,
        }

    except Exception:
        logger.exception("research_search_papers failed for query=%s", query)
        return empty


async def research_landscape(paper_ids: list[str]) -> dict[str, Any]:
    """Compute landscape analysis over a set of paper IDs.

    Returns methods, datasets, mechanisms, puzzles, field distribution,
    year distribution, china applicability, gaps.
    """
    empty: dict[str, Any] = {
        "methods": [],
        "datasets": [],
        "mechanisms": [],
        "puzzles": [],
        "china_applicability": {
            "high_count": 0,
            "moderate_count": 0,
            "low_count": 0,
            "highlights": [],
        },
        "field_distribution": [],
        "year_distribution": [],
        "gaps": {
            "limitations": [],
            "unused_methods": [],
            "unused_datasets": [],
            "open_questions": [],
        },
    }

    if not paper_ids or not _db_exists():
        return empty

    try:
        db = await _get_db()
        placeholders = ", ".join("?" for _ in paper_ids)

        # --- a. Atom coverage by type ---
        atom_cursor = await db.execute(
            f"""SELECT a.slug, a.title, a.type, a.description,
                       a.evidence_strength, a.access, a.theme,
                       GROUP_CONCAT(DISTINCT apr.paper_id) as paper_ids_csv
                FROM atoms a
                JOIN atom_paper_refs apr ON a.slug = apr.atom_slug
                WHERE apr.paper_id IN ({placeholders})
                GROUP BY a.slug
                ORDER BY COUNT(DISTINCT apr.paper_id) DESC""",
            paper_ids,
        )
        atom_rows = await atom_cursor.fetchall()

        methods = []
        datasets = []
        mechanisms = []
        puzzles = []

        search_set_atom_slugs: set[str] = set()

        for ar in atom_rows:
            search_set_atom_slugs.add(ar["slug"])
            atom_entry = {
                "slug": ar["slug"],
                "title": ar["title"],
                "type": ar["type"],
                "description": ar["description"],
                    "evidence_strength": ar["evidence_strength"],
                    "access": ar["access"],
                    "theme": ar["theme"],
                    "paper_count": len(ar["paper_ids_csv"].split(",")) if ar["paper_ids_csv"] else 0,
                    "paper_ids": ar["paper_ids_csv"].split(",") if ar["paper_ids_csv"] else [],
                }
            atype = ar["type"]
            if atype == "method":
                methods.append(atom_entry)
            elif atype == "dataset":
                datasets.append(atom_entry)
            elif atype == "mechanism":
                mechanisms.append(atom_entry)
            elif atype == "puzzle":
                puzzles.append(atom_entry)

        # --- b. Field distribution ---
        field_cursor = await db.execute(
            f"SELECT fields FROM papers WHERE paper_id IN ({placeholders})",
            paper_ids,
        )
        field_rows = await field_cursor.fetchall()

        field_counts: dict[str, int] = {}
        all_fields: set[str] = set()
        for fr in field_rows:
            for f in _parse_json_list(fr["fields"]):
                field_counts[f] = field_counts.get(f, 0) + 1
                all_fields.add(f)

        field_distribution = [
            {"field": f, "count": c}
            for f, c in sorted(field_counts.items(), key=lambda x: -x[1])
        ]

        # --- c. Year distribution ---
        year_cursor = await db.execute(
            f"""SELECT year, COUNT(*) as cnt
                FROM papers
                WHERE paper_id IN ({placeholders}) AND year IS NOT NULL
                GROUP BY year ORDER BY year""",
            paper_ids,
        )
        year_rows = await year_cursor.fetchall()
        year_distribution = [{"year": yr["year"], "count": yr["cnt"]} for yr in year_rows]

        # --- d. China applicability ---
        china_cursor = await db.execute(
            f"""SELECT cs.paper_id, p.title, cs.content
                FROM card_sections cs
                JOIN papers p ON cs.paper_id = p.paper_id
                WHERE cs.section = 'China Applicability'
                AND cs.paper_id IN ({placeholders})""",
            paper_ids,
        )
        china_rows = await china_cursor.fetchall()

        high_count = 0
        moderate_count = 0
        low_count = 0
        china_highlights = []

        for cr in china_rows:
            content = cr["content"] or ""
            first_100 = content[:100].lower()

            if "highly applicable" in first_100 or "directly applicable" in first_100:
                level = "high"
                high_count += 1
            elif "limited" in first_100 or "not directly" in first_100:
                level = "low"
                low_count += 1
            elif "moderately" in first_100 or "partially" in first_100:
                level = "moderate"
                moderate_count += 1
            else:
                level = "moderate"
                moderate_count += 1

            china_highlights.append({
                "paper_id": cr["paper_id"],
                "paper_title": cr["title"] or cr["paper_id"],
                "applicability_level": level,
                "summary": content[:300],
            })

        china_applicability = {
            "high_count": high_count,
            "moderate_count": moderate_count,
            "low_count": low_count,
            "highlights": china_highlights,
        }

        # --- e. Gap detection (sibling-field set difference) ---
        unused_methods: list[dict[str, Any]] = []
        unused_datasets: list[dict[str, Any]] = []

        if all_fields:
            # Build field LIKE conditions
            field_like_parts = []
            field_like_binds: list[str] = []
            for f in all_fields:
                field_like_parts.append("p.fields LIKE ?")
                field_like_binds.append(f"%{f}%")
            field_like_sql = " OR ".join(field_like_parts)

            # Search set atom slug placeholders
            if search_set_atom_slugs:
                slug_placeholders = ", ".join("?" for _ in search_set_atom_slugs)
                slug_binds = list(search_set_atom_slugs)
            else:
                slug_placeholders = "'__none__'"
                slug_binds = []

            # Unused methods
            unused_method_sql = f"""
                SELECT a.slug, a.title, a.description, a.when_to_use,
                       a.evidence_strength, a.access, a.type, a.theme,
                       COUNT(DISTINCT apr.paper_id) as sibling_usage,
                       GROUP_CONCAT(DISTINCT apr.paper_id) as paper_ids_csv
                FROM atoms a
                JOIN atom_paper_refs apr ON a.slug = apr.atom_slug
                JOIN papers p ON p.paper_id = apr.paper_id
                WHERE a.type = 'method'
                  AND a.slug NOT IN ({slug_placeholders})
                  AND ({field_like_sql})
                GROUP BY a.slug
                ORDER BY sibling_usage DESC
                LIMIT 10
            """
            um_cursor = await db.execute(
                unused_method_sql,
                slug_binds + field_like_binds,
            )
            for r in await um_cursor.fetchall():
                pids_csv = r["paper_ids_csv"] or ""
                unused_methods.append({
                    "slug": r["slug"],
                    "title": r["title"],
                    "type": r["type"],
                    "description": r["description"],
                    "evidence_strength": r["evidence_strength"],
                    "access": r["access"],
                    "theme": r["theme"],
                    "paper_count": r["sibling_usage"],
                    "paper_ids": pids_csv.split(",") if pids_csv else [],
                })

            # Unused datasets (prioritize public access)
            unused_dataset_sql = f"""
                SELECT a.slug, a.title, a.description, a.when_to_use,
                       a.evidence_strength, a.access, a.type, a.theme,
                       COUNT(DISTINCT apr.paper_id) as sibling_usage,
                       GROUP_CONCAT(DISTINCT apr.paper_id) as paper_ids_csv
                FROM atoms a
                JOIN atom_paper_refs apr ON a.slug = apr.atom_slug
                JOIN papers p ON p.paper_id = apr.paper_id
                WHERE a.type = 'dataset'
                  AND a.slug NOT IN ({slug_placeholders})
                  AND ({field_like_sql})
                GROUP BY a.slug
                ORDER BY CASE WHEN a.access = 'public' THEN 0 ELSE 1 END,
                         sibling_usage DESC
                LIMIT 10
            """
            ud_cursor = await db.execute(
                unused_dataset_sql,
                slug_binds + field_like_binds,
            )
            for r in await ud_cursor.fetchall():
                pids_csv = r["paper_ids_csv"] or ""
                unused_datasets.append({
                    "slug": r["slug"],
                    "title": r["title"],
                    "type": r["type"],
                    "description": r["description"],
                    "evidence_strength": r["evidence_strength"],
                    "access": r["access"],
                    "theme": r["theme"],
                    "paper_count": r["sibling_usage"],
                    "paper_ids": pids_csv.split(",") if pids_csv else [],
                })

        # --- f. Limitations and open questions ---
        lim_cursor = await db.execute(
            f"""SELECT cs.paper_id, p.title, cs.content
                FROM card_sections cs
                JOIN papers p ON cs.paper_id = p.paper_id
                WHERE cs.section = 'Limitations & Open Questions'
                AND cs.paper_id IN ({placeholders})""",
            paper_ids,
        )
        lim_rows = await lim_cursor.fetchall()

        limitations: list[dict[str, Any]] = []
        open_questions: list[dict[str, Any]] = []
        seen_texts: set[str] = set()

        for lr in lim_rows:
            content = lr["content"] or ""
            bullets = [b.strip() for b in content.split("\n- ") if b.strip()]
            # Also handle bullets starting at the beginning
            if content.startswith("- "):
                first_parts = content.split("\n- ", 1)
                if first_parts:
                    bullets[0:0] = [first_parts[0].lstrip("- ").strip()]
                    if len(first_parts) > 1 and bullets:
                        bullets = bullets  # already handled

            for bullet in bullets:
                clean = bullet.strip().rstrip(".")
                if clean and clean not in seen_texts:
                    seen_texts.add(clean)
                    entry = {
                        "text": bullet.strip(),
                        "paper_id": lr["paper_id"],
                        "paper_title": lr["title"] or lr["paper_id"],
                    }
                    # Classify: questions go to open_questions, statements to limitations
                    if "?" in bullet or bullet.lower().startswith(("how", "what", "why", "whether", "can", "could")):
                        open_questions.append(entry)
                    else:
                        limitations.append(entry)

                if len(limitations) + len(open_questions) >= 15:
                    break
            if len(limitations) + len(open_questions) >= 15:
                break

        # --- g. Replication candidates ---
        # Atoms in the search set linked to only 1 paper corpus-wide
        replication_cursor = await db.execute(
            f"""SELECT a.slug, a.title, a.type, a.evidence_strength,
                       GROUP_CONCAT(apr.paper_id) as paper_ids_csv
                FROM atoms a
                JOIN atom_paper_refs apr ON a.slug = apr.atom_slug
                WHERE apr.paper_id IN ({placeholders})
                GROUP BY a.slug
                HAVING COUNT(DISTINCT apr.paper_id) = 1
                AND a.type IN ('mechanism', 'method')
                LIMIT 10""",
            paper_ids,
        )
        # replication_candidates stored but not currently returned as separate field
        # They could be added to gaps or as a separate section if needed

        gaps = {
            "limitations": limitations,
            "unused_methods": unused_methods,
            "unused_datasets": unused_datasets,
            "open_questions": open_questions,
        }

        return {
            "methods": methods,
            "datasets": datasets,
            "mechanisms": mechanisms,
            "puzzles": puzzles,
            "china_applicability": china_applicability,
            "field_distribution": field_distribution,
            "year_distribution": year_distribution,
            "gaps": gaps,
        }

    except Exception:
        logger.exception("research_landscape failed")
        return empty


async def research_suggested_questions(
    query: str, paper_ids: list[str]
) -> list[str]:
    """Generate contextual question suggestions based on search analysis.

    Template-based, no LLM required.
    """
    questions: list[str] = []

    # Always include China feasibility
    questions.append(
        "Is it feasible to study this in China? What data would I need?"
    )

    # Check if methods were found (quick check)
    has_methods = False
    if paper_ids and _db_exists():
        try:
            db = await _get_db()
            placeholders = ", ".join("?" for _ in paper_ids)
            cursor = await db.execute(
                f"""SELECT 1 FROM atoms a
                    JOIN atom_paper_refs apr ON a.slug = apr.atom_slug
                    WHERE a.type = 'method'
                    AND apr.paper_id IN ({placeholders})
                    LIMIT 1""",
                paper_ids,
            )
            has_methods = (await cursor.fetchone()) is not None
        except Exception:
            pass

    if has_methods:
        questions.append(
            "What methods haven't been applied to this topic yet?"
        )

    questions.append(
        "What are the main unresolved debates in this literature?"
    )
    questions.append("Who are the key researchers in this area?")
    questions.append(
        "What's the most promising research direction among the identified gaps?"
    )

    return questions[:5]


# ---------------------------------------------------------------------------
# Consensus analysis (LLM-assisted)
# ---------------------------------------------------------------------------

import hashlib

_consensus_cache: dict[str, dict[str, Any]] = {}
_CONSENSUS_CACHE_MAX = 100  # Evict oldest entries when cache exceeds this size


def _consensus_cache_key(query: str, paper_ids: list[str]) -> str:
    """Generate a deterministic cache key from query + paper IDs."""
    blob = query.strip().lower() + "|" + ",".join(sorted(paper_ids))
    return hashlib.sha256(blob.encode()).hexdigest()


async def analyze_consensus(
    paper_ids: list[str], query: str
) -> dict[str, Any]:
    """Classify papers' stance on a research question using an LLM.

    Returns: {
        "supports_count": int,
        "contradicts_count": int,
        "neutral_count": int,
        "items": [{"paper_id", "title", "stance", "reason"}, ...]
    }
    """
    empty: dict[str, Any] = {
        "supports_count": 0,
        "contradicts_count": 0,
        "neutral_count": 0,
        "items": [],
    }

    if not paper_ids or not query.strip():
        return empty

    # Check cache
    cache_key = _consensus_cache_key(query, paper_ids)
    if cache_key in _consensus_cache:
        return _consensus_cache[cache_key]

    # Gather paper info (title + key_findings section)
    paper_summaries: list[dict[str, str]] = []
    for pid in paper_ids[:50]:  # cap at 50 to control cost
        paper = await get_paper(pid)
        if not paper:
            continue
        title = paper.get("title") or "Untitled"

        # Get Key Findings section
        sections = await get_card_sections(pid)
        findings = ""
        for s in sections:
            if s["section"] == "Key Findings":
                findings = s["content"]
                break
        if not findings:
            # Fall back to Research Question section
            for s in sections:
                if s["section"] == "Research Question":
                    findings = s["content"]
                    break

        if not findings:
            # Skip papers without any card content
            continue

        paper_summaries.append({
            "paper_id": pid,
            "title": title,
            "findings": findings[:600],  # Truncate for cost
        })

    if not paper_summaries:
        return empty

    # Build LLM prompt
    papers_block = ""
    for i, ps in enumerate(paper_summaries, 1):
        papers_block += (
            f"\n[{i}] Paper ID: {ps['paper_id']}\n"
            f"Title: {ps['title']}\n"
            f"Key Findings: {ps['findings']}\n"
        )

    prompt = f"""Given the research question: "{query}"

Classify each paper's stance. For each paper, decide:
- SUPPORTS: findings support or are consistent with the question's premise
- CONTRADICTS: findings challenge or are inconsistent with the premise
- NEUTRAL: findings are tangential or don't directly address the question

Papers:
{papers_block}

Respond with ONLY a JSON array (no markdown, no extra text). Each element:
{{"paper_id": "...", "stance": "SUPPORTS|CONTRADICTS|NEUTRAL", "reason": "one sentence"}}
"""

    try:
        from rag import _get_client, _get_model

        client = _get_client("rag")
        response = await client.messages.create(
            model=_get_model("rag"),
            max_tokens=4096,
            messages=[{"role": "user", "content": prompt}],
        )
        raw_text = response.content[0].text.strip()

        # Parse JSON from response (handle markdown code blocks)
        if raw_text.startswith("```"):
            # Strip ```json ... ```
            lines = raw_text.split("\n")
            json_lines = []
            in_block = False
            for line in lines:
                if line.strip().startswith("```") and not in_block:
                    in_block = True
                    continue
                elif line.strip() == "```" and in_block:
                    break
                elif in_block:
                    json_lines.append(line)
            raw_text = "\n".join(json_lines)

        items_raw = json.loads(raw_text)
        if not isinstance(items_raw, list):
            items_raw = [items_raw]

        # Build lookup for titles
        title_map = {ps["paper_id"]: ps["title"] for ps in paper_summaries}

        items = []
        supports = 0
        contradicts = 0
        neutral = 0

        for item in items_raw:
            stance = str(item.get("stance", "NEUTRAL")).upper()
            if stance not in ("SUPPORTS", "CONTRADICTS", "NEUTRAL"):
                stance = "NEUTRAL"
            pid = item.get("paper_id", "")
            reason = item.get("reason", "")

            if stance == "SUPPORTS":
                supports += 1
            elif stance == "CONTRADICTS":
                contradicts += 1
            else:
                neutral += 1

            items.append({
                "paper_id": pid,
                "title": title_map.get(pid, ""),
                "stance": stance,
                "reason": reason,
            })

        result: dict[str, Any] = {
            "supports_count": supports,
            "contradicts_count": contradicts,
            "neutral_count": neutral,
            "items": items,
        }

        # Cache the result (evict oldest if over limit)
        if len(_consensus_cache) >= _CONSENSUS_CACHE_MAX:
            oldest_key = next(iter(_consensus_cache))
            del _consensus_cache[oldest_key]
        _consensus_cache[cache_key] = result
        return result

    except ValueError:
        # No API key configured
        logger.warning("Consensus analysis unavailable: LLM API key not configured")
        return {**empty, "error": "LLM API key not configured"}
    except json.JSONDecodeError:
        logger.exception("Failed to parse LLM response for consensus analysis")
        return {**empty, "error": "Failed to parse LLM response"}
    except Exception:
        logger.exception("Consensus analysis failed")
        return {**empty, "error": "Analysis failed"}


# ---------------------------------------------------------------------------
# Collection resolvers
# ---------------------------------------------------------------------------

async def create_collection(name: str, description: str = "") -> dict[str, Any]:
    """Create a new collection. Returns the created collection dict."""
    if not _db_exists():
        return {}
    try:
        db = await _get_db()
        cursor = await db.execute(
            """INSERT INTO user_collections (name, description)
               VALUES (?, ?)""",
            (name, description),
        )
        await db.commit()
        cid = cursor.lastrowid
        row_cursor = await db.execute(
            "SELECT * FROM user_collections WHERE id = ?", (cid,)
        )
        row = await row_cursor.fetchone()
        if row:
            return {
                "id": row["id"],
                "name": row["name"],
                "description": row["description"],
                "paper_count": 0,
                "created_at": row["created_at"],
            }
        return {}
    except Exception:
        logger.exception("create_collection failed")
        return {}


async def delete_collection(collection_id: int) -> bool:
    if not _db_exists():
        return False
    try:
        db = await _get_db()
        await db.execute(
            "DELETE FROM user_collections WHERE id = ?", (collection_id,)
        )
        await db.commit()
        return True
    except Exception:
        logger.exception("delete_collection failed for %s", collection_id)
        return False


async def rename_collection(collection_id: int, name: str) -> bool:
    if not _db_exists():
        return False
    try:
        db = await _get_db()
        await db.execute(
            """UPDATE user_collections
               SET name = ?, updated_at = CURRENT_TIMESTAMP
               WHERE id = ?""",
            (name, collection_id),
        )
        await db.commit()
        return True
    except Exception:
        logger.exception("rename_collection failed for %s", collection_id)
        return False


async def get_collections() -> list[dict[str, Any]]:
    """Return all collections with paper counts."""
    if not _db_exists():
        return []
    try:
        db = await _get_db()
        cursor = await db.execute(
            """SELECT c.*,
                      (SELECT COUNT(*) FROM collection_papers cp WHERE cp.collection_id = c.id) AS paper_count
               FROM user_collections c
               ORDER BY c.updated_at DESC"""
        )
        rows = await cursor.fetchall()
        return [
            {
                "id": r["id"],
                "name": r["name"],
                "description": r["description"],
                "paper_count": r["paper_count"],
                "created_at": r["created_at"],
            }
            for r in rows
        ]
    except Exception:
        logger.exception("get_collections failed")
        return []


async def get_collection(collection_id: int) -> dict[str, Any] | None:
    """Return a single collection with paper count."""
    if not _db_exists():
        return None
    try:
        db = await _get_db()
        cursor = await db.execute(
            """SELECT c.*,
                      (SELECT COUNT(*) FROM collection_papers cp WHERE cp.collection_id = c.id) AS paper_count
               FROM user_collections c
               WHERE c.id = ?""",
            (collection_id,),
        )
        row = await cursor.fetchone()
        if row is None:
            return None
        return {
            "id": row["id"],
            "name": row["name"],
            "description": row["description"],
            "paper_count": row["paper_count"],
            "created_at": row["created_at"],
        }
    except Exception:
        logger.exception("get_collection failed for %s", collection_id)
        return None


async def add_to_collection(collection_id: int, paper_id: str) -> bool:
    if not _db_exists():
        return False
    try:
        db = await _get_db()
        await db.execute(
            """INSERT OR IGNORE INTO collection_papers (collection_id, paper_id)
               VALUES (?, ?)""",
            (collection_id, paper_id),
        )
        await db.execute(
            "UPDATE user_collections SET updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (collection_id,),
        )
        await db.commit()
        return True
    except Exception:
        logger.exception("add_to_collection failed for %s/%s", collection_id, paper_id)
        return False


async def remove_from_collection(collection_id: int, paper_id: str) -> bool:
    if not _db_exists():
        return False
    try:
        db = await _get_db()
        await db.execute(
            "DELETE FROM collection_papers WHERE collection_id = ? AND paper_id = ?",
            (collection_id, paper_id),
        )
        await db.commit()
        return True
    except Exception:
        logger.exception("remove_from_collection failed for %s/%s", collection_id, paper_id)
        return False


async def get_collection_papers(
    collection_id: int, limit: int = 100, offset: int = 0
) -> dict[str, Any]:
    """Return papers in a collection: {items: [...], total: int}."""
    empty: dict[str, Any] = {"items": [], "total": 0}
    if not _db_exists():
        return empty
    try:
        db = await _get_db()

        count_cursor = await db.execute(
            "SELECT COUNT(*) FROM collection_papers WHERE collection_id = ?",
            (collection_id,),
        )
        total = (await count_cursor.fetchone())[0]

        cursor = await db.execute(
            """SELECT p.* FROM papers p
               JOIN collection_papers cp ON p.paper_id = cp.paper_id
               WHERE cp.collection_id = ?
               ORDER BY cp.added_at DESC
               LIMIT ? OFFSET ?""",
            (collection_id, limit, offset),
        )
        rows = await cursor.fetchall()
        return {"items": [_row_to_paper(r) for r in rows], "total": total}
    except Exception:
        logger.exception("get_collection_papers failed for %s", collection_id)
        return empty


async def get_collection_paper_ids(collection_id: int) -> list[str]:
    """Return all paper IDs in a collection (for lit review)."""
    if not _db_exists():
        return []
    try:
        db = await _get_db()
        cursor = await db.execute(
            "SELECT paper_id FROM collection_papers WHERE collection_id = ? ORDER BY added_at DESC",
            (collection_id,),
        )
        return [r[0] for r in await cursor.fetchall()]
    except Exception:
        logger.exception("get_collection_paper_ids failed for %s", collection_id)
        return []


async def get_paper_collections(paper_id: str) -> list[dict[str, Any]]:
    """Return which collections contain this paper."""
    if not _db_exists():
        return []
    try:
        db = await _get_db()
        cursor = await db.execute(
            """SELECT c.id, c.name, c.description,
                      (SELECT COUNT(*) FROM collection_papers cp2 WHERE cp2.collection_id = c.id) AS paper_count,
                      c.created_at
               FROM user_collections c
               JOIN collection_papers cp ON c.id = cp.collection_id
               WHERE cp.paper_id = ?
               ORDER BY c.name""",
            (paper_id,),
        )
        rows = await cursor.fetchall()
        return [
            {
                "id": r["id"],
                "name": r["name"],
                "description": r["description"],
                "paper_count": r["paper_count"],
                "created_at": r["created_at"],
            }
            for r in rows
        ]
    except Exception:
        logger.exception("get_paper_collections failed for %s", paper_id)
        return []


# ---------------------------------------------------------------------------
# Author profile resolvers
# ---------------------------------------------------------------------------

async def get_author_profile(name: str) -> dict[str, Any] | None:
    """Get author profile with papers, co-authors, fields, methods."""
    if not _db_exists():
        return None

    try:
        db = await _get_db()

        # Find all papers where this author appears (case-insensitive)
        cursor = await db.execute(
            "SELECT * FROM papers WHERE authors IS NOT NULL AND authors != '' AND authors != '[]'"
        )
        all_rows = await cursor.fetchall()

        name_lower = name.lower()
        matching_papers = []
        for row in all_rows:
            try:
                authors = json.loads(row["authors"])
                if isinstance(authors, list):
                    for a in authors:
                        if isinstance(a, str) and a.strip().lower() == name_lower:
                            matching_papers.append(row)
                            break
            except (json.JSONDecodeError, TypeError):
                pass

        if not matching_papers:
            return None

        # Determine the canonical name (exact casing from the first match)
        canonical_name = name
        for row in matching_papers:
            try:
                authors = json.loads(row["authors"])
                for a in authors:
                    if isinstance(a, str) and a.strip().lower() == name_lower:
                        canonical_name = a.strip()
                        break
                break
            except (json.JSONDecodeError, TypeError):
                pass

        papers = [_row_to_paper(r) for r in matching_papers]
        paper_ids = {p["paper_id"] for p in papers}

        # Co-authors
        from collections import Counter
        coauthor_counts: Counter[str] = Counter()
        for row in matching_papers:
            try:
                authors = json.loads(row["authors"])
                if isinstance(authors, list):
                    for a in authors:
                        if isinstance(a, str) and a.strip().lower() != name_lower:
                            coauthor_counts[a.strip()] += 1
            except (json.JSONDecodeError, TypeError):
                pass

        coauthors = [
            {"name": n, "shared_papers": c}
            for n, c in sorted(coauthor_counts.items(), key=lambda x: (-x[1], x[0]))
        ]

        # Fields
        field_counts: Counter[str] = Counter()
        for p in papers:
            for f in p.get("fields", []):
                field_counts[f] += 1
        fields = [
            {"field": f, "count": c}
            for f, c in sorted(field_counts.items(), key=lambda x: (-x[1], x[0]))
        ]

        # Methods (from triage_cards)
        method_counts: Counter[str] = Counter()
        if paper_ids:
            placeholders = ",".join("?" for _ in paper_ids)
            cursor = await db.execute(
                f"SELECT methods FROM triage_cards WHERE paper_id IN ({placeholders}) AND methods IS NOT NULL",
                list(paper_ids),
            )
            method_rows = await cursor.fetchall()
            for mrow in method_rows:
                try:
                    methods = json.loads(mrow[0])
                    if isinstance(methods, list):
                        for m in methods:
                            if isinstance(m, str) and m.strip():
                                method_counts[m.strip()] += 1
                except (json.JSONDecodeError, TypeError):
                    pass

        methods = [
            {"field": m, "count": c}
            for m, c in sorted(method_counts.items(), key=lambda x: (-x[1], x[0]))
        ]

        # Average score
        scores = [p["average_score"] for p in papers if p.get("average_score") is not None]
        avg_score = sum(scores) / len(scores) if scores else None

        return {
            "name": canonical_name,
            "paper_count": len(papers),
            "avg_score": avg_score,
            "papers": papers,
            "coauthors": coauthors,
            "fields": fields,
            "methods": methods,
        }
    except Exception:
        logger.exception("get_author_profile failed for %s", name)
        return None


async def get_top_authors(limit: int = 20) -> list[dict[str, Any]]:
    """Get most prolific authors in the KB."""
    index = await _load_author_index()
    return [
        {"name": name, "paper_count": count}
        for name, count in index[:limit]
    ]


# ---------------------------------------------------------------------------
# Personalized feed resolver
# ---------------------------------------------------------------------------


def _score_personalized_feed_candidates(
    vectors: Any,
    ids: list[str],
    user_indices: list[int],
    limit: int,
) -> list[tuple[str, float]]:
    import numpy as np

    user_vec = np.mean(vectors[user_indices], axis=0)
    norm = np.linalg.norm(user_vec)
    if not np.isfinite(norm) or norm <= 0:
        return []

    user_vec = user_vec / norm
    with np.errstate(over="ignore", divide="ignore", invalid="ignore"):
        scores = vectors @ user_vec

    for idx in user_indices:
        scores[idx] = -1

    safe_scores = np.nan_to_num(scores, nan=-1.0, posinf=-1.0, neginf=-1.0)
    top_indices = np.argsort(-safe_scores)[:limit]

    ranked: list[tuple[str, float]] = []
    for i in top_indices:
        score = float(safe_scores[i])
        if score <= 0 or not np.isfinite(score):
            continue
        ranked.append((ids[i], score))
    return ranked

async def get_personalized_feed(limit: int = 10) -> list[dict[str, Any]]:
    """Get papers the user hasn't seen, ranked by relevance to their interests.

    Algorithm:
    1. Get user's bookmarked + read papers
    2. Compute average embedding of those papers
    3. Find papers NOT in bookmarks/reading_status that are most similar
    4. Return top N

    Falls back to recent high-scoring papers if user has no interaction data
    or embeddings are not loaded.
    """
    if not _db_exists():
        return []

    try:
        db = await _get_db()

        # 1. Get user paper IDs
        bm_cursor = await db.execute("SELECT paper_id FROM user_bookmarks")
        bookmarked_ids = [r[0] for r in await bm_cursor.fetchall()]

        rs_cursor = await db.execute("SELECT paper_id FROM user_reading_status")
        read_ids = [r[0] for r in await rs_cursor.fetchall()]

        user_paper_ids = set(bookmarked_ids + read_ids)

        # 2. Try embedding-based recommendations
        from embeddings import _paper_index, is_loaded

        if user_paper_ids and is_loaded() and _paper_index is not None:
            # Find indices of user's papers in the embedding index
            id_to_idx = {pid: i for i, pid in enumerate(_paper_index["ids"])}
            user_indices = [id_to_idx[pid] for pid in user_paper_ids if pid in id_to_idx]

            if user_indices:
                ranked = await asyncio.to_thread(
                    _score_personalized_feed_candidates,
                    _paper_index["vectors"],
                    _paper_index["ids"],
                    user_indices,
                    limit,
                )
                results = []
                for paper_id, score in ranked:
                    paper = await get_paper(paper_id)
                    if paper:
                        paper["relevance_score"] = score
                        results.append(paper)
                if results:
                    return results

        # 3. Fallback: recent high-scoring papers the user hasn't seen
        exclusion_clause = ""
        binds: list[Any] = []
        if user_paper_ids:
            placeholders = ",".join("?" for _ in user_paper_ids)
            exclusion_clause = f"AND paper_id NOT IN ({placeholders})"
            binds = list(user_paper_ids)
        binds.append(limit)

        cursor = await db.execute(
            f"""SELECT * FROM papers
                WHERE average_score IS NOT NULL
                {exclusion_clause}
                ORDER BY average_score DESC, year DESC
                LIMIT ?""",
            binds,
        )
        rows = await cursor.fetchall()
        results = []
        for r in rows:
            paper = _row_to_paper(r)
            paper["relevance_score"] = 0.0
            results.append(paper)
        return results
    except Exception:
        logger.exception("get_personalized_feed failed")
        return []


# ---------------------------------------------------------------------------
# Method Advisor
# ---------------------------------------------------------------------------

async def advise_methods(description: str, limit: int = 10) -> list[dict[str, Any]]:
    """Given a research description, recommend appropriate methods.

    Uses semantic search over method atoms to find the most relevant ones.
    Returns methods with relevance scores and when_to_use guidance.
    """
    from embeddings import semantic_search, is_loaded

    if not _db_exists():
        return []

    method_results: list[dict[str, Any]] = []

    if is_loaded():
        # Semantic search over atoms — fetch extra to filter methods
        results = await semantic_search(description, entity_type="atom", limit=limit * 3)

        for r in results:
            atom = await get_atom(r["entity_id"])
            if atom and atom["type"] == "method":
                atom["relevance_score"] = r["score"]
                atom["paper_count"] = await get_atom_paper_count(atom["slug"])
                method_results.append(atom)
                if len(method_results) >= limit:
                    break
    else:
        # Fallback: LIKE search over atoms table for method type
        try:
            db = await _get_db()

            pattern = f"%{description}%"
            cursor = await db.execute(
                """SELECT a.*, COUNT(apr.paper_id) as paper_count
                   FROM atoms a
                   LEFT JOIN atom_paper_refs apr ON a.slug = apr.atom_slug
                   WHERE a.type = 'method'
                     AND (a.title LIKE ? OR a.description LIKE ? OR a.when_to_use LIKE ?)
                   GROUP BY a.slug
                   ORDER BY paper_count DESC
                   LIMIT ?""",
                (pattern, pattern, pattern, limit),
            )
            rows = await cursor.fetchall()
            for row in rows:
                atom = _row_to_atom(row)
                atom["relevance_score"] = 0.5
                atom["paper_count"] = row["paper_count"]
                method_results.append(atom)
        except Exception:
            logger.exception("advise_methods FTS fallback failed")

    return method_results


# ---------------------------------------------------------------------------
# Thematic Clustering
# ---------------------------------------------------------------------------

def _simple_kmeans(vectors: "np.ndarray", k: int, max_iter: int = 50) -> list[int]:
    """Simple k-means clustering using cosine similarity on normalized vectors."""
    import numpy as np

    n = len(vectors)
    if n <= k:
        return list(range(n))

    rng = np.random.default_rng(42)
    indices = rng.choice(n, k, replace=False)
    centroids = vectors[indices].copy()

    labels = np.zeros(n, dtype=int)
    for _ in range(max_iter):
        distances = vectors @ centroids.T
        labels = np.argmax(distances, axis=1)

        new_centroids = np.zeros_like(centroids)
        for i in range(k):
            mask = labels == i
            if mask.any():
                new_centroids[i] = vectors[mask].mean(axis=0)
                norm = np.linalg.norm(new_centroids[i])
                if norm > 1e-10:
                    new_centroids[i] /= norm
            else:
                new_centroids[i] = centroids[i]

        if np.allclose(centroids, new_centroids, atol=1e-6):
            break
        centroids = new_centroids

    return labels.tolist()


async def cluster_papers(paper_ids: list[str], n_clusters: int = 0) -> list[dict[str, Any]]:
    """Cluster papers into thematic groups using embedding k-means.

    If n_clusters=0, auto-select using heuristic (sqrt(N)/2, clamped to 2-8).
    """
    import numpy as np
    from embeddings import _paper_index

    if not paper_ids or not _db_exists():
        return []

    if len(paper_ids) < 4:
        return await _single_cluster(paper_ids)

    if _paper_index is None:
        return await _single_cluster(paper_ids)

    index_ids = _paper_index["ids"]
    index_vectors = _paper_index["vectors"]

    id_to_idx = {}
    for i, pid in enumerate(index_ids):
        id_to_idx[pid] = i

    found_ids = []
    found_vectors = []
    for pid in paper_ids:
        idx = id_to_idx.get(pid)
        if idx is not None:
            found_ids.append(pid)
            found_vectors.append(index_vectors[idx])

    if len(found_ids) < 4:
        return await _single_cluster(paper_ids)

    vectors = np.array(found_vectors, dtype=np.float32)

    if n_clusters <= 0:
        k = max(2, min(8, int(np.sqrt(len(found_ids)) / 2)))
    else:
        k = max(2, min(len(found_ids) // 2, n_clusters))

    labels = _simple_kmeans(vectors, k)

    cluster_map: dict[int, list[str]] = {}
    for pid, label in zip(found_ids, labels):
        cluster_map.setdefault(label, []).append(pid)

    results = []
    try:
        db = await _get_db()

        for cluster_id, cluster_pids in sorted(cluster_map.items()):
            placeholders = ", ".join("?" for _ in cluster_pids)
            cursor = await db.execute(
                f"SELECT * FROM papers WHERE paper_id IN ({placeholders})",
                cluster_pids,
            )
            rows = await cursor.fetchall()
            papers_list = [_row_to_paper(r) for r in rows]

            atom_cursor = await db.execute(
                f"""SELECT a.slug, a.title, a.type, COUNT(*) as cnt
                    FROM atom_paper_refs apr
                    JOIN atoms a ON a.slug = apr.atom_slug
                    WHERE apr.paper_id IN ({placeholders})
                    GROUP BY a.slug
                    ORDER BY cnt DESC
                    LIMIT 5""",
                cluster_pids,
            )
            atom_rows = await atom_cursor.fetchall()
            top_atoms = [
                {
                    "slug": ar["slug"],
                    "title": ar["title"],
                    "type": ar["type"],
                    "paper_count": ar["cnt"],
                }
                for ar in atom_rows
            ]

            if top_atoms:
                label = ", ".join(a["title"] for a in top_atoms[:3])
            else:
                all_fields: list[str] = []
                for p in papers_list:
                    all_fields.extend(p.get("fields", []))
                if all_fields:
                    from collections import Counter
                    label = ", ".join(
                        f for f, _ in Counter(all_fields).most_common(3)
                    )
                else:
                    label = f"Cluster {cluster_id + 1}"

            results.append({
                "cluster_id": cluster_id,
                "label": label,
                "paper_count": len(papers_list),
                "papers": papers_list,
                "top_atoms": top_atoms,
            })
    except Exception:
        logger.exception("cluster_papers failed")
        return []

    return results


async def _single_cluster(paper_ids: list[str]) -> list[dict[str, Any]]:
    """Return all papers in a single cluster (fallback for too-few papers)."""
    if not _db_exists():
        return []
    try:
        db = await _get_db()
        placeholders = ", ".join("?" for _ in paper_ids)
        cursor = await db.execute(
            f"SELECT * FROM papers WHERE paper_id IN ({placeholders})",
            paper_ids,
        )
        rows = await cursor.fetchall()
        papers_list = [_row_to_paper(r) for r in rows]

        atom_cursor = await db.execute(
            f"""SELECT a.slug, a.title, a.type, COUNT(*) as cnt
                FROM atom_paper_refs apr
                JOIN atoms a ON a.slug = apr.atom_slug
                WHERE apr.paper_id IN ({placeholders})
                GROUP BY a.slug
                ORDER BY cnt DESC
                LIMIT 5""",
            paper_ids,
        )
        atom_rows = await atom_cursor.fetchall()
        top_atoms = [
            {
                "slug": ar["slug"],
                "title": ar["title"],
                "type": ar["type"],
                "paper_count": ar["cnt"],
            }
            for ar in atom_rows
        ]

        label = "All results"
        if top_atoms:
            label = ", ".join(a["title"] for a in top_atoms[:3])

        return [{
            "cluster_id": 0,
            "label": label,
            "paper_count": len(papers_list),
            "papers": papers_list,
            "top_atoms": top_atoms,
        }]
    except Exception:
        logger.exception("_single_cluster failed")
        return []


# ---------------------------------------------------------------------------
# China Research Dashboard
# ---------------------------------------------------------------------------

_CHINA_DATASET_KEYWORDS = [
    "CFPS", "CHNS", "CHARLS", "CHIP", "NBS", "Census",
    "Chinese", "China", "CGSS", "CLHLS", "CLDS",
]


async def get_china_dashboard() -> dict[str, Any]:
    """Get China-applicable research overview across all papers.

    Returns: {
        total_high, total_moderate, total_low,
        high_papers: [{paper_id, title, year, fields, average_score, applicability_level, applicability_summary}],
        moderate_papers: [...],
        field_distribution: [{field, high_count, moderate_count}],
        data_mentions: [{field: dataset_name, count: N}],
    }
    """
    empty: dict[str, Any] = {
        "total_high": 0,
        "total_moderate": 0,
        "total_low": 0,
        "high_papers": [],
        "moderate_papers": [],
        "low_papers": [],
        "field_distribution": [],
        "data_mentions": [],
    }

    if not _db_exists():
        return empty

    try:
        db = await _get_db()

        # Fetch all China Applicability sections with paper metadata
        cursor = await db.execute(
            """SELECT cs.paper_id, cs.content, p.title, p.year, p.fields, p.average_score
               FROM card_sections cs
               JOIN papers p ON cs.paper_id = p.paper_id
               WHERE cs.section = 'China Applicability'"""
        )
        rows = await cursor.fetchall()

        high_papers = []
        moderate_papers = []
        low_papers = []
        total_high = 0
        total_moderate = 0
        total_low = 0

        # field -> {high: count, moderate: count}
        field_stats: dict[str, dict[str, int]] = {}
        # dataset -> {count, paper_ids}
        dataset_mentions: dict[str, dict] = {}

        for row in rows:
            content = row["content"] or ""
            first_150 = content[:150].lower()

            # Classify
            if "highly applicable" in first_150 or "directly applicable" in first_150:
                level = "high"
                total_high += 1
            elif "limited" in first_150 or "not directly" in first_150 or "low applicab" in first_150:
                level = "low"
                total_low += 1
            else:
                level = "moderate"
                total_moderate += 1

            fields = _parse_json_list(row["fields"])
            paper_entry = {
                "paper_id": row["paper_id"],
                "title": row["title"],
                "year": row["year"],
                "fields": fields,
                "average_score": row["average_score"],
                "applicability_level": level,
                "applicability_summary": content[:200],
            }

            if level == "high":
                high_papers.append(paper_entry)
            elif level == "moderate":
                moderate_papers.append(paper_entry)
            else:
                low_papers.append(paper_entry)

            # Field distribution
            for f in fields:
                if f not in field_stats:
                    field_stats[f] = {"high": 0, "moderate": 0}
                if level == "high":
                    field_stats[f]["high"] += 1
                elif level == "moderate":
                    field_stats[f]["moderate"] += 1

            # Dataset mentions
            content_lower = content.lower()
            for kw in _CHINA_DATASET_KEYWORDS:
                if kw.lower() in content_lower:
                    if kw not in dataset_mentions:
                        dataset_mentions[kw] = {"count": 0, "paper_ids": set()}
                    dataset_mentions[kw]["count"] += 1
                    dataset_mentions[kw]["paper_ids"].add(row["paper_id"])

        # Sort papers by score descending
        high_papers.sort(key=lambda p: p.get("average_score") or 0, reverse=True)
        moderate_papers.sort(key=lambda p: p.get("average_score") or 0, reverse=True)
        low_papers.sort(key=lambda p: p.get("average_score") or 0, reverse=True)

        # Build paper_id -> title lookup for data mentions
        paper_title_map: dict[str, str] = {}
        for row in rows:
            paper_title_map[row["paper_id"]] = row["title"] or row["paper_id"]

        # Build field distribution
        field_distribution = [
            {"field": f, "high_count": counts["high"], "moderate_count": counts["moderate"]}
            for f, counts in sorted(field_stats.items(), key=lambda x: -(x[1]["high"] + x[1]["moderate"]))
        ]

        # Build data mentions with paper titles
        data_mentions = [
            {
                "field": ds,
                "count": info["count"],
                "paper_ids": sorted(info["paper_ids"]),
                "paper_titles": [
                    {"paper_id": pid, "title": paper_title_map.get(pid, pid)}
                    for pid in sorted(info["paper_ids"])
                ],
            }
            for ds, info in sorted(dataset_mentions.items(), key=lambda x: -x[1]["count"])
        ]

        return {
            "total_high": total_high,
            "total_moderate": total_moderate,
            "total_low": total_low,
            "high_papers": high_papers,
            "moderate_papers": moderate_papers,
            "low_papers": low_papers,
            "field_distribution": field_distribution,
            "data_mentions": data_mentions,
        }

    except Exception:
        logger.exception("get_china_dashboard failed")
        return empty


# ---------------------------------------------------------------------------
# User Idea resolvers (CRUD)
# ---------------------------------------------------------------------------

def _ensure_user_ideas_table() -> None:
    """Create user_ideas table if it doesn't exist (migration safe)."""
    import sqlite3
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS user_ideas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT DEFAULT '',
            status TEXT DEFAULT 'draft',
            research_question TEXT DEFAULT '',
            proposed_method TEXT DEFAULT '',
            data_needed TEXT DEFAULT '',
            notes TEXT DEFAULT '',
            related_paper_ids TEXT DEFAULT '[]',
            related_idea_ids TEXT DEFAULT '[]',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.commit()
    conn.close()


def _row_to_user_idea(row: aiosqlite.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "title": row["title"],
        "description": row["description"] or "",
        "status": row["status"] or "draft",
        "research_question": row["research_question"] or "",
        "proposed_method": row["proposed_method"] or "",
        "data_needed": row["data_needed"] or "",
        "notes": row["notes"] or "",
        "related_paper_ids": _parse_json_list(row["related_paper_ids"]),
        "related_idea_ids": _parse_json_list(row["related_idea_ids"]),
        "created_at": str(row["created_at"] or ""),
        "updated_at": str(row["updated_at"] or ""),
    }


async def create_user_idea(title: str, description: str = "") -> dict[str, Any] | None:
    if not _db_exists():
        return None
    _ensure_user_ideas_table()
    try:
        db = await _get_db()
        cursor = await db.execute(
            "INSERT INTO user_ideas (title, description) VALUES (?, ?)",
            (title, description),
        )
        await db.commit()
        new_id = cursor.lastrowid
        cursor2 = await db.execute("SELECT * FROM user_ideas WHERE id = ?", (new_id,))
        row = await cursor2.fetchone()
        return _row_to_user_idea(row) if row else None
    except Exception:
        logger.exception("create_user_idea failed")
        return None


async def update_user_idea(idea_id: int, fields: dict[str, Any]) -> bool:
    if not _db_exists():
        return False
    _ensure_user_ideas_table()

    allowed = {"title", "description", "status", "research_question",
               "proposed_method", "data_needed", "notes"}
    set_parts = []
    values = []
    for key, val in fields.items():
        if key in allowed and val is not None:
            set_parts.append(f"{key} = ?")
            values.append(val)

    if not set_parts:
        return False

    set_parts.append("updated_at = CURRENT_TIMESTAMP")
    values.append(idea_id)

    try:
        db = await _get_db()
        await db.execute(
            f"UPDATE user_ideas SET {', '.join(set_parts)} WHERE id = ?",
            values,
        )
        await db.commit()
        return True
    except Exception:
        logger.exception("update_user_idea failed for id=%s", idea_id)
        return False


async def delete_user_idea(idea_id: int) -> bool:
    if not _db_exists():
        return False
    _ensure_user_ideas_table()
    try:
        db = await _get_db()
        cursor = await db.execute("DELETE FROM user_ideas WHERE id = ?", (idea_id,))
        await db.commit()
        return cursor.rowcount > 0
    except Exception:
        logger.exception("delete_user_idea failed for id=%s", idea_id)
        return False


async def get_user_ideas(status: str | None = None) -> list[dict[str, Any]]:
    if not _db_exists():
        return []
    _ensure_user_ideas_table()
    try:
        db = await _get_db()
        if status:
            cursor = await db.execute(
                "SELECT * FROM user_ideas WHERE status = ? ORDER BY updated_at DESC",
                (status,),
            )
        else:
            cursor = await db.execute("SELECT * FROM user_ideas ORDER BY updated_at DESC")
        return [_row_to_user_idea(r) for r in await cursor.fetchall()]
    except Exception:
        logger.exception("get_user_ideas failed")
        return []


async def get_user_idea(idea_id: int) -> dict[str, Any] | None:
    if not _db_exists():
        return None
    _ensure_user_ideas_table()
    try:
        db = await _get_db()
        cursor = await db.execute("SELECT * FROM user_ideas WHERE id = ?", (idea_id,))
        row = await cursor.fetchone()
        return _row_to_user_idea(row) if row else None
    except Exception:
        logger.exception("get_user_idea failed for id=%s", idea_id)
        return None


async def add_paper_to_user_idea(idea_id: int, paper_id: str) -> bool:
    if not _db_exists():
        return False
    _ensure_user_ideas_table()
    try:
        db = await _get_db()
        cursor = await db.execute("SELECT related_paper_ids FROM user_ideas WHERE id = ?", (idea_id,))
        row = await cursor.fetchone()
        if not row:
            return False
        current = _parse_json_list(row["related_paper_ids"])
        if paper_id not in current:
            current.append(paper_id)
        await db.execute(
            "UPDATE user_ideas SET related_paper_ids = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (json.dumps(current), idea_id),
        )
        await db.commit()
        return True
    except Exception:
        logger.exception("add_paper_to_user_idea failed")
        return False


async def remove_paper_from_user_idea(idea_id: int, paper_id: str) -> bool:
    if not _db_exists():
        return False
    _ensure_user_ideas_table()
    try:
        db = await _get_db()
        cursor = await db.execute("SELECT related_paper_ids FROM user_ideas WHERE id = ?", (idea_id,))
        row = await cursor.fetchone()
        if not row:
            return False
        current = _parse_json_list(row["related_paper_ids"])
        if paper_id in current:
            current.remove(paper_id)
        await db.execute(
            "UPDATE user_ideas SET related_paper_ids = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (json.dumps(current), idea_id),
        )
        await db.commit()
        return True
    except Exception:
        logger.exception("remove_paper_from_user_idea failed")
        return False


async def link_ideas(idea_id: int, linked_idea_id: int) -> bool:
    """Add linked_idea_id to idea's related_idea_ids JSON array (bidirectional)."""
    if not _db_exists() or idea_id == linked_idea_id:
        return False
    _ensure_user_ideas_table()
    try:
        db = await _get_db()
        # Add linked_idea_id to idea_id's list
        cursor = await db.execute("SELECT related_idea_ids FROM user_ideas WHERE id = ?", (idea_id,))
        row = await cursor.fetchone()
        if not row:
            return False
        current = _parse_json_list(row["related_idea_ids"])
        lid_str = str(linked_idea_id)
        if lid_str not in current:
            current.append(lid_str)
        await db.execute(
            "UPDATE user_ideas SET related_idea_ids = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (json.dumps(current), idea_id),
        )
        # Add idea_id to linked_idea_id's list (bidirectional)
        cursor2 = await db.execute("SELECT related_idea_ids FROM user_ideas WHERE id = ?", (linked_idea_id,))
        row2 = await cursor2.fetchone()
        if row2:
            current2 = _parse_json_list(row2["related_idea_ids"])
            iid_str = str(idea_id)
            if iid_str not in current2:
                current2.append(iid_str)
            await db.execute(
                "UPDATE user_ideas SET related_idea_ids = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (json.dumps(current2), linked_idea_id),
            )
        await db.commit()
        return True
    except Exception:
        logger.exception("link_ideas failed for %s -> %s", idea_id, linked_idea_id)
        return False


async def unlink_ideas(idea_id: int, linked_idea_id: int) -> bool:
    """Remove linked_idea_id from idea's related_idea_ids JSON array (bidirectional)."""
    if not _db_exists():
        return False
    _ensure_user_ideas_table()
    try:
        db = await _get_db()
        # Remove from idea_id's list
        cursor = await db.execute("SELECT related_idea_ids FROM user_ideas WHERE id = ?", (idea_id,))
        row = await cursor.fetchone()
        if not row:
            return False
        current = _parse_json_list(row["related_idea_ids"])
        lid_str = str(linked_idea_id)
        if lid_str in current:
            current.remove(lid_str)
        await db.execute(
            "UPDATE user_ideas SET related_idea_ids = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (json.dumps(current), idea_id),
        )
        # Remove from linked_idea_id's list (bidirectional)
        cursor2 = await db.execute("SELECT related_idea_ids FROM user_ideas WHERE id = ?", (linked_idea_id,))
        row2 = await cursor2.fetchone()
        if row2:
            current2 = _parse_json_list(row2["related_idea_ids"])
            iid_str = str(idea_id)
            if iid_str in current2:
                current2.remove(iid_str)
            await db.execute(
                "UPDATE user_ideas SET related_idea_ids = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (json.dumps(current2), linked_idea_id),
            )
        await db.commit()
        return True
    except Exception:
        logger.exception("unlink_ideas failed for %s -> %s", idea_id, linked_idea_id)
        return False


# ---------------------------------------------------------------------------
# Debate results persistence
# ---------------------------------------------------------------------------

def _ensure_debate_results_table() -> None:
    """Create debate_results table if it doesn't exist (migration safe)."""
    import sqlite3
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS debate_results (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            idea_id TEXT,
            verdict_json TEXT,
            transcript_json TEXT,
            focus_prompt TEXT DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.commit()
    conn.close()


async def save_debate_result(idea_id: str, verdict_json: str, transcript_json: str, focus_prompt: str = "") -> int:
    _ensure_debate_results_table()
    db = await _get_db()
    cursor = await db.execute(
        "INSERT INTO debate_results (idea_id, verdict_json, transcript_json, focus_prompt) VALUES (?, ?, ?, ?)",
        (idea_id, verdict_json, transcript_json, focus_prompt),
    )
    await db.commit()
    return cursor.lastrowid


async def get_debate_history(idea_id: str) -> list[dict]:
    _ensure_debate_results_table()
    if not _db_exists():
        return []
    db = await _get_db()
    cursor = await db.execute(
        "SELECT id, verdict_json, focus_prompt, created_at FROM debate_results WHERE idea_id = ? ORDER BY created_at DESC",
        (idea_id,),
    )
    return [{"id": r["id"], "verdict_json": r["verdict_json"], "focus_prompt": r["focus_prompt"], "created_at": r["created_at"]} for r in await cursor.fetchall()]


# ---------------------------------------------------------------------------
# System-assisted idea refinement
# ---------------------------------------------------------------------------

async def check_idea_novelty(idea_text: str) -> dict[str, Any]:
    """Search for similar papers/ideas. Returns {similar_papers, similar_ideas, is_novel}."""
    result: dict[str, Any] = {"similar_papers": [], "similar_ideas": [], "is_novel": True}

    try:
        from embeddings import semantic_search
        # Search papers
        paper_hits = await semantic_search(idea_text, entity_type="paper", limit=10)
        for hit in paper_hits:
            paper = await get_paper(hit["entity_id"])
            if paper:
                result["similar_papers"].append({
                    "paper_id": paper["paper_id"],
                    "title": paper.get("title"),
                    "year": paper.get("year"),
                    "average_score": paper.get("average_score"),
                    "fields": paper.get("fields", []),
                    "similarity_score": hit["score"],
                })

        # Search ideas (via FTS since system ideas are text-based)
        idea_hits = await search(idea_text, entity_type="idea", limit=5)
        for hit in idea_hits.get("hits", []):
            idea = await get_idea(hit["entity_id"])
            if idea:
                result["similar_ideas"].append(idea)

        # Determine novelty: if top similarity > 0.85, not novel
        if result["similar_papers"] and result["similar_papers"][0].get("similarity_score", 0) > 0.85:
            result["is_novel"] = False

    except Exception:
        logger.exception("check_idea_novelty failed")

    return result


async def suggest_methodology(idea_text: str, limit: int = 10) -> list[dict[str, Any]]:
    """Find method atoms relevant to an idea text."""
    results: list[dict[str, Any]] = []
    try:
        from embeddings import semantic_search
        hits = await semantic_search(idea_text, entity_type="atom", limit=limit * 3)
        for hit in hits:
            atom = await get_atom(hit["entity_id"])
            if atom and atom.get("type") == "method":
                results.append({
                    "slug": atom["slug"],
                    "title": atom["title"],
                    "description": atom.get("description"),
                    "when_to_use": atom.get("when_to_use"),
                    "relevance_score": hit["score"],
                })
                if len(results) >= limit:
                    break
    except Exception:
        logger.exception("suggest_methodology failed")
    return results


async def check_data_availability(idea_text: str, limit: int = 10) -> list[dict[str, Any]]:
    """Find dataset atoms relevant to an idea text."""
    results: list[dict[str, Any]] = []
    try:
        from embeddings import semantic_search
        hits = await semantic_search(idea_text, entity_type="atom", limit=limit * 3)
        for hit in hits:
            atom = await get_atom(hit["entity_id"])
            if atom and atom.get("type") == "dataset":
                results.append({
                    "slug": atom["slug"],
                    "title": atom["title"],
                    "description": atom.get("description"),
                    "access": atom.get("access"),
                    "relevance_score": hit["score"],
                })
                if len(results) >= limit:
                    break
    except Exception:
        logger.exception("check_data_availability failed")
    return results


# ---------------------------------------------------------------------------
# Topic Saturation Analysis
# ---------------------------------------------------------------------------

async def analyze_topic_saturation(
    query: str, paper_ids: list[str] | None = None
) -> dict[str, Any]:
    """Analyze whether a topic is growing, stable, or saturated.

    Uses provided paper_ids or falls back to hybrid search.
    Returns year_trend, growth_phase, annual_growth_rate, method_diversity,
    key_indicators, and a recommendation string.
    """
    empty: dict[str, Any] = {
        "topic": query,
        "total_papers": 0,
        "year_trend": [],
        "growth_phase": "emerging",
        "annual_growth_rate": 0.0,
        "method_diversity": 0.0,
        "key_indicators": [],
        "recommendation": "Not enough data to assess saturation.",
    }
    if not _db_exists():
        return empty

    try:
        # 1. Get paper IDs (use provided or search)
        ids = paper_ids
        if not ids:
            search_results = await hybrid_search_resolver(
                query, entity_type="paper", limit=200
            )
            ids = [
                h["entity_id"]
                for h in search_results.get("hits", [])
                if h.get("entity_type") == "paper"
            ]
        if not ids:
            return empty

        db = await _get_db()
        placeholders = ", ".join("?" for _ in ids)

        # 2. Fetch years for these papers
        cursor = await db.execute(
            f"SELECT paper_id, year FROM papers WHERE paper_id IN ({placeholders}) AND year IS NOT NULL",
            ids,
        )
        rows = await cursor.fetchall()

        if not rows:
            return {**empty, "total_papers": len(ids)}

        # Compute year distribution
        year_counts: dict[int, int] = {}
        for r in rows:
            y = r["year"]
            year_counts[y] = year_counts.get(y, 0) + 1

        year_trend = sorted(
            [{"year": y, "count": c} for y, c in year_counts.items()],
            key=lambda x: x["year"],
        )
        total_papers = sum(c for c in year_counts.values())

        # 3. Compute growth rate: compare last 3 years vs prior 3 years
        all_years = sorted(year_counts.keys())
        max_year = all_years[-1]
        recent_years = {y: c for y, c in year_counts.items() if y >= max_year - 2}
        prior_years = {
            y: c
            for y, c in year_counts.items()
            if max_year - 5 <= y < max_year - 2
        }

        recent_avg = (
            sum(recent_years.values()) / len(recent_years)
            if recent_years
            else 0
        )
        prior_avg = (
            sum(prior_years.values()) / len(prior_years)
            if prior_years
            else 0
        )

        if prior_avg > 0:
            annual_growth_rate = round(
                (recent_avg - prior_avg) / prior_avg, 4
            )
        elif recent_avg > 0:
            annual_growth_rate = 1.0
        else:
            annual_growth_rate = 0.0

        # 4. Method diversity: unique method atoms / total papers
        method_cursor = await db.execute(
            f"""SELECT COUNT(DISTINCT a.slug) as method_count
                FROM atoms a
                JOIN atom_paper_refs apr ON a.slug = apr.atom_slug
                WHERE apr.paper_id IN ({placeholders}) AND a.type = 'method'""",
            ids,
        )
        method_row = await method_cursor.fetchone()
        unique_methods = method_row["method_count"] if method_row else 0
        method_diversity = round(
            min(unique_methods / max(total_papers, 1), 1.0), 3
        )

        # 5. Classify phase
        year_span = max_year - all_years[0] + 1 if len(all_years) > 1 else 1
        recent_concentrated = all(y >= max_year - 3 for y in all_years)

        if total_papers < 10 and recent_concentrated:
            growth_phase = "emerging"
        elif annual_growth_rate > 0.20:
            growth_phase = "growing"
        elif annual_growth_rate < -0.20 or (
            method_diversity > 0.7 and annual_growth_rate <= 0
        ):
            growth_phase = "saturated"
        else:
            growth_phase = "mature"

        # 6. Key indicators
        key_indicators = []

        key_indicators.append({
            "indicator": "Paper volume",
            "value": str(total_papers),
            "interpretation": (
                "Large body of work"
                if total_papers >= 30
                else "Moderate literature"
                if total_papers >= 10
                else "Small/emerging area"
            ),
        })

        key_indicators.append({
            "indicator": "Annual growth",
            "value": f"{annual_growth_rate * 100:+.1f}%",
            "interpretation": (
                "Accelerating interest"
                if annual_growth_rate > 0.2
                else "Decelerating"
                if annual_growth_rate < -0.2
                else "Stable output"
            ),
        })

        key_indicators.append({
            "indicator": "Method diversity",
            "value": f"{method_diversity * 100:.0f}%",
            "interpretation": (
                "Many methods tried (high diversity)"
                if method_diversity > 0.5
                else "Moderate method coverage"
                if method_diversity > 0.2
                else "Few methods explored"
            ),
        })

        key_indicators.append({
            "indicator": "Time span",
            "value": f"{year_span} years",
            "interpretation": (
                "Long-established topic"
                if year_span > 10
                else "Developing area"
                if year_span > 3
                else "Very recent topic"
            ),
        })

        key_indicators.append({
            "indicator": "Unique methods",
            "value": str(unique_methods),
            "interpretation": (
                "Rich methodological toolkit"
                if unique_methods >= 5
                else "Growing toolkit"
                if unique_methods >= 2
                else "Limited methods so far"
            ),
        })

        # 7. Recommendation
        if growth_phase == "emerging":
            recommendation = (
                "This topic is in its early stages with few papers. "
                "There is significant opportunity for foundational contributions "
                "and establishing key empirical facts."
            )
        elif growth_phase == "growing":
            recommendation = (
                "This topic is actively growing with increasing publication volume. "
                "Good time to contribute, but differentiation through novel methods "
                "or data will be important."
            )
        elif growth_phase == "mature":
            recommendation = (
                "This topic has a stable publication volume. Look for underexplored "
                "sub-questions, new data sources, or cross-disciplinary applications "
                "to add value."
            )
        else:  # saturated
            recommendation = (
                "This topic shows signs of saturation with declining output or "
                "exhaustive method coverage. Consider focusing on synthesis, "
                "meta-analysis, or pivoting to related emerging sub-topics."
            )

        return {
            "topic": query,
            "total_papers": total_papers,
            "year_trend": year_trend,
            "growth_phase": growth_phase,
            "annual_growth_rate": annual_growth_rate,
            "method_diversity": method_diversity,
            "key_indicators": key_indicators,
            "recommendation": recommendation,
        }

    except Exception:
        logger.exception("analyze_topic_saturation failed for query=%s", query)
        return empty


# ---------------------------------------------------------------------------
# Paper Debate Context
# ---------------------------------------------------------------------------

async def get_paper_debates(paper_id: str) -> list[dict[str, Any]]:
    """Find debates that mention this paper.

    Searches debate_map and research_landscape Active Debates sections
    for references to the paper_id (e.g., 'w31161').

    Returns: [{title, context, paper_stance, other_papers}]
    """
    if not _db_exists():
        return []

    try:
        debates: list[dict[str, Any]] = []
        seen_titles: set[str] = set()
        debate_map_text = (await get_field_map("debate_map") or {}).get("content", "")
        landscape_text = (await get_field_map("research_landscape") or {}).get("content", "")

        # --- Parse debate_map ---
        if paper_id in debate_map_text:
            _extract_debates_from_debate_map(
                debate_map_text, paper_id, debates, seen_titles
            )

        # --- Parse research_landscape Active Debates sections ---
        if paper_id in landscape_text:
            _extract_debates_from_landscape(
                landscape_text, paper_id, debates, seen_titles
            )

        return debates

    except Exception:
        logger.exception("get_paper_debates failed for paper_id=%s", paper_id)
        return []


def _extract_debates_from_debate_map(
    text: str,
    paper_id: str,
    debates: list[dict[str, Any]],
    seen_titles: set[str],
) -> None:
    """Parse the debate_map markdown and extract debates mentioning paper_id."""
    # Split by ### headings (debate entries)
    sections = re.split(r'\n### ', text)
    for section in sections:
        if paper_id not in section:
            continue

        # Extract title from the first line
        lines = section.strip().split('\n')
        title = lines[0].strip().lstrip('#').strip()
        # Remove leading numbering like "1. "
        title = re.sub(r'^\d+\.\s*', '', title)
        if not title or title in seen_titles:
            continue
        seen_titles.add(title)

        # Determine stance by checking Side A vs Side B context
        stance = _determine_stance(section, paper_id)

        # Extract context: up to ~500 chars surrounding the mention
        context = _extract_context(section, paper_id, max_chars=500)

        # Find other paper IDs mentioned in this debate
        other_papers = _find_paper_ids(section, exclude=paper_id)

        debates.append({
            "title": title,
            "context": context,
            "paper_stance": stance,
            "other_papers": other_papers,
        })


def _extract_debates_from_landscape(
    text: str,
    paper_id: str,
    debates: list[dict[str, Any]],
    seen_titles: set[str],
) -> None:
    """Parse research_landscape Active Debates sections for paper_id mentions."""
    # Find all Active Debates sections
    active_sections = re.findall(
        r'### Active Debates\n(.*?)(?=\n###|\n## |\Z)', text, re.DOTALL
    )

    for section in active_sections:
        if paper_id not in section:
            continue

        # Each debate item typically starts with "**..." or "- **..."
        # Split by bullet points that contain debate descriptions
        debate_items = re.split(r'\n- \*\*', section)
        for item in debate_items:
            if paper_id not in item:
                continue

            # Extract the debate title from the bold text
            title_match = re.match(r'([^*]+)\*\*', item)
            if not title_match:
                # Try to get title from the beginning
                title_match = re.match(r'\*\*([^*]+)\*\*', '**' + item)
            title = title_match.group(1).strip().rstrip(':') if title_match else "Unnamed debate"

            if title in seen_titles:
                continue
            seen_titles.add(title)

            # Determine stance
            stance = _determine_stance(item, paper_id)

            # Extract context
            context = _extract_context(item, paper_id, max_chars=500)

            # Find other paper IDs
            other_papers = _find_paper_ids(item, exclude=paper_id)

            debates.append({
                "title": title,
                "context": context,
                "paper_stance": stance,
                "other_papers": other_papers,
            })


def _determine_stance(text: str, paper_id: str) -> str:
    """Heuristic: check if paper_id appears in a Side A/B block or
    in supporting/challenging context."""
    lower = text.lower()
    pid_lower = paper_id.lower()

    # Find position of paper_id
    pos = lower.find(pid_lower)
    if pos == -1:
        return "discussed"

    # Look at surrounding context (300 chars before)
    context_before = lower[max(0, pos - 300):pos]

    # Check for explicit side markers
    if 'side a' in context_before or 'positive effect' in context_before:
        return "supporting"
    if 'side b' in context_before or 'negative effect' in context_before or 'limited' in context_before:
        return "challenging"

    # Check for "but debate" pattern (common in landscape debates)
    context_around = lower[max(0, pos - 100):min(len(lower), pos + 200)]
    if 'but debate' in context_around or 'challenges' in context_around:
        return "discussed"
    if 'shows' in context_around or 'finds' in context_around or 'documents' in context_around:
        return "supporting"

    return "discussed"


def _extract_context(text: str, paper_id: str, max_chars: int = 500) -> str:
    """Extract surrounding context for a paper_id mention."""
    pos = text.find(paper_id)
    if pos == -1:
        return text[:max_chars]

    start = max(0, pos - max_chars // 2)
    end = min(len(text), pos + max_chars // 2)
    context = text[start:end].strip()

    # Clean up leading/trailing partial lines
    if start > 0:
        nl = context.find('\n')
        if nl != -1 and nl < 50:
            context = context[nl + 1:]

    if end < len(text):
        nl = context.rfind('\n')
        if nl != -1 and len(context) - nl < 50:
            context = context[:nl]

    return context.strip()


def _find_paper_ids(text: str, exclude: str = "") -> list[str]:
    """Find all NBER-style paper IDs (e.g., w31161) in the text."""
    ids = set(re.findall(r'w\d{4,6}', text))
    ids.discard(exclude)
    return sorted(ids)


# ---------------------------------------------------------------------------
# Research Session resolvers
# ---------------------------------------------------------------------------

async def save_research_session(
    title: str,
    query: str,
    filters: str = "{}",
    sort: str = "",
    paper_ids: list[str] | None = None,
    notes: str = "",
) -> dict[str, Any] | None:
    """Save a research session and return its data."""
    try:
        db = await _get_db()
        paper_ids_json = json.dumps(paper_ids or [])
        cursor = await db.execute(
            """INSERT INTO research_sessions (title, query, filters, sort, paper_ids, notes)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (title, query, filters, sort, paper_ids_json, notes),
        )
        await db.commit()
        row_id = cursor.lastrowid
        row_cursor = await db.execute(
            "SELECT * FROM research_sessions WHERE id = ?", (row_id,)
        )
        row = await row_cursor.fetchone()
        if not row:
            return None
        return _row_to_research_session(row)
    except Exception:
        logger.exception("save_research_session failed")
        return None


async def get_research_sessions() -> list[dict[str, Any]]:
    """Return all saved research sessions, newest first."""
    if not _db_exists():
        return []
    try:
        db = await _get_db()
        cursor = await db.execute(
            "SELECT * FROM research_sessions ORDER BY updated_at DESC"
        )
        rows = await cursor.fetchall()
        return [_row_to_research_session(r) for r in rows]
    except Exception:
        logger.exception("get_research_sessions failed")
        return []


async def get_research_session(session_id: int) -> dict[str, Any] | None:
    """Return a single research session by ID."""
    if not _db_exists():
        return None
    try:
        db = await _get_db()
        cursor = await db.execute(
            "SELECT * FROM research_sessions WHERE id = ?", (session_id,)
        )
        row = await cursor.fetchone()
        if not row:
            return None
        return _row_to_research_session(row)
    except Exception:
        logger.exception("get_research_session failed for %s", session_id)
        return None


async def delete_research_session(session_id: int) -> bool:
    """Delete a research session by ID."""
    try:
        db = await _get_db()
        cursor = await db.execute(
            "DELETE FROM research_sessions WHERE id = ?", (session_id,)
        )
        await db.commit()
        return cursor.rowcount > 0
    except Exception:
        logger.exception("delete_research_session failed for %s", session_id)
        return False


async def update_research_session_notes(session_id: int, notes: str) -> bool:
    """Update the notes field of a research session."""
    try:
        db = await _get_db()
        cursor = await db.execute(
            "UPDATE research_sessions SET notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (notes, session_id),
        )
        await db.commit()
        return cursor.rowcount > 0
    except Exception:
        logger.exception("update_research_session_notes failed for %s", session_id)
        return False


def _row_to_research_session(row: aiosqlite.Row) -> dict[str, Any]:
    """Convert a research_sessions row to a dict."""
    return {
        "id": row["id"],
        "title": row["title"],
        "query": row["query"],
        "filters": row["filters"] or "{}",
        "sort": row["sort"] or "",
        "paper_ids": _parse_json_list(row["paper_ids"]),
        "notes": row["notes"] or "",
        "created_at": str(row["created_at"] or ""),
        "updated_at": str(row["updated_at"] or ""),
    }


# ---------------------------------------------------------------------------
# Topic Timeline resolver
# ---------------------------------------------------------------------------

async def topic_timeline(
    query: str, limit_per_year: int = 5
) -> dict[str, Any]:
    """Get papers organized by year for a topic search.

    Returns: {years: [{year, count, papers: [{paper_id, title, has_card, average_score, fields}]}]}
    """
    empty: dict[str, Any] = {"years": []}
    if not _db_exists():
        return empty

    try:
        # 1. Run hybrid search for the query (get top 200 papers)
        search_results = await hybrid_search_resolver(
            query, entity_type="paper", limit=200
        )
        search_hits = search_results.get("hits", [])
        if not search_hits:
            return empty

        paper_ids = [
            h["entity_id"] for h in search_hits if h.get("entity_type") == "paper"
        ]
        if not paper_ids:
            return empty

        # Build a score map from search rank (RRF score)
        score_map: dict[str, float] = {}
        for h in search_hits:
            if h.get("entity_type") == "paper":
                score_map[h["entity_id"]] = h.get("rrf_score", h.get("rank", 0.0))

        db = await _get_db()
        paper_scope, paper_scope_binds = _paper_scope_where("p")
        if paper_scope:
            scoped_placeholders = ", ".join("?" for _ in paper_ids)
            scope_cursor = await db.execute(
                f"""
                SELECT p.paper_id
                FROM papers p
                WHERE p.paper_id IN ({scoped_placeholders})
                  AND {paper_scope}
                """,
                [*paper_ids, *paper_scope_binds],
            )
            allowed_ids = {row["paper_id"] for row in await scope_cursor.fetchall()}
            paper_ids = [pid for pid in paper_ids if pid in allowed_ids]
            if not paper_ids:
                return empty

        placeholders = ", ".join("?" for _ in paper_ids)
        cursor = await db.execute(
            f"SELECT p.* FROM papers p WHERE p.paper_id IN ({placeholders})",
            paper_ids,
        )
        rows = await cursor.fetchall()

        # 2. Group by year
        year_groups: dict[int, list[dict]] = {}
        for r in rows:
            year = r["year"]
            if year is None:
                continue
            paper = _row_to_paper(r)
            paper["search_score"] = score_map.get(paper["paper_id"], 0.0)
            if year not in year_groups:
                year_groups[year] = []
            year_groups[year].append(paper)

        # 3. For each year, sort by search_score desc and limit
        years = []
        for year in sorted(year_groups.keys()):
            papers = year_groups[year]
            papers.sort(key=lambda p: p.get("search_score", 0), reverse=True)
            top_papers = papers[:limit_per_year]
            years.append({
                "year": year,
                "count": len(papers),
                "papers": [
                    {
                        "paper_id": p["paper_id"],
                        "title": p.get("title"),
                        "has_card": p.get("has_card", False),
                        "average_score": p.get("average_score"),
                        "fields": p.get("fields", []),
                    }
                    for p in top_papers
                ],
            })

        return {"years": years}
    except Exception:
        logger.exception("topic_timeline failed for query=%s", query)
        return empty


# ---------------------------------------------------------------------------
# Field Taxonomy & Detail
# ---------------------------------------------------------------------------

async def get_field_taxonomy() -> list[dict[str, Any]]:
    """Get all canonical fields with paper counts and top subtopics (methods, mechanisms, datasets).

    Returns a list of dicts:
      [{field, paper_count, top_methods: [...], top_mechanisms: [...], top_datasets: [...]}]
    """
    if not _db_exists():
        return []
    try:
        db = await _get_db()

        # 1. Build field -> paper_ids mapping
        where_parts = ["p.fields IS NOT NULL", "p.fields != ''", "p.fields != '[]'"]
        binds: list[Any] = []
        _with_paper_scope(where_parts, binds, "p")
        cursor = await db.execute(
            "SELECT p.paper_id, p.fields FROM papers p WHERE " + " AND ".join(where_parts),
            binds,
        )
        rows = await cursor.fetchall()

        field_paper_ids: dict[str, set[str]] = {}
        for r in rows:
            for f in _parse_json_list(r["fields"]):
                field_paper_ids.setdefault(f, set()).add(r["paper_id"])

        # 2. Build paper_id -> atom_slugs mapping
        apr_cursor = await db.execute("SELECT atom_slug, paper_id FROM atom_paper_refs")
        apr_rows = await apr_cursor.fetchall()
        paper_atoms: dict[str, set[str]] = {}
        for ar in apr_rows:
            paper_atoms.setdefault(ar["paper_id"], set()).add(ar["atom_slug"])

        # 3. Load atom metadata (slug -> type, title, theme)
        atom_cursor = await db.execute("SELECT slug, type, title, description, evidence_strength, access, theme FROM atoms")
        atom_rows = await atom_cursor.fetchall()
        atom_info: dict[str, dict] = {}
        for a in atom_rows:
            atom_info[a["slug"]] = {
                "slug": a["slug"],
                "type": a["type"],
                "title": a["title"],
                "description": a["description"],
                "evidence_strength": a["evidence_strength"],
                "access": a["access"],
                "theme": a["theme"],
            }

        # 4. For each field, count top atoms by type
        from collections import Counter
        results = []
        for field in sorted(field_paper_ids, key=lambda f: -len(field_paper_ids[f])):
            pids = field_paper_ids[field]
            # Gather all atom slugs for this field
            type_counts: dict[str, Counter] = {
                "method": Counter(),
                "mechanism": Counter(),
                "dataset": Counter(),
            }
            for pid in pids:
                for slug in paper_atoms.get(pid, set()):
                    info = atom_info.get(slug)
                    if info and info["type"] in type_counts:
                        type_counts[info["type"]][slug] += 1

            def _top_atoms(counter: Counter, limit: int = 8) -> list[dict]:
                out = []
                for slug, count in counter.most_common(limit):
                    info = atom_info[slug]
                    out.append({
                        "slug": info["slug"],
                        "title": info["title"],
                        "type": info["type"],
                        "description": info.get("description"),
                        "evidence_strength": info.get("evidence_strength"),
                        "access": info.get("access"),
                        "theme": info.get("theme"),
                        "paper_count": count,
                        "paper_ids": [],
                    })
                return out

            results.append({
                "field": field,
                "paper_count": len(pids),
                "top_methods": _top_atoms(type_counts["method"]),
                "top_mechanisms": _top_atoms(type_counts["mechanism"]),
                "top_datasets": _top_atoms(type_counts["dataset"]),
            })

        return results
    except Exception as exc:
        _raise_resolver_runtime_error("get_field_taxonomy", exc)


async def get_field_detail(
    field: str,
    *,
    limit: int = 50,
    offset: int = 0,
    sort: str | None = None,
    jel_filter: str | None = None,
) -> dict[str, Any]:
    """Get detailed view of a single field.

    Returns:
      {field, paper_count, papers: {items, total}, methods, mechanisms,
       datasets, puzzles, year_distribution, jel_codes}
    """
    empty: dict[str, Any] = {
        "field": field,
        "paper_count": 0,
        "papers": {"items": [], "total": 0},
        "methods": [],
        "mechanisms": [],
        "datasets": [],
        "puzzles": [],
        "year_distribution": [],
        "jel_codes": [],
    }
    if not _db_exists():
        return empty
    try:
        db = await _get_db()

        # 1. Find all paper_ids in this field (include jel for JEL extraction)
        where_parts = ["p.fields LIKE ?"]
        binds: list[Any] = [f'%"{field}"%']
        _with_paper_scope(where_parts, binds, "p")
        cursor = await db.execute(
            "SELECT p.paper_id, p.fields, p.year, p.jel FROM papers p WHERE "
            + " AND ".join(where_parts),
            binds,
        )
        candidate_rows = await cursor.fetchall()

        # Filter to exact field match (not substring)
        matching_pids: list[str] = []
        year_counts: dict[int, int] = {}
        jel_counter: dict[str, int] = {}  # JEL code -> count
        paper_jel_map: dict[str, list[str]] = {}  # paper_id -> jel codes

        for r in candidate_rows:
            if field in _parse_json_list(r["fields"]):
                pid = r["paper_id"]
                paper_jels = _parse_json_list(r["jel"])
                paper_jel_map[pid] = paper_jels

                # Count JEL codes
                for jel in paper_jels:
                    jel_counter[jel] = jel_counter.get(jel, 0) + 1

                # Apply JEL filter if specified
                if jel_filter:
                    if not any(j.startswith(jel_filter) for j in paper_jels):
                        continue

                matching_pids.append(pid)
                yr = r["year"]
                if yr is not None:
                    year_counts[yr] = year_counts.get(yr, 0) + 1

        total = len(matching_pids)
        if total == 0:
            # Still return JEL codes even if filtered result is empty
            jel_codes = [
                {"code": code, "count": cnt}
                for code, cnt in sorted(jel_counter.items(), key=lambda x: -x[1])
            ]
            empty["jel_codes"] = jel_codes
            return empty

        # 2. Get paginated papers
        order_map = {
            "year_desc": "p.year DESC",
            "year_asc": "p.year ASC",
            "score_desc": "p.average_score DESC",
            "score_asc": "p.average_score ASC",
            "id_desc": "p.paper_id DESC",
        }
        order_sql = order_map.get(sort or "", "p.year DESC")

        placeholders = ", ".join("?" for _ in matching_pids)
        paper_cursor = await db.execute(
            f"SELECT * FROM papers p WHERE p.paper_id IN ({placeholders}) ORDER BY {order_sql} LIMIT ? OFFSET ?",
            matching_pids + [limit, offset],
        )
        paper_rows = await paper_cursor.fetchall()
        papers = [_row_to_paper(r) for r in paper_rows]

        # 3. Get all atoms for papers in this field
        from collections import Counter
        type_counts: dict[str, Counter] = {
            "method": Counter(),
            "mechanism": Counter(),
            "dataset": Counter(),
            "puzzle": Counter(),
        }

        # Get atom links for these papers
        apr_cursor = await db.execute(
            f"SELECT atom_slug, paper_id FROM atom_paper_refs WHERE paper_id IN ({placeholders})",
            matching_pids,
        )
        apr_rows = await apr_cursor.fetchall()

        atom_slugs_needed: set[str] = set()
        for ar in apr_rows:
            atom_slugs_needed.add(ar["atom_slug"])

        # Load atom metadata
        atom_info: dict[str, dict] = {}
        if atom_slugs_needed:
            slug_ph = ", ".join("?" for _ in atom_slugs_needed)
            atom_cursor = await db.execute(
                f"SELECT slug, type, title, description, evidence_strength, access, theme FROM atoms WHERE slug IN ({slug_ph})",
                list(atom_slugs_needed),
            )
            for a in await atom_cursor.fetchall():
                atom_info[a["slug"]] = {
                    "slug": a["slug"],
                    "type": a["type"],
                    "title": a["title"],
                    "description": a["description"],
                    "evidence_strength": a["evidence_strength"],
                    "access": a["access"],
                    "theme": a["theme"],
                }

        # Count occurrences
        for ar in apr_rows:
            info = atom_info.get(ar["atom_slug"])
            if info and info["type"] in type_counts:
                type_counts[info["type"]][ar["atom_slug"]] += 1

        def _build_atoms(counter: Counter, limit_n: int = 20) -> list[dict]:
            out = []
            for slug, count in counter.most_common(limit_n):
                info = atom_info[slug]
                out.append({
                    "slug": info["slug"],
                    "title": info["title"],
                    "type": info["type"],
                    "description": info.get("description"),
                    "evidence_strength": info.get("evidence_strength"),
                    "access": info.get("access"),
                    "theme": info.get("theme"),
                    "paper_count": count,
                    "paper_ids": [],
                })
            return out

        year_dist = [
            {"year": yr, "count": cnt}
            for yr, cnt in sorted(year_counts.items())
        ]

        # Build JEL code list sorted by count
        jel_codes = [
            {"code": code, "count": cnt}
            for code, cnt in sorted(jel_counter.items(), key=lambda x: -x[1])
        ]

        return {
            "field": field,
            "paper_count": total,
            "papers": {"items": papers, "total": total},
            "methods": _build_atoms(type_counts["method"]),
            "mechanisms": _build_atoms(type_counts["mechanism"]),
            "datasets": _build_atoms(type_counts["dataset"]),
            "puzzles": _build_atoms(type_counts["puzzle"]),
            "year_distribution": year_dist,
            "jel_codes": jel_codes,
        }
    except Exception as exc:
        _raise_resolver_runtime_error(f"get_field_detail[{field}]", exc)


async def get_available_fields() -> list[str]:
    """Get all distinct field names from the papers table, sorted by frequency (desc)."""
    if not _db_exists():
        return []
    try:
        from collections import Counter
        counts: Counter = Counter()
        db = await _get_db()
        cursor = await db.execute(
            "SELECT fields FROM papers WHERE fields IS NOT NULL AND fields != '' AND fields != '[]'"
        )
        rows = await cursor.fetchall()
        for r in rows:
            for f in _parse_json_list(r[0]):
                if f.strip():
                    counts[f.strip()] += 1
        return [f for f, _ in counts.most_common()]
    except Exception:
        logger.exception("get_available_fields failed")
        return []


# ---------------------------------------------------------------------------
# Theme hierarchy mapping (Issue 8)
# ---------------------------------------------------------------------------

THEME_HIERARCHY: dict[str, list[str]] = {
    "Causal Inference": [
        "Instrumental Variables", "Difference-in-Differences",
        "Regression Discontinuity", "Matching & Weighting",
        "Synthetic Control", "Randomized Experiments",
    ],
    "Structural & Computational": [
        "Structural Estimation", "Machine Learning",
        "Bayesian Methods", "Time Series",
    ],
    "Design-Based Methods": [
        "Bunching & Kink", "Panel Methods",
        "Spatial Methods", "Survey & Descriptive",
    ],
    "Market & Firm": [
        "Market Power & Competition", "Incentives & Contracts",
        "Information & Signaling", "Regulation & Policy",
    ],
    "People & Behavior": [
        "Human Capital & Skills", "Labor Market",
        "Behavioral", "Insurance & Risk",
        "Technology & Innovation",
    ],
    "Spatial & Urban": ["Spatial & Urban"],
    "Data": [
        "Health Data", "Education Data", "Financial Data",
        "Survey Data", "Government Administrative",
        "Consumer/Retail", "Firm/Establishment",
        "Geospatial", "Other Data",
    ],
    "Puzzles": [
        "Market Anomalies", "Behavioral Puzzles",
        "Policy Puzzles", "Other Puzzles",
    ],
}

# Invert: theme -> meta_theme
_THEME_TO_META: dict[str, str] = {}
for meta, themes in THEME_HIERARCHY.items():
    for t in themes:
        _THEME_TO_META[t] = meta


async def get_atom_theme_hierarchy() -> list[dict[str, Any]]:
    """Return two-level theme hierarchy with atom and paper counts."""
    if not _db_exists():
        return []
    try:
        db = await _get_db()

        # Load all atoms with themes
        cursor = await db.execute(
            "SELECT slug, type, title, description, evidence_strength, theme FROM atoms WHERE theme IS NOT NULL AND theme != ''"
        )
        atom_rows = await cursor.fetchall()

        # Load paper counts per atom
        apr_cursor = await db.execute("SELECT atom_slug, COUNT(*) as cnt FROM atom_paper_refs GROUP BY atom_slug")
        paper_counts: dict[str, int] = {}
        for r in await apr_cursor.fetchall():
            paper_counts[r["atom_slug"]] = r["cnt"]

        # Group atoms by theme
        theme_atoms: dict[str, list[dict]] = {}
        for a in atom_rows:
            theme = a["theme"]
            if theme not in theme_atoms:
                theme_atoms[theme] = []
            theme_atoms[theme].append({
                "slug": a["slug"],
                "type": a["type"],
                "title": a["title"],
                "description": a["description"],
                "evidence_strength": a["evidence_strength"],
                "paper_count": paper_counts.get(a["slug"], 0),
            })

        # Build hierarchy
        result = []
        for meta_theme, sub_themes in THEME_HIERARCHY.items():
            meta_entry = {
                "meta_theme": meta_theme,
                "themes": [],
                "total_atoms": 0,
                "total_papers": 0,
            }
            for theme in sub_themes:
                atoms = theme_atoms.get(theme, [])
                atoms.sort(key=lambda x: -x["paper_count"])
                theme_paper_count = sum(a["paper_count"] for a in atoms)
                meta_entry["themes"].append({
                    "theme": theme,
                    "atoms": atoms,
                    "atom_count": len(atoms),
                    "paper_count": theme_paper_count,
                })
                meta_entry["total_atoms"] += len(atoms)
                meta_entry["total_papers"] += theme_paper_count
            result.append(meta_entry)

        # Add "Other" meta-theme for uncategorized themes
        categorized = set(_THEME_TO_META.keys())
        other_themes = []
        for theme, atoms in theme_atoms.items():
            if theme not in categorized:
                atoms.sort(key=lambda x: -x["paper_count"])
                theme_paper_count = sum(a["paper_count"] for a in atoms)
                other_themes.append({
                    "theme": theme,
                    "atoms": atoms,
                    "atom_count": len(atoms),
                    "paper_count": theme_paper_count,
                })
        if other_themes:
            other_themes.sort(key=lambda x: -x["paper_count"])
            result.append({
                "meta_theme": "Other",
                "themes": other_themes,
                "total_atoms": sum(t["atom_count"] for t in other_themes),
                "total_papers": sum(t["paper_count"] for t in other_themes),
            })

        # Sort meta-themes by total papers descending
        result.sort(key=lambda x: -x["total_papers"])

        return result
    except Exception:
        logger.exception("get_atom_theme_hierarchy failed")
        return []
