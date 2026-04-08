"""FastAPI application for the NBER research knowledge base."""

from __future__ import annotations

import json
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).parent / ".env")
except ImportError:
    pass

import re

import aiosqlite
from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse, StreamingResponse
from pydantic import BaseModel
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from strawberry.fastapi import GraphQLRouter

import resolvers
from auth import verify_api_key
from schema import schema
from rag import ask_knowledge_base, ask_knowledge_base_sync, ask_contextual, _extract_citations, generate_literature_review
from debate import run_debate

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Lifespan — runs once on startup / shutdown
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    db_path = os.environ.get(
        "KB_DB_PATH",
        os.path.join(os.path.dirname(__file__), "kb.db"),
    )
    if os.path.isfile(db_path):
        logger.info("Database found at %s", db_path)
    else:
        logger.warning(
            "Database not found at %s — queries will return empty results until the ingestion script creates it.",
            db_path,
        )

    # Load semantic embeddings into memory for fast search
    try:
        from embeddings import load_index
        await load_index()
    except Exception:
        logger.exception("Failed to load embedding index — semantic search disabled")

    yield  # app runs
    logger.info("Shutting down")


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(
    title="NBER Research Knowledge Base API",
    version="1.0.0",
    description="API for searching, browsing, and exporting NBER working paper analysis",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    lifespan=lifespan,
)

# Rate limiter
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS — allow the Next.js frontend during development + configurable extra origins
extra_origins = os.environ.get("NBER_CORS_ORIGINS", "").split(",")
extra_origins = [o.strip() for o in extra_origins if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        *extra_origins,
    ],
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount Strawberry GraphQL (GraphiQL disabled in production)
graphql_router = GraphQLRouter(
    schema,
    graphiql=os.environ.get("NBER_ENV", "development") != "production",
)
app.include_router(graphql_router, prefix="/graphql")


# ---------------------------------------------------------------------------
# REST endpoints
# ---------------------------------------------------------------------------

from typing import Any, Optional

class AskRequest(BaseModel):
    question: str
    max_context: int = 20  # max number of context items
    session_id: Optional[str] = None  # multi-turn conversation session


class CreateProjectDraftRequest(BaseModel):
    title: str
    query: str
    paper_ids: list[str]
    filters: Optional[dict[str, Any]] = None
    sort: str = ""
    description: Optional[str] = None


@app.get("/api/health")
async def health():
    db_path = os.environ.get(
        "KB_DB_PATH",
        os.path.join(os.path.dirname(__file__), "kb.db"),
    )
    return {
        "status": "ok",
        "db_exists": os.path.isfile(db_path),
    }


# ---------------------------------------------------------------------------
# External REST search (v1, API-key protected)
# ---------------------------------------------------------------------------

@app.get("/api/v1/search", dependencies=[Depends(verify_api_key)])
@limiter.limit("60/minute")
async def search_papers(
    request: Request,
    q: str = Query(..., description="Search query"),
    type: Optional[str] = Query(None, description="Entity type: paper, atom, idea, map"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    """REST search interface for external tools."""
    from hybrid_search import hybrid_search
    result = await hybrid_search(q, entity_type=type, limit=limit + offset)
    hits = result["hits"][offset: offset + limit]
    return {
        "results": hits,
        "total": result["total"],
        "query": q,
    }


@app.post("/api/projects/draft")
async def create_project_draft_endpoint(request: CreateProjectDraftRequest) -> dict:
    """Create a file-backed Research Draft from a Research-mode paper set."""
    if not request.title.strip():
        raise HTTPException(status_code=400, detail="Project title is required.")
    if not request.query.strip():
        raise HTTPException(status_code=400, detail="Source query is required.")
    if not request.paper_ids:
        raise HTTPException(status_code=400, detail="At least one paper is required.")

    try:
        project = resolvers.create_project_draft(
            title=request.title,
            query=request.query,
            filters=request.filters,
            sort=request.sort,
            paper_ids=request.paper_ids,
            description=request.description,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except FileExistsError as exc:
        raise HTTPException(status_code=409, detail="Project slug already exists.") from exc
    except Exception as exc:
        logger.exception("Failed to create Research Draft")
        raise HTTPException(status_code=500, detail="Failed to create Research Draft.") from exc

    return {"project": project}


@app.post("/api/ask")
@limiter.limit("10/minute")
async def ask_endpoint(request: Request, body: AskRequest) -> StreamingResponse:
    """Stream RAG answer via Server-Sent Events."""

    async def event_stream():
        full_answer = []
        event_index = 0
        async for chunk in ask_knowledge_base(
            body.question,
            max_context=body.max_context,
            session_id=body.session_id,
        ):
            if event_index < 2:
                # First two yields are JSON metadata (session, then context)
                event_index += 1
                yield f"data: {chunk}\n\n"
                continue
            full_answer.append(chunk)
            event = json.dumps({"type": "chunk", "text": chunk})
            yield f"data: {event}\n\n"

        # Final event with citations
        answer_text = "".join(full_answer)
        citations = _extract_citations(answer_text)
        done_event = json.dumps({"type": "done", "citations": citations})
        yield f"data: {done_event}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/api/ask/sync")
@limiter.limit("10/minute")
async def ask_sync_endpoint(request: Request, body: AskRequest) -> dict:
    """Non-streaming RAG answer."""
    return await ask_knowledge_base_sync(
        body.question,
        max_context=body.max_context,
        session_id=body.session_id,
    )


# ---------------------------------------------------------------------------
# Contextual chat (Research Mode)
# ---------------------------------------------------------------------------

class ContextualAskRequest(BaseModel):
    question: str
    paper_ids: list[str]
    search_query: str = ""
    landscape_summary: str = ""
    session_id: Optional[str] = None


@app.post("/api/ask/contextual")
@limiter.limit("10/minute")
async def contextual_ask_endpoint(request: Request, body: ContextualAskRequest) -> StreamingResponse:
    """Stream contextual RAG answer via Server-Sent Events for Research Mode."""

    async def event_stream():
        full_answer = []
        event_index = 0
        async for chunk in ask_contextual(
            question=body.question,
            paper_ids=body.paper_ids,
            search_query=body.search_query,
            landscape_summary=body.landscape_summary,
            session_id=body.session_id,
        ):
            if event_index < 2:
                # First two yields are JSON metadata (session, then context)
                event_index += 1
                yield f"data: {chunk}\n\n"
                continue
            full_answer.append(chunk)
            event = json.dumps({"type": "chunk", "text": chunk})
            yield f"data: {event}\n\n"

        # Final event with citations
        answer_text = "".join(full_answer)
        citations = _extract_citations(answer_text)
        done_event = json.dumps({"type": "done", "citations": citations})
        yield f"data: {done_event}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ---------------------------------------------------------------------------
# Literature review generation
# ---------------------------------------------------------------------------

class LitReviewRequest(BaseModel):
    paper_ids: list[str]
    focus: str = ""  # optional topic focus
    style: str = "thematic"  # thematic | chronological | methodological


@app.post("/api/generate/lit-review")
@limiter.limit("10/minute")
async def generate_lit_review(request: Request, body: LitReviewRequest) -> StreamingResponse:
    """Generate a literature review draft from selected papers via SSE."""

    async def event_stream():
        full_answer: list[str] = []
        async for chunk in generate_literature_review(
            paper_ids=body.paper_ids,
            focus=body.focus,
            style=body.style,
        ):
            full_answer.append(chunk)
            event = json.dumps({"type": "chunk", "text": chunk})
            yield f"data: {event}\n\n"

        # Final done event
        answer_text = "".join(full_answer)
        citations = _extract_citations(answer_text)
        done_event = json.dumps({"type": "done", "citations": citations})
        yield f"data: {done_event}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ---------------------------------------------------------------------------
# BibTeX export
# ---------------------------------------------------------------------------

def _parse_authors_bibtex(raw: str | None) -> list[str]:
    """Parse a JSON array of author names."""
    if not raw:
        return []
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, list):
            return [str(a) for a in parsed]
    except (json.JSONDecodeError, TypeError):
        pass
    return []


def _format_author_bibtex(name: str) -> str:
    """Convert 'First Last' or 'First Middle Last' to 'Last, First' or 'Last, First Middle'."""
    parts = name.strip().split()
    if len(parts) == 0:
        return name
    if len(parts) == 1:
        return parts[0]
    # Last name is the final part, everything else is first/middle
    return f"{parts[-1]}, {' '.join(parts[:-1])}"


def _make_citation_key(authors: list[str], year: int | None, title: str | None) -> str:
    """Generate citation key: {first_author_last_name}{year}{first_word_of_title} (lowercased)."""
    # First author last name
    if authors:
        parts = authors[0].strip().split()
        last_name = parts[-1] if parts else "unknown"
    else:
        last_name = "unknown"

    # Year
    year_str = str(year) if year else ""

    # First word of title (letters only)
    first_word = ""
    if title:
        words = re.findall(r"[a-zA-Z]+", title)
        if words:
            first_word = words[0]

    key = f"{last_name}{year_str}{first_word}".lower()
    # Remove any non-alphanumeric chars
    key = re.sub(r"[^a-z0-9]", "", key)
    return key or "unknown"


def _paper_to_bibtex(paper_id: str, title: str | None, authors_raw: str | None, year: int | None) -> str:
    """Generate a single BibTeX entry for an NBER working paper."""
    authors = _parse_authors_bibtex(authors_raw)

    # Citation key
    citation_key = _make_citation_key(authors, year, title)

    # Format authors for BibTeX
    if authors:
        author_str = " and ".join(_format_author_bibtex(a) for a in authors)
    else:
        author_str = "Unknown"

    # Paper number: strip the "w" prefix if present
    number = paper_id.lstrip("w") if paper_id.startswith("w") else paper_id

    # Build entry
    lines = [f"@techreport{{{citation_key},"]
    lines.append(f"  title = {{{title or paper_id}}},")
    lines.append(f"  author = {{{author_str}}},")
    if year is not None:
        lines.append(f"  year = {{{year}}},")
    lines.append("  institution = {National Bureau of Economic Research},")
    lines.append("  type = {Working Paper},")
    lines.append(f"  number = {{{number}}},")
    lines.append("  series = {NBER Working Papers},")
    lines.append(f"  url = {{https://www.nber.org/papers/{paper_id}}}")
    lines.append("}")

    return "\n".join(lines)


@app.get("/api/export/bibtex")
async def export_bibtex(ids: str = Query(..., description="Comma-separated paper IDs")):
    """Generate BibTeX for selected papers."""
    paper_ids = [pid.strip() for pid in ids.split(",") if pid.strip()]

    if not paper_ids:
        return PlainTextResponse(
            "",
            media_type="text/plain",
            headers={"Content-Disposition": 'attachment; filename="nber_papers.bib"'},
        )

    db_path = os.environ.get(
        "KB_DB_PATH",
        os.path.join(os.path.dirname(__file__), "kb.db"),
    )

    entries: list[str] = []

    if os.path.isfile(db_path):
        try:
            async with aiosqlite.connect(db_path) as db:
                db.row_factory = aiosqlite.Row
                placeholders = ",".join("?" for _ in paper_ids)
                cursor = await db.execute(
                    f"SELECT paper_id, title, authors, year FROM papers WHERE paper_id IN ({placeholders})",
                    paper_ids,
                )
                rows = await cursor.fetchall()
                # Preserve the requested order
                row_map = {r["paper_id"]: r for r in rows}
                for pid in paper_ids:
                    row = row_map.get(pid)
                    if row is not None:
                        entries.append(
                            _paper_to_bibtex(
                                row["paper_id"],
                                row["title"],
                                row["authors"],
                                row["year"],
                            )
                        )
        except Exception:
            logger.exception("export_bibtex failed")

    bibtex_content = "\n\n".join(entries)

    return PlainTextResponse(
        bibtex_content,
        media_type="text/plain",
        headers={"Content-Disposition": 'attachment; filename="nber_papers.bib"'},
    )


# ---------------------------------------------------------------------------
# CSV export
# ---------------------------------------------------------------------------

import csv
import io


@app.get("/api/export/csv")
async def export_csv(ids: str = Query(..., description="Comma-separated paper IDs")):
    """Export paper metadata as CSV."""
    paper_ids = [pid.strip() for pid in ids.split(",") if pid.strip()]

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["paper_id", "title", "authors", "year", "fields", "average_score", "triage_decision", "nber_url"])

    if paper_ids:
        db_path = os.environ.get(
            "KB_DB_PATH",
            os.path.join(os.path.dirname(__file__), "kb.db"),
        )

        if os.path.isfile(db_path):
            try:
                async with aiosqlite.connect(db_path) as db:
                    db.row_factory = aiosqlite.Row
                    placeholders = ",".join("?" for _ in paper_ids)
                    cursor = await db.execute(
                        f"SELECT paper_id, title, authors, year, fields, average_score, triage_decision, nber_url FROM papers WHERE paper_id IN ({placeholders})",
                        paper_ids,
                    )
                    rows = await cursor.fetchall()
                    # Preserve requested order
                    row_map = {r["paper_id"]: r for r in rows}
                    for pid in paper_ids:
                        row = row_map.get(pid)
                        if row is not None:
                            authors = _parse_authors_bibtex(row["authors"])
                            fields_raw = row["fields"]
                            try:
                                fields_list = json.loads(fields_raw) if fields_raw else []
                            except (json.JSONDecodeError, TypeError):
                                fields_list = []
                            writer.writerow([
                                row["paper_id"],
                                row["title"] or "",
                                "; ".join(authors),
                                row["year"] or "",
                                "; ".join(fields_list) if isinstance(fields_list, list) else "",
                                f'{row["average_score"]:.1f}' if row["average_score"] is not None else "",
                                row["triage_decision"] or "",
                                row["nber_url"] or f'https://www.nber.org/papers/{row["paper_id"]}',
                            ])
            except Exception:
                logger.exception("export_csv failed")

    csv_content = output.getvalue()
    return PlainTextResponse(
        csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="nber_papers.csv"'},
    )


# ---------------------------------------------------------------------------
# Markdown export
# ---------------------------------------------------------------------------


@app.get("/api/export/markdown")
async def export_markdown(ids: str = Query(..., description="Comma-separated paper IDs")):
    """Export paper summaries as Markdown."""
    paper_ids = [pid.strip() for pid in ids.split(",") if pid.strip()]

    lines: list[str] = ["# Paper Summaries\n"]

    if paper_ids:
        db_path = os.environ.get(
            "KB_DB_PATH",
            os.path.join(os.path.dirname(__file__), "kb.db"),
        )

        if os.path.isfile(db_path):
            try:
                async with aiosqlite.connect(db_path) as db:
                    db.row_factory = aiosqlite.Row
                    placeholders = ",".join("?" for _ in paper_ids)

                    # Batch fetch papers
                    cursor = await db.execute(
                        f"SELECT paper_id, title, authors, year, average_score FROM papers WHERE paper_id IN ({placeholders})",
                        paper_ids,
                    )
                    rows = await cursor.fetchall()
                    row_map = {r["paper_id"]: r for r in rows}

                    # Batch fetch card sections
                    sec_cursor = await db.execute(
                        f"SELECT paper_id, section, content FROM card_sections WHERE paper_id IN ({placeholders})",
                        paper_ids,
                    )
                    sec_rows = await sec_cursor.fetchall()
                    sections_by_paper: dict[str, dict[str, str]] = {}
                    for sr in sec_rows:
                        sections_by_paper.setdefault(sr["paper_id"], {})[sr["section"]] = sr["content"]

                    # Build markdown in requested order
                    for pid in paper_ids:
                        row = row_map.get(pid)
                        if row is None:
                            continue

                        authors = _parse_authors_bibtex(row["authors"])
                        author_str = ", ".join(authors) if authors else "Unknown"
                        year_str = str(row["year"]) if row["year"] else "N/A"
                        score_str = f'{row["average_score"]:.1f}/5' if row["average_score"] is not None else "N/A"

                        lines.append(f'## {row["paper_id"]}: {row["title"] or "Untitled"}')
                        lines.append(f"**Authors:** {author_str} | **Year:** {year_str} | **Score:** {score_str}\n")

                        sections = sections_by_paper.get(pid, {})
                        section_labels = [
                            ("Research Question", "Research Question"),
                            ("Key Findings", "Key Findings"),
                            ("Identification & Method", "Method"),
                            ("Limitations & Open Questions", "Limitations"),
                        ]

                        for section_key, section_label in section_labels:
                            if section_key in sections and sections[section_key]:
                                lines.append(f"### {section_label}")
                                lines.append(sections[section_key].strip())
                                lines.append("")

                        lines.append("---\n")

            except Exception:
                logger.exception("export_markdown failed")

    md_content = "\n".join(lines)
    return PlainTextResponse(
        md_content,
        media_type="text/markdown",
        headers={"Content-Disposition": 'attachment; filename="nber_papers.md"'},
    )


# ---------------------------------------------------------------------------
# Paper comparison endpoint
# ---------------------------------------------------------------------------


class CompareRequest(BaseModel):
    paper_ids: list[str]  # 2-8 paper IDs
    columns: list[str] = [
        "research_question",
        "method",
        "data",
        "key_finding",
        "limitation",
    ]


# Section name mapping: column key -> card_sections.section value
_COLUMN_TO_SECTION = {
    "research_question": "Research Question",
    "method": "Identification & Method",
    "data": "Identification & Method",
    "key_finding": "Key Findings",
    "limitation": "Limitations & Open Questions",
}

# Patterns that hint at data/sample information
_DATA_PATTERNS = re.compile(
    r"("
    r"\d[\d,]+\s*(?:observations?|firms?|individuals?|households?|patients?|workers?|agents?|students?|respondents?|counties?|countries?|hospitals?|schools?|companies?|stores?)"
    r"|(?:panel|survey|census|administrative|claims|registry|register|longitudinal)\s+data"
    r"|(?:NLSY|CPS|ACS|PSID|HRS|MEPS|SIPP|ATUS|LEHD|LODES|AHS|NHIS|BRFSS|CDC|WHO|Census|Compustat|CRSP|Nielsen|IRI|Zillow|Yelp|SafeGraph|Burning Glass)"
    r"|\d{4}\s*[-–]\s*\d{4}"
    r"|\bN\s*=\s*[\d,]+"
    r"|\bsample\s+(?:of|size|includes?|contains?)"
    r")",
    re.IGNORECASE,
)


def _extract_data_info(text: str) -> str:
    """Extract dataset / sample info from Identification & Method section."""
    if not text:
        return ""
    sentences = re.split(r"(?<=[.!?])\s+", text)
    data_sentences = []
    for sent in sentences:
        if _DATA_PATTERNS.search(sent):
            data_sentences.append(sent.strip())
            if len(data_sentences) >= 3:
                break
    result = " ".join(data_sentences)
    if not result:
        # Fallback: first sentence mentioning "data" loosely
        for sent in sentences:
            if re.search(r"\bdata\b", sent, re.IGNORECASE):
                result = sent.strip()
                break
    return result[:400] if result else ""


def _extract_method_info(text: str) -> str:
    """Extract first 1-2 sentences of the Identification section."""
    if not text:
        return ""
    sentences = re.split(r"(?<=[.!?])\s+", text)
    picked = sentences[:2]
    result = " ".join(s.strip() for s in picked)
    return result[:400] if result else ""


def _extract_bullets(text: str, max_bullets: int = 3) -> str:
    """Extract first N bullet points from a section."""
    if not text:
        return ""
    lines = text.strip().split("\n")
    bullets = []
    for line in lines:
        stripped = line.strip()
        if re.match(r"^[\-\*\u2022]\s+", stripped) or re.match(r"^\d+\.\s+", stripped):
            bullets.append(stripped)
            if len(bullets) >= max_bullets:
                break
    if bullets:
        return "\n".join(bullets)
    # No bullets found: return first 2-3 sentences
    sentences = re.split(r"(?<=[.!?])\s+", text)
    result = " ".join(s.strip() for s in sentences[:max_bullets])
    return result[:500] if result else ""


def _extract_cell(column: str, sections_map: dict[str, str]) -> str:
    """Extract the value for a comparison column from the card sections."""
    section_key = _COLUMN_TO_SECTION.get(column, column)
    raw = sections_map.get(section_key, "")
    if not raw:
        return ""

    if column == "research_question":
        # Return full text, truncated
        return raw[:500]
    elif column == "method":
        return _extract_method_info(raw)
    elif column == "data":
        return _extract_data_info(raw)
    elif column == "key_finding":
        return _extract_bullets(raw, max_bullets=3)
    elif column == "limitation":
        return _extract_bullets(raw, max_bullets=3)
    else:
        return raw[:400]


@app.post("/api/compare")
async def compare_papers(request: CompareRequest) -> dict:
    """Generate a structured comparison table across papers."""
    if len(request.paper_ids) < 2:
        raise HTTPException(status_code=400, detail="At least 2 paper IDs are required.")
    if len(request.paper_ids) > 8:
        raise HTTPException(status_code=400, detail="At most 8 papers can be compared.")

    valid_columns = ["research_question", "method", "data", "key_finding", "limitation"]
    columns = [c for c in request.columns if c in valid_columns] or valid_columns

    result_papers = []

    for paper_id in request.paper_ids:
        paper = await resolvers.get_paper(paper_id)
        if not paper:
            result_papers.append({
                "paper_id": paper_id,
                "title": None,
                "year": None,
                "authors": [],
                "cells": {col: "" for col in columns},
            })
            continue

        sections = await resolvers.get_card_sections(paper_id)
        sections_map = {s["section"]: s["content"] for s in sections}

        cells = {}
        if sections:
            for col in columns:
                cells[col] = _extract_cell(col, sections_map)
        else:
            cells = {col: "" for col in columns}

        result_papers.append({
            "paper_id": paper_id,
            "title": paper.get("title"),
            "year": paper.get("year"),
            "authors": paper.get("authors", []),
            "cells": cells,
        })

    return {
        "columns": columns,
        "papers": result_papers,
    }


# ---------------------------------------------------------------------------
# Pipeline endpoints — paper ingestion workflow
# ---------------------------------------------------------------------------

from fastapi import UploadFile, File, Form


class ProcessRequest(BaseModel):
    paper_id: str


class PipelineRunRequest(BaseModel):
    agent: str = "full-cycle"
    batch_size: int = 10


@app.post("/api/pipeline/discover")
async def discover_papers(limit: int = 20):
    """Discover new NBER papers not yet in the system."""
    from pipeline import discover_new_papers

    papers = discover_new_papers(limit=limit)
    return {"new_papers": papers, "count": len(papers)}


@app.post("/api/pipeline/process")
async def process_paper_endpoint(request: ProcessRequest):
    """Download and process a specific NBER paper."""
    from pipeline import process_paper

    result = await process_paper(request.paper_id)
    return result


@app.post("/api/pipeline/upload")
async def upload_paper(
    file: UploadFile = File(...),
    paper_id: str = Form(default=""),
):
    """Upload a PDF for processing (max 50 MB)."""
    from pipeline import process_uploaded_pdf, MAX_UPLOAD_BYTES

    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large ({len(content)} bytes). "
                   f"Maximum is {MAX_UPLOAD_BYTES // (1024 * 1024)} MB.",
        )

    result = process_uploaded_pdf(
        content,
        paper_id=paper_id or None,
        filename=file.filename or "",
    )
    return result


@app.post("/api/pipeline/run")
async def run_pipeline_endpoint(request: PipelineRunRequest):
    """Run the agent pipeline (scout, reader, linker, etc.)."""
    from pipeline import run_agent_pipeline

    result = run_agent_pipeline(agent=request.agent, batch_size=request.batch_size)
    return result


@app.post("/api/pipeline/refresh")
async def refresh_db_endpoint():
    """Re-run ingestion to sync knowledge_base -> kb.db and recompute embeddings."""
    from pipeline import refresh_website_db

    result = refresh_website_db()
    return result


@app.get("/api/pipeline/status")
async def pipeline_status():
    """Get current pipeline status: pending papers, last run, etc."""
    from pipeline import get_pipeline_status

    return get_pipeline_status()


# ---------------------------------------------------------------------------
# Consensus analysis (Research Mode)
# ---------------------------------------------------------------------------

class ConsensusRequest(BaseModel):
    query: str
    paper_ids: list[str]


@app.post("/api/analyze/consensus")
@limiter.limit("10/minute")
async def analyze_consensus_endpoint(request: Request, body: ConsensusRequest) -> dict:
    """Classify papers' stance on a research question using LLM.
    Returns supports/contradicts/neutral counts and per-paper classifications.
    """
    result = await resolvers.analyze_consensus(
        paper_ids=body.paper_ids,
        query=body.query,
    )
    return result


# ---------------------------------------------------------------------------
# Multi-agent research debate
# ---------------------------------------------------------------------------

class DebateRequest(BaseModel):
    idea_title: str
    idea_text: str
    paper_ids: list[str] = []
    rounds: int = 2


@app.post("/api/debate")
@limiter.limit("10/minute")
async def debate_endpoint(request: Request, body: DebateRequest) -> StreamingResponse:
    """Run multi-agent research debate via SSE."""

    async def event_stream():
        try:
            async for chunk in run_debate(
                idea_title=body.idea_title,
                idea_text=body.idea_text,
                paper_ids=body.paper_ids,
                rounds=min(body.rounds, 3),
            ):
                yield f"data: {chunk}\n\n"
        except ValueError as e:
            yield f'data: {json.dumps({"type": "error", "message": str(e)})}\n\n'
        except Exception:
            logger.exception("Debate failed")
            yield f'data: {json.dumps({"type": "error", "message": "Debate failed. Check API key."})}\n\n'

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
