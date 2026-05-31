"""RAG (Retrieval-Augmented Generation) Q&A pipeline for the research knowledge base.

Steps:
1. Query Expansion — generate search variations from the user question
2. Retrieval — run FTS5 + structured queries, deduplicate
3. Context Assembly — fetch full content, build prompt context within token budget
4. LLM Generation — stream answer via Kimi Coding API (Anthropic-compatible)
"""

from __future__ import annotations

import json
import logging
import re
import uuid
from typing import Any, AsyncGenerator, Optional

import resolvers
from config import (
    APP_NAME,
    SOURCE_NAME,
    SOURCE_PAPER_LABEL,
)
from llm_runtime import (
    LLMConnectionError,
    LLMStatusError,
    build_async_client,
    resolve_step_runtime,
)
from search import prepare_search, search_sql

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = (
    f"You are a research assistant working inside {APP_NAME}. "
    "Answer questions based on the provided knowledge base content. "
    "Cite paper IDs when referencing findings. "
    "If the knowledge base doesn't contain relevant information, say so. "
    "Be concise and precise."
)

# Token budget for assembled context (~4 chars per token)
_CONTEXT_CHAR_BUDGET = 32_000
_MAX_ITEM_CHARS = 3_000  # truncate any single item beyond this

# Session history budget (~4 chars per token, keep history compact)
_HISTORY_CHAR_BUDGET = 4_000


def _build_history_messages(history: list[dict[str, str]]) -> list[dict[str, str]]:
    """Convert session history to LLM message format, respecting char budget.

    Drops oldest turns if total chars exceed _HISTORY_CHAR_BUDGET.
    """
    if not history:
        return []

    # Calculate total chars
    total_chars = sum(len(turn["content"]) for turn in history)

    # If within budget, return all
    if total_chars <= _HISTORY_CHAR_BUDGET:
        return [{"role": turn["role"], "content": turn["content"]} for turn in history]

    # Otherwise, drop oldest turns (always in pairs to keep user/assistant alternation)
    trimmed = list(history)
    while len(trimmed) >= 2 and sum(len(t["content"]) for t in trimmed) > _HISTORY_CHAR_BUDGET:
        # Drop the oldest pair (user + assistant)
        trimmed = trimmed[2:]

    return [{"role": turn["role"], "content": turn["content"]} for turn in trimmed]


_client_cache: dict[str, Any] = {}


def _get_client(step: str = "rag"):
    client = _client_cache.get(step)
    if client is None:
        client = build_async_client(step)
        _client_cache[step] = client
    return client


def _get_model(step: str = "rag") -> str:
    return str(resolve_step_runtime(step)["model"])


def reset_llm_clients() -> None:
    _client_cache.clear()


# ---------------------------------------------------------------------------
# Step 1: Query Expansion
# ---------------------------------------------------------------------------

# Common English stop words to filter out when extracting key terms
_STOP_WORDS = frozenset({
    "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "shall", "can", "need", "must",
    "to", "of", "in", "for", "on", "with", "at", "by", "from", "as",
    "into", "through", "during", "before", "after", "above", "below",
    "between", "out", "off", "over", "under", "again", "further", "then",
    "once", "here", "there", "when", "where", "why", "how", "all", "each",
    "every", "both", "few", "more", "most", "other", "some", "such", "no",
    "nor", "not", "only", "own", "same", "so", "than", "too", "very",
    "and", "but", "or", "if", "while", "because", "until", "about",
    "what", "which", "who", "whom", "this", "that", "these", "those",
    "i", "me", "my", "we", "our", "you", "your", "he", "him", "she",
    "her", "it", "its", "they", "them", "their",
})

# Pattern to detect paper IDs like w31161
_PAPER_ID_RE = re.compile(r"\bw\d{4,6}\b", re.IGNORECASE)


def expand_query(question: str) -> list[str]:
    """Generate 3-5 search queries from the user question.

    Heuristic approach: extract key terms, build variations.
    """
    # Normalise whitespace
    q = question.strip()
    if not q:
        return []

    # Extract non-stop-word tokens
    tokens = [t for t in re.findall(r"[a-zA-Z0-9_\-]+", q.lower()) if t not in _STOP_WORDS]
    if not tokens:
        return [q]

    queries: list[str] = []

    # 1. All key terms together
    queries.append(" ".join(tokens))

    # 2. If more than 3 tokens, also try first-half and second-half
    if len(tokens) > 3:
        mid = len(tokens) // 2
        queries.append(" ".join(tokens[:mid]))
        queries.append(" ".join(tokens[mid:]))

    # 3. Bigram phrases (sliding window)
    if len(tokens) >= 2:
        for i in range(min(len(tokens) - 1, 3)):
            bigram = f"{tokens[i]} {tokens[i + 1]}"
            if bigram not in queries:
                queries.append(bigram)

    # 4. Original question (lightly cleaned) if different from first entry
    cleaned = re.sub(r"[?!.,;:]+", "", q).strip()
    if cleaned.lower() != queries[0]:
        queries.append(cleaned)

    # Deduplicate while preserving order
    seen: set[str] = set()
    unique: list[str] = []
    for query in queries:
        key = query.lower().strip()
        if key and key not in seen:
            seen.add(key)
            unique.append(query)

    return unique[:5]


def _detect_entity_hints(question: str) -> dict[str, Any]:
    """Detect structured query hints from the question.

    Returns a dict with optional keys:
      - paper_ids: list of paper IDs mentioned
      - atom_type: 'method' | 'mechanism' | 'dataset' | 'puzzle' if relevant
      - field: field name if mentioned
    """
    hints: dict[str, Any] = {}
    q_lower = question.lower()

    # Paper IDs
    paper_ids = _PAPER_ID_RE.findall(question)
    if paper_ids:
        hints["paper_ids"] = [pid.lower() for pid in paper_ids]

    # Atom type keywords
    method_words = {"method", "methods", "methodology", "identification", "estimat", "technique"}
    mechanism_words = {"mechanism", "mechanisms", "channel", "channels", "pathway"}
    dataset_words = {"dataset", "datasets", "data source", "data"}
    puzzle_words = {"puzzle", "puzzles", "paradox", "anomaly"}

    if any(w in q_lower for w in method_words):
        hints["atom_type"] = "method"
    elif any(w in q_lower for w in mechanism_words):
        hints["atom_type"] = "mechanism"
    elif any(w in q_lower for w in dataset_words):
        hints["atom_type"] = "dataset"
    elif any(w in q_lower for w in puzzle_words):
        hints["atom_type"] = "puzzle"

    # Field detection (common economics fields)
    field_keywords = {
        "io": "Industrial Organization",
        "industrial organization": "Industrial Organization",
        "health econ": "Health Economics",
        "health economics": "Health Economics",
        "digital economy": "Digital Economy & AI",
        "ai": "Digital Economy & AI",
        "artificial intelligence": "Digital Economy & AI",
        "product innovation": "Product Innovation",
        "empirical methods": "Empirical Methods",
        "econometrics": "Empirical Methods",
        "labor": "Labor Economics",
        "finance": "Finance",
        "trade": "International Trade",
        "macro": "Macroeconomics",
        "public finance": "Public Finance",
    }
    for kw, field in field_keywords.items():
        if kw in q_lower:
            hints["field"] = field
            break

    return hints


# ---------------------------------------------------------------------------
# Step 2: Retrieval
# ---------------------------------------------------------------------------

async def _retrieve(
    question: str,
    max_results: int = 20,
) -> list[dict[str, Any]]:
    """Run hybrid search (FTS5 + semantic) + expanded FTS queries + structured
    queries, then merge all ranked lists via Reciprocal Rank Fusion."""
    from hybrid_search import hybrid_search, reciprocal_rank_fusion

    queries = expand_query(question)
    hints = _detect_entity_hints(question)

    ranked_lists: list[list[dict[str, Any]]] = []

    # 1. Primary: hybrid search on the main query (FTS + semantic via RRF)
    primary = await hybrid_search(question, entity_type=None, limit=max_results * 2)
    if primary["hits"]:
        ranked_lists.append(primary["hits"])

    # 2. Expanded FTS queries for additional breadth (skip the first query
    #    if it is identical to the original question to avoid double-counting)
    for q in queries:
        if q.lower().strip() == question.lower().strip():
            continue
        result = await resolvers.search(q, entity_type=None, limit=max_results)
        if result.get("hits"):
            ranked_lists.append(result["hits"])

    # 3. Merge all ranked lists with RRF
    if ranked_lists:
        merged = reciprocal_rank_fusion(ranked_lists)
    else:
        merged = []

    # Build a dedup dict from the merged results
    all_hits: dict[str, dict[str, Any]] = {}
    for hit in merged:
        key = f"{hit['entity_type']}:{hit['entity_id']}"
        if key not in all_hits:
            all_hits[key] = hit

    # 4. Structured queries based on entity hints (unchanged)
    if hints.get("atom_type"):
        atom_type = hints["atom_type"]
        atom_result = await resolvers.get_atoms(
            filter_={"type": atom_type}, limit=10, offset=0,
        )
        for atom in atom_result.get("items", []):
            key = f"atom:{atom['slug']}"
            if key not in all_hits:
                all_hits[key] = {
                    "entity_type": "atom",
                    "entity_id": atom["slug"],
                    "title": atom["title"],
                    "snippet": atom.get("description", "")[:200] or "",
                    "rank": -50.0,
                    # Structured atom-type hints get a positive boost so they
                    # survive the final RRF sort (typical RRF scores are
                    # ~0.016-0.05); kept below the explicit paper-id boost (1.0).
                    "rrf_score": 0.5,
                }

    if hints.get("paper_ids"):
        for pid in hints["paper_ids"]:
            paper = await resolvers.get_paper(pid)
            if paper:
                key = f"paper:{pid}"
                if key not in all_hits:
                    all_hits[key] = {
                        "entity_type": "paper",
                        "entity_id": pid,
                        "title": paper["title"] or pid,
                        "snippet": "",
                        "rank": -100.0,
                        "rrf_score": 1.0,  # explicitly mentioned papers rank highest
                    }

    # Sort by RRF score descending (fall back to negative FTS rank for
    # structured-only hits that don't have an rrf_score)
    sorted_hits = sorted(
        all_hits.values(),
        key=lambda h: h.get("rrf_score", 0.0),
        reverse=True,
    )
    return sorted_hits[:max_results]


# ---------------------------------------------------------------------------
# Step 3: Context Assembly
# ---------------------------------------------------------------------------

def _truncate(text: str, max_chars: int = _MAX_ITEM_CHARS) -> str:
    """Truncate text to max_chars, appending ellipsis if truncated."""
    if not text or len(text) <= max_chars:
        return text or ""
    return text[:max_chars] + "..."


async def _fetch_full_content(hit: dict[str, Any]) -> str:
    """Fetch and format the full content for a search hit."""
    etype = hit["entity_type"]
    eid = hit["entity_id"]
    title = hit.get("title", eid)

    if etype == "paper":
        sections = await resolvers.get_card_sections(eid)
        if sections:
            parts = [f"=== PAPER: {eid} — {title} ==="]
            for sec in sections:
                sec_name = sec["section"]
                sec_content = _truncate(sec["content"], 800)
                parts.append(f"{sec_name}: {sec_content}")
            return "\n".join(parts)
        else:
            # No card sections — use title and snippet
            snippet = hit.get("snippet", "")
            return f"=== PAPER: {eid} — {title} ===\n{snippet}"

    elif etype == "atom":
        atom = await resolvers.get_atom(eid)
        if atom:
            atom_type_label = (atom.get("type") or "atom").upper()
            parts = [f"=== {atom_type_label}: {eid} — {atom['title']} ==="]
            if atom.get("description"):
                parts.append(f"Description: {_truncate(atom['description'])}")
            if atom.get("when_to_use"):
                parts.append(f"When to Use: {_truncate(atom['when_to_use'])}")
            if atom.get("evidence_strength"):
                parts.append(f"Evidence Strength: {atom['evidence_strength']}")
            return "\n".join(parts)
        return f"=== ATOM: {eid} ===\n{hit.get('snippet', '')}"

    elif etype in ("field_map", "map"):
        fmap = await resolvers.get_field_map(eid)
        if fmap:
            # Only include a relevant excerpt, not the full map
            content = _truncate(fmap.get("content", ""), 2000)
            return f"=== FIELD MAP: {fmap['title']} ===\n{content}"
        return f"=== FIELD MAP: {eid} ===\n{hit.get('snippet', '')}"

    elif etype == "idea":
        # Try direct lookup first to avoid loading all ideas
        idea = await resolvers.get_idea(eid)
        if idea:
            parts = [f"=== IDEA: {idea['title']} ==="]
            if idea.get("content"):
                parts.append(_truncate(idea["content"]))
            if idea.get("source_papers"):
                parts.append(f"Source Papers: {', '.join(idea['source_papers'])}")
            return "\n".join(parts)
        return f"=== IDEA: {eid} ===\n{hit.get('snippet', '')}"

    elif etype == "triage_card":
        # Triage cards are lightweight — use the snippet
        return f"=== TRIAGE: {eid} — {title} ===\n{hit.get('snippet', '')}"

    else:
        return f"=== {etype.upper()}: {eid} — {title} ===\n{hit.get('snippet', '')}"


async def assemble_context(
    hits: list[dict[str, Any]],
) -> tuple[str, list[dict[str, str]]]:
    """Build the context string for the LLM, respecting the char budget.

    Returns (context_string, context_items_metadata).
    """
    context_parts: list[str] = []
    context_items: list[dict[str, str]] = []
    total_chars = 0

    for hit in hits:
        content = await _fetch_full_content(hit)
        content_len = len(content)

        if total_chars + content_len > _CONTEXT_CHAR_BUDGET:
            remaining = _CONTEXT_CHAR_BUDGET - total_chars
            if remaining > 200:
                content = content[:remaining] + "..."
            else:
                break

        context_parts.append(content)
        context_items.append({
            "entity_type": hit["entity_type"],
            "entity_id": hit["entity_id"],
            "title": hit.get("title", hit["entity_id"]),
        })
        total_chars += len(content)

    return "\n\n".join(context_parts), context_items


# ---------------------------------------------------------------------------
# Step 4: LLM Generation
# ---------------------------------------------------------------------------

def _extract_citations(text: str) -> list[str]:
    """Extract paper IDs (w12345 format) cited in the answer."""
    return list(dict.fromkeys(re.findall(r"\bw\d{4,6}\b", text, re.IGNORECASE)))


async def ask_knowledge_base(
    question: str,
    max_context: int = 20,
    session_id: Optional[str] = None,
) -> AsyncGenerator[str, None]:
    """Stream answer chunks for the given question.

    Yields:
      1. JSON with session info: {"type": "session", "session_id": "..."}
      2. JSON with context metadata: {"type": "context", "items": [...]}
      3. Plain text chunks
    The caller is responsible for wrapping these into SSE format.
    """
    # Assign or reuse session
    sid = session_id or str(uuid.uuid4())

    # Yield session info as very first item
    yield json.dumps({"type": "session", "session_id": sid})

    # Retrieve
    hits = await _retrieve(question, max_results=max_context)
    context_str, context_items = await assemble_context(hits)

    # Yield context metadata
    yield json.dumps({"type": "context", "items": context_items})

    if not context_str.strip():
        no_info = "I could not find relevant information in the knowledge base for your question."
        # Save turns
        await resolvers.save_rag_turn(sid, "user", question)
        await resolvers.save_rag_turn(sid, "assistant", no_info, context_items=context_items)
        yield no_info
        return

    # Load conversation history
    history = await resolvers.get_session_history(sid)
    history_messages = _build_history_messages(history)

    # Build user message with context
    user_message = (
        "=== KNOWLEDGE BASE CONTEXT ===\n\n"
        f"{context_str}\n\n"
        "=== END CONTEXT ===\n\n"
        f"Question: {question}\n\n"
        "Please answer based on the context above. Cite paper IDs when referencing specific findings."
    )

    # Assemble messages: history + current question
    messages = history_messages + [{"role": "user", "content": user_message}]

    # Stream from LLM
    full_answer_parts: list[str] = []
    try:
        client = _get_client("rag")
        async with client.messages.stream(
            model=_get_model("rag"),
            max_tokens=4096,
            system=_SYSTEM_PROMPT,
            messages=messages,
        ) as stream:
            async for text in stream.text_stream:
                full_answer_parts.append(text)
                yield text
    except ValueError as e:
        error_msg = f"\n\n[Error: {e}]"
        full_answer_parts.append(error_msg)
        yield error_msg
    except LLMConnectionError:
        error_msg = "\n\n[Error: Could not connect to the LLM API. Please check your network and API configuration.]"
        full_answer_parts.append(error_msg)
        yield error_msg
    except LLMStatusError as e:
        error_msg = f"\n\n[Error: LLM API returned status {e.status_code}. Please try again later.]"
        full_answer_parts.append(error_msg)
        yield error_msg
    except Exception as e:
        logger.exception("LLM streaming failed")
        error_msg = f"\n\n[Error: {e}]"
        full_answer_parts.append(error_msg)
        yield error_msg

    # Save turns to session
    full_answer = "".join(full_answer_parts)
    citations = _extract_citations(full_answer)
    try:
        await resolvers.save_rag_turn(sid, "user", question)
        await resolvers.save_rag_turn(
            sid, "assistant", full_answer,
            context_items=context_items, citations=citations,
        )
    except Exception:
        logger.exception("Failed to save RAG turns for session %s", sid)


async def ask_knowledge_base_sync(
    question: str,
    max_context: int = 20,
    session_id: Optional[str] = None,
) -> dict[str, Any]:
    """Return complete answer with citations.

    Returns: {"answer": "...", "citations": ["w31161", ...], "context_used": [...], "session_id": "..."}
    """
    sid = session_id or str(uuid.uuid4())

    # Retrieve
    hits = await _retrieve(question, max_results=max_context)
    context_str, context_items = await assemble_context(hits)

    if not context_str.strip():
        no_info = "I could not find relevant information in the knowledge base for your question."
        await resolvers.save_rag_turn(sid, "user", question)
        await resolvers.save_rag_turn(sid, "assistant", no_info, context_items=context_items)
        return {
            "answer": no_info,
            "citations": [],
            "context_used": context_items,
            "session_id": sid,
        }

    # Load conversation history
    history = await resolvers.get_session_history(sid)
    history_messages = _build_history_messages(history)

    # Build user message
    user_message = (
        "=== KNOWLEDGE BASE CONTEXT ===\n\n"
        f"{context_str}\n\n"
        "=== END CONTEXT ===\n\n"
        f"Question: {question}\n\n"
        "Please answer based on the context above. Cite paper IDs when referencing specific findings."
    )

    messages = history_messages + [{"role": "user", "content": user_message}]

    try:
        client = _get_client("rag")
        response = await client.messages.create(
            model=_get_model("rag"),
            max_tokens=4096,
            system=_SYSTEM_PROMPT,
            messages=messages,
        )
        answer_text = response.content[0].text
        citations = _extract_citations(answer_text)

        # Save turns
        await resolvers.save_rag_turn(sid, "user", question)
        await resolvers.save_rag_turn(
            sid, "assistant", answer_text,
            context_items=context_items, citations=citations,
        )

        return {
            "answer": answer_text,
            "citations": citations,
            "context_used": context_items,
            "session_id": sid,
        }
    except ValueError as e:
        return {"answer": str(e), "citations": [], "context_used": context_items, "session_id": sid}
    except LLMConnectionError:
        return {
            "answer": "Could not connect to the LLM API. Please check your network and API configuration.",
            "citations": [],
            "context_used": context_items,
            "session_id": sid,
        }
    except LLMStatusError as e:
        return {
            "answer": f"LLM API returned status {e.status_code}. Please try again later.",
            "citations": [],
            "context_used": context_items,
            "session_id": sid,
        }
    except Exception as e:
        logger.exception("LLM sync call failed")
        return {
            "answer": f"An error occurred: {e}",
            "citations": [],
            "context_used": context_items,
            "session_id": sid,
        }


# ---------------------------------------------------------------------------
# Contextual chat for Research Mode
# ---------------------------------------------------------------------------

_CONTEXTUAL_CHAR_BUDGET = 28_000


async def _fetch_paper_content(paper_id: str) -> str:
    """Fetch and format full content for a paper by ID."""
    paper = await resolvers.get_paper(paper_id)
    title = paper["title"] if paper else paper_id

    sections = await resolvers.get_card_sections(paper_id)
    if sections:
        parts = [f"=== PAPER: {paper_id} — {title} ==="]
        for sec in sections:
            sec_name = sec["section"]
            sec_content = _truncate(sec["content"], 800)
            parts.append(f"{sec_name}: {sec_content}")
        return "\n".join(parts)
    elif paper:
        return f"=== PAPER: {paper_id} — {title} ==="
    else:
        return f"=== PAPER: {paper_id} ==="


async def ask_contextual(
    question: str,
    paper_ids: list[str],
    search_query: str = "",
    landscape_summary: str = "",
    session_id: str | None = None,
) -> AsyncGenerator[str, None]:
    """Stream answer with pre-loaded search context (no re-retrieval).

    Yields:
      1. JSON with session info: {"type": "session", "session_id": "..."}
      2. JSON with context metadata: {"type": "context", "items": [...]}
      3. Plain text chunks
    The caller wraps these into SSE format.
    """
    sid = session_id or str(uuid.uuid4())

    # Yield session info
    yield json.dumps({"type": "session", "session_id": sid})

    # 1. Fetch full content for each paper_id
    context_parts: list[str] = []
    context_items: list[dict[str, str]] = []
    total_chars = 0

    for pid in paper_ids:
        content = await _fetch_paper_content(pid)
        content_len = len(content)

        if total_chars + content_len > _CONTEXTUAL_CHAR_BUDGET:
            remaining = _CONTEXTUAL_CHAR_BUDGET - total_chars
            if remaining > 200:
                content = content[:remaining] + "..."
                context_parts.append(content)
                paper = await resolvers.get_paper(pid)
                context_items.append({
                    "entity_type": "paper",
                    "entity_id": pid,
                    "title": paper["title"] if paper else pid,
                })
            break

        context_parts.append(content)
        paper = await resolvers.get_paper(pid)
        context_items.append({
            "entity_type": "paper",
            "entity_id": pid,
            "title": paper["title"] if paper else pid,
        })
        total_chars += content_len

    # Yield context metadata
    yield json.dumps({"type": "context", "items": context_items})

    context_str = "\n\n".join(context_parts)

    if not context_str.strip():
        no_info = "I could not find detailed content for the specified papers."
        await resolvers.save_rag_turn(sid, "user", question)
        await resolvers.save_rag_turn(sid, "assistant", no_info, context_items=context_items)
        yield no_info
        return

    # 2. Build contextual system prompt
    n_papers = len(paper_ids)
    system_parts = [
        "You are a research assistant helping a researcher explore a specific topic.",
        f'The researcher searched for "{search_query}" and found {n_papers} papers.' if search_query else f"The researcher is exploring {n_papers} papers.",
    ]
    if landscape_summary:
        system_parts.append(landscape_summary)
    system_parts.extend([
        "Below are detailed summaries. Cite paper IDs when referencing findings.",
        "When asked about feasibility, consider data availability, methods, and gaps.",
        "When asked about China, note which methods/data could transfer.",
    ])
    system_prompt = " ".join(system_parts)

    # 3. Load session history
    history = await resolvers.get_session_history(sid)
    history_messages = _build_history_messages(history)

    # 4. Build user message with context
    user_message = (
        "=== KNOWLEDGE BASE CONTEXT ===\n\n"
        f"{context_str}\n\n"
        "=== END CONTEXT ===\n\n"
        f"Question: {question}\n\n"
        "Please answer based on the context above. Cite paper IDs when referencing specific findings."
    )

    messages = history_messages + [{"role": "user", "content": user_message}]

    # 5. Stream from LLM
    full_answer_parts: list[str] = []
    try:
        client = _get_client("rag")
        async with client.messages.stream(
            model=_get_model("rag"),
            max_tokens=4096,
            system=system_prompt,
            messages=messages,
        ) as stream:
            async for text in stream.text_stream:
                full_answer_parts.append(text)
                yield text
    except ValueError as e:
        error_msg = f"\n\n[Error: {e}]"
        full_answer_parts.append(error_msg)
        yield error_msg
    except LLMConnectionError:
        error_msg = "\n\n[Error: Could not connect to the LLM API. Please check your network and API configuration.]"
        full_answer_parts.append(error_msg)
        yield error_msg
    except LLMStatusError as e:
        error_msg = f"\n\n[Error: LLM API returned status {e.status_code}. Please try again later.]"
        full_answer_parts.append(error_msg)
        yield error_msg
    except Exception as e:
        logger.exception("Contextual LLM streaming failed")
        error_msg = f"\n\n[Error: {e}]"
        full_answer_parts.append(error_msg)
        yield error_msg

    # 6. Save turns to session
    full_answer = "".join(full_answer_parts)
    citations = _extract_citations(full_answer)
    try:
        await resolvers.save_rag_turn(sid, "user", question)
        await resolvers.save_rag_turn(
            sid, "assistant", full_answer,
            context_items=context_items, citations=citations,
        )
    except Exception:
        logger.exception("Failed to save contextual RAG turns for session %s", sid)


# ---------------------------------------------------------------------------
# Literature Review Generation
# ---------------------------------------------------------------------------

_LIT_REVIEW_MAX_PAPERS = 30
_LIT_REVIEW_CHAR_BUDGET = 40_000


async def generate_literature_review(
    paper_ids: list[str],
    focus: str = "",
    style: str = "thematic",
) -> AsyncGenerator[str, None]:
    """Generate a structured literature review draft from selected papers.

    Yields plain text chunks for SSE streaming.
    Raises ValueError if no papers have card sections or too many papers.
    """
    if len(paper_ids) == 0:
        yield "[Error: No papers provided for literature review.]"
        return

    if len(paper_ids) > _LIT_REVIEW_MAX_PAPERS:
        yield f"[Error: Too many papers ({len(paper_ids)}). Maximum is {_LIT_REVIEW_MAX_PAPERS}.]"
        return

    # 1. Fetch card sections for all papers
    paper_contexts: list[str] = []
    paper_meta: list[dict] = []
    total_chars = 0

    for pid in paper_ids:
        paper = await resolvers.get_paper(pid)
        if not paper:
            continue

        title = paper.get("title", pid)
        authors = paper.get("authors", [])
        year = paper.get("year")
        authors_str = ", ".join(authors) if authors else "Unknown"

        sections = await resolvers.get_card_sections(pid)
        if not sections:
            # Include minimal info even without card
            entry = f"--- Paper: {pid} ---\nTitle: {title}\nAuthors: {authors_str}\nYear: {year or 'N/A'}\n(No detailed card available)"
            if total_chars + len(entry) <= _LIT_REVIEW_CHAR_BUDGET:
                paper_contexts.append(entry)
                paper_meta.append({"id": pid, "title": title, "authors": authors_str, "year": year})
                total_chars += len(entry)
            continue

        parts = [f"--- Paper: {pid} ---"]
        parts.append(f"Title: {title}")
        parts.append(f"Authors: {authors_str}")
        parts.append(f"Year: {year or 'N/A'}")

        for sec in sections:
            sec_name = sec["section"]
            sec_content = _truncate(sec["content"], 600)
            parts.append(f"{sec_name}: {sec_content}")

        entry = "\n".join(parts)
        if total_chars + len(entry) > _LIT_REVIEW_CHAR_BUDGET:
            remaining = _LIT_REVIEW_CHAR_BUDGET - total_chars
            if remaining > 300:
                entry = entry[:remaining] + "..."
                paper_contexts.append(entry)
                paper_meta.append({"id": pid, "title": title, "authors": authors_str, "year": year})
            break

        paper_contexts.append(entry)
        paper_meta.append({"id": pid, "title": title, "authors": authors_str, "year": year})
        total_chars += len(entry)

    if not paper_contexts:
        yield "[Error: None of the selected papers have sufficient content for a literature review.]"
        return

    # 2. Build system prompt
    n = len(paper_contexts)
    focus_desc = f' on "{focus}"' if focus else ""

    style_instruction = {
        "thematic": "organized thematically (group by research themes and findings)",
        "chronological": "organized chronologically (trace how the literature evolved over time)",
        "methodological": "organized by methodology (group by identification strategies and empirical approaches)",
    }.get(style, "organized thematically")

    system_prompt = f"""You are an academic writing assistant helping a researcher draft a literature review section.

Given {n} {SOURCE_NAME} {SOURCE_PAPER_LABEL}{focus_desc}, write a structured literature review {style_instruction}.

Requirements:
- Cite papers using author names and their IDs in parentheses, e.g., Brynjolfsson et al. (w31161)
- Organize by themes, not paper-by-paper
- Highlight methodological approaches and how they differ
- Note areas of consensus and disagreement
- Identify gaps in the literature
- Write in formal academic style suitable for a top economics journal
- Length: 800-1500 words
- Use markdown formatting: headers (##), bold for key terms, paragraphs"""

    # 3. Build user message
    paper_context_str = "\n\n".join(paper_contexts)
    user_message = (
        "=== PAPERS FOR LITERATURE REVIEW ===\n\n"
        f"{paper_context_str}\n\n"
        "=== END PAPERS ===\n\n"
        "Please write a structured literature review based on these papers."
    )
    if focus:
        user_message += f'\n\nFocus the review on: "{focus}"'

    messages = [{"role": "user", "content": user_message}]

    # 4. Stream from LLM
    try:
        client = _get_client("rag")
        async with client.messages.stream(
            model=_get_model("rag"),
            max_tokens=4096,
            system=system_prompt,
            messages=messages,
        ) as stream:
            async for text in stream.text_stream:
                yield text
    except ValueError as e:
        yield f"\n\n[Error: {e}]"
    except LLMConnectionError:
        yield "\n\n[Error: Could not connect to the LLM API. Please check your network and API configuration.]"
    except LLMStatusError as e:
        yield f"\n\n[Error: LLM API returned status {e.status_code}. Please try again later.]"
    except Exception as e:
        logger.exception("Literature review generation failed")
        yield f"\n\n[Error: {e}]"
