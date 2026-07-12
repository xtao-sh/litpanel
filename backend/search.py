"""FTS5 query builder and search helpers."""

from __future__ import annotations

import re
from dataclasses import dataclass


# Characters that have special meaning in FTS5 query syntax
_FTS5_SPECIAL = re.compile(r'[*:^(){}"\-]')


def _escape_token(token: str) -> str:
    """Escape a single token so it is safe for FTS5 MATCH."""
    # Strip special chars; surround the token in double-quotes to treat it
    # as a literal phrase if it still contains unusual characters.
    cleaned = _FTS5_SPECIAL.sub("", token).strip()
    if not cleaned:
        return ""
    # Wrap every token in quotes so punctuation inside is harmless.
    return f'"{cleaned}"'


# Economics method synonyms for query expansion
_SYNONYMS = {
    "did": '"difference in differences"',
    "diff-in-diff": '"difference in differences"',
    "rdd": '"regression discontinuity"',
    "rd": '"regression discontinuity"',
    "iv": '"instrumental variables"',
    "rct": '"randomized controlled trial"',
    "ols": '"ordinary least squares"',
    "fe": '"fixed effects"',
    "re": '"random effects"',
    "gmm": '"generalized method of moments"',
    "ml": '"maximum likelihood"',
    "2sls": '"two stage least squares"',
    "tsls": '"two stage least squares"',
    "ate": '"average treatment effect"',
    "att": '"average treatment effect on the treated"',
    "itt": '"intent to treat"',
    "late": '"local average treatment effect"',
    "bunching": '"bunching estimator"',
    "bartik": '"shift share"',
}


def build_fts_query(user_query: str) -> str:
    """Turn a free-form user string into a safe FTS5 MATCH expression.

    - Preserves quoted phrases the user typed explicitly.
    - Escapes special characters in bare tokens.
    - Joins tokens with implicit AND (FTS5 default).

    Returns an empty string when nothing usable remains.
    """
    user_query = user_query.strip()
    if not user_query:
        return ""

    # Pull out explicitly quoted phrases first
    phrases: list[str] = []
    explicit = re.findall(r'"([^"]+)"', user_query)
    for phrase in explicit:
        cleaned = _FTS5_SPECIAL.sub("", phrase).strip()
        if cleaned:
            phrases.append(f'"{cleaned}"')

    # Remove the quoted segments and process remaining bare words
    remainder = re.sub(r'"[^"]*"', " ", user_query)
    for word in remainder.split():
        escaped = _escape_token(word)
        if escaped:
            phrases.append(escaped)

    # After building phrases list, expand synonyms
    expanded = []
    for phrase in phrases:
        # Extract the word inside quotes
        inner = phrase.strip('"').lower()
        if inner in _SYNONYMS:
            expanded.append(f"({phrase} OR {_SYNONYMS[inner]})")
        else:
            expanded.append(phrase)
    phrases = expanded

    return " ".join(phrases)


@dataclass
class SearchParams:
    """Validated search parameters ready for SQL execution."""

    fts_query: str
    entity_type: str | None
    limit: int


def prepare_search(
    query: str,
    entity_type: str | None = None,
    limit: int = 20,
) -> SearchParams | None:
    """Validate inputs and build search params.

    Returns ``None`` when the query is empty / unparseable.
    """
    fts = build_fts_query(query)
    if not fts:
        return None

    # Clamp limit
    limit = max(1, min(limit, 200))

    # Normalise entity_type — must match values stored in the FTS index
    valid_types = {"paper", "atom", "idea", "map"}
    if entity_type and entity_type.lower() not in valid_types:
        entity_type = None
    elif entity_type:
        entity_type = entity_type.lower()

    return SearchParams(fts_query=fts, entity_type=entity_type, limit=limit)


def search_sql(
    params: SearchParams,
    library_id: int | None = None,
) -> tuple[str, list[object]]:
    """Return (sql, bind_params) for executing an FTS5 search.

    Uses ``highlight()`` to produce ``<mark>``-wrapped snippets.
    """
    binds: list[object] = []

    where_parts = ["search_index MATCH ?"]
    binds.append(params.fts_query)

    if params.entity_type:
        where_parts.append("entity_type = ?")
        binds.append(params.entity_type)

    if library_id is not None:
        where_parts.append("library_id = ?")
        # FTS5 preserves the storage class of unindexed columns. Library IDs
        # are inserted as integers, so binding a string here silently matches
        # no rows even when the visible value is the same (for example 1).
        binds.append(library_id)

    where_clause = " AND ".join(where_parts)

    sql = f"""
        SELECT entity_type, entity_id, title,
               highlight(search_index, 3, '<mark>', '</mark>') AS snippet,
               bm25(search_index, 0.0, 0.0, 10.0, 1.0) AS rank
        FROM search_index
        WHERE {where_clause}
        ORDER BY bm25(search_index, 0.0, 0.0, 10.0, 1.0)
        LIMIT ?
    """
    binds.append(params.limit)

    return sql, binds


def count_sql(
    params: SearchParams,
    library_id: int | None = None,
) -> tuple[str, list[object]]:
    """Return (sql, bind_params) to count total matches (ignoring limit)."""
    binds: list[object] = []

    where_parts = ["search_index MATCH ?"]
    binds.append(params.fts_query)

    if params.entity_type:
        where_parts.append("entity_type = ?")
        binds.append(params.entity_type)

    if library_id is not None:
        where_parts.append("library_id = ?")
        binds.append(library_id)

    where_clause = " AND ".join(where_parts)

    sql = f"""
        SELECT COUNT(*) FROM search_index
        WHERE {where_clause}
    """
    return sql, binds
