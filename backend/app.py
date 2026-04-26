"""FastAPI application for the research knowledge base."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path, PurePosixPath
import shutil

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))


try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).parent / ".env")
except ImportError:
    pass

import re

from fastapi import Depends, FastAPI, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, PlainTextResponse, StreamingResponse
from pydantic import BaseModel
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

import resolvers
from auth import verify_api_key
from database import (
    add_paper_feedback,
    attach_metadata_paper_to_library,
    create_library,
    delete_library,
    ensure_default_library,
    get_ai_settings,
    get_connection,
    get_library,
    list_paper_feedback,
    get_paper_processing_state,
    init_db,
    library_exists,
    list_library_papers,
    list_import_batches,
    list_libraries,
    update_paper_feedback_action_status,
    save_ai_settings,
    update_library,
)
from config import (
    APP_API_TITLE,
    APP_DESCRIPTION,
    APP_NAME,
    AGENT_DB_PATH,
    EXPORT_BASENAME,
    EXTRA_CORS_ORIGINS,
    KB_DB_PATH,
    KNOWLEDGE_BASE_DIR,
    PAPERS_DIR,
    PUBLISHER_NAME,
    PROJECTS_DIR,
    REMOTE_DISCOVERY_LABEL,
    REMOTE_SOURCE_KIND,
    SERIES_NAME,
    SOURCE_NAME,
    SOURCE_PAPER_LABEL,
    SUPPORTS_REMOTE_DISCOVERY,
    build_paper_url,
)
from library_context import get_active_library_id, reset_active_library_id, set_active_library_id
from schema import schema
from rag import ask_knowledge_base, ask_knowledge_base_sync, ask_contextual, _extract_citations, generate_literature_review
from debate import run_debate

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


async def _warm_embeddings_in_background() -> None:
    try:
        from embeddings import warm_model

        await warm_model()
        logger.info("Embedding model warmed")
    except Exception:
        logger.exception("Failed to warm embedding model — first semantic request may be slow")


# ---------------------------------------------------------------------------
# Lifespan — runs once on startup / shutdown
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    ensure_default_library()
    db_path = KB_DB_PATH
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

    app.state.embedding_warm_task = asyncio.create_task(_warm_embeddings_in_background())

    yield  # app runs

    warm_task = getattr(app.state, "embedding_warm_task", None)
    if warm_task is not None and not warm_task.done():
        warm_task.cancel()
        try:
            await warm_task
        except asyncio.CancelledError:
            pass

    logger.info("Shutting down")
    await resolvers._close_db()


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(
    title=APP_API_TITLE,
    version="1.0.0",
    description=APP_DESCRIPTION,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    lifespan=lifespan,
)


@app.middleware("http")
async def apply_active_library(request: Request, call_next):
    raw = request.headers.get("X-Library-Id", "").strip()
    library_id: int | None = None
    if raw:
        try:
            parsed = int(raw)
            if parsed > 0:
                library_id = parsed
        except ValueError:
            library_id = None

    token = set_active_library_id(library_id)
    try:
        return await call_next(request)
    finally:
        reset_active_library_id(token)

# Rate limiter
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS — allow the Next.js frontend during development + configurable extra origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
        *EXTRA_CORS_ORIGINS,
    ],
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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


class GraphQLRequest(BaseModel):
    query: str
    variables: Optional[dict[str, Any]] = None
    operationName: Optional[str] = None


class CreateLibraryRequest(BaseModel):
    name: str
    discipline: str = ""
    description: str = ""


class UpdateLibraryRequest(BaseModel):
    name: str
    discipline: str = ""
    description: str = ""


class DoiImportRequest(BaseModel):
    doi: str


def _doi_to_paper_id(doi: str) -> str:
    normalized = doi.strip().lower()
    normalized = re.sub(r"^https?://(?:dx\.)?doi\.org/", "", normalized)
    normalized = re.sub(r"^doi:\s*", "", normalized)
    safe = re.sub(r"[^a-z0-9]+", "_", normalized).strip("_")
    return f"doi_{safe}"[:120] or "doi_paper"


def _extract_csl_year(payload: dict) -> int | None:
    for key in ("published-print", "published-online", "issued"):
        raw_date = payload.get(key)
        parts = raw_date.get("date-parts") if isinstance(raw_date, dict) else None
        if parts and isinstance(parts, list) and parts[0]:
            try:
                return int(parts[0][0])
            except (TypeError, ValueError):
                continue
    return None


def _extract_csl_authors(payload: dict) -> list[str]:
    authors: list[str] = []
    for item in payload.get("author") or []:
        if not isinstance(item, dict):
            continue
        literal = str(item.get("literal") or "").strip()
        if literal:
            authors.append(literal)
            continue
        given = str(item.get("given") or "").strip()
        family = str(item.get("family") or "").strip()
        name = " ".join(part for part in [given, family] if part)
        if name:
            authors.append(name)
    return authors


def _fetch_doi_metadata(doi: str) -> dict[str, object]:
    normalized = doi.strip()
    normalized = re.sub(r"^https?://(?:dx\.)?doi\.org/", "", normalized, flags=re.I)
    normalized = re.sub(r"^doi:\s*", "", normalized, flags=re.I)
    if not normalized:
        raise ValueError("DOI is required.")
    url = f"https://doi.org/{urllib.parse.quote(normalized, safe='/')}"
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "application/vnd.citationstyles.csl+json",
            "User-Agent": "Research Knowledge Base DOI importer",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=12) as response:
            raw = response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        raise ValueError(f"DOI lookup failed with HTTP {exc.code}.") from exc
    except urllib.error.URLError as exc:
        raise ValueError(f"DOI lookup failed: {exc.reason}") from exc
    payload = json.loads(raw)
    title_raw = payload.get("title")
    title = title_raw[0] if isinstance(title_raw, list) and title_raw else str(title_raw or "")
    return {
        "doi": normalized,
        "paper_id": _doi_to_paper_id(normalized),
        "title": title.strip(),
        "authors": _extract_csl_authors(payload),
        "year": _extract_csl_year(payload),
        "source_url": url,
    }


class AIProviderSettingRequest(BaseModel):
    provider: str
    enabled: bool = False
    base_url: str = ""
    api_key: str = ""
    default_model: str = ""
    clear_api_key: bool = False


class AIStepConfigRequest(BaseModel):
    step: str
    provider: str
    model: str = ""


class AISettingsRequest(BaseModel):
    provider_settings: list[AIProviderSettingRequest]
    step_configs: list[AIStepConfigRequest]


class AIProviderTestRequest(BaseModel):
    provider: str
    base_url: str = ""
    api_key: str = ""
    default_model: str = ""
    clear_api_key: bool = False


def _validate_ai_settings_request(body: AISettingsRequest) -> None:
    from llm_runtime import (
        PROVIDER_PRESET_MAP,
        STEP_DEFINITION_MAP,
        load_workspace_ai_settings,
    )

    current_settings = load_workspace_ai_settings(include_secrets=True)
    current_providers = current_settings.get("providers", {})
    requested_providers = {item.provider: item for item in body.provider_settings}

    effective_providers: dict[str, dict[str, object]] = {}
    for provider_key, preset in PROVIDER_PRESET_MAP.items():
        incoming = requested_providers.get(provider_key)
        existing = current_providers.get(provider_key, {})

        enabled = bool(incoming.enabled) if incoming is not None else bool(existing.get("enabled"))
        base_url = (
            (incoming.base_url.strip() if incoming is not None else "")
            or str(existing.get("base_url") or "").strip()
            or preset.default_base_url
        )
        default_model = (
            (incoming.default_model.strip() if incoming is not None else "")
            or str(existing.get("default_model") or "").strip()
            or preset.default_model
        )
        existing_key = str(existing.get("api_key") or "").strip()
        incoming_key = (incoming.api_key.strip() if incoming is not None else "")
        clear_api_key = bool(incoming.clear_api_key) if incoming is not None else False
        effective_api_key = incoming_key or ("" if clear_api_key else existing_key)

        if enabled and not base_url:
            raise HTTPException(
                status_code=400,
                detail=f"Provider '{preset.label}' is enabled but has no API base URL.",
            )
        if enabled and not default_model:
            raise HTTPException(
                status_code=400,
                detail=f"Provider '{preset.label}' is enabled but has no default model.",
            )
        if enabled and not effective_api_key:
            raise HTTPException(
                status_code=400,
                detail=f"Provider '{preset.label}' is enabled but has no API key configured.",
            )

        effective_providers[provider_key] = {
            "enabled": enabled,
            "has_key": bool(effective_api_key),
        }

    for step_config in body.step_configs:
        step_key = step_config.step.strip()
        if step_key not in STEP_DEFINITION_MAP:
            continue

        provider_key = step_config.provider.strip() or STEP_DEFINITION_MAP[step_key].default_provider
        if provider_key not in effective_providers:
            raise HTTPException(
                status_code=400,
                detail=f"Step '{STEP_DEFINITION_MAP[step_key].label}' references unknown provider '{provider_key}'.",
            )

        provider_state = effective_providers[provider_key]
        if not provider_state["enabled"]:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Step '{STEP_DEFINITION_MAP[step_key].label}' is routed to provider "
                    f"'{PROVIDER_PRESET_MAP[provider_key].label}', but that provider is disabled."
                ),
            )
        if not provider_state["has_key"]:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Step '{STEP_DEFINITION_MAP[step_key].label}' is routed to provider "
                    f"'{PROVIDER_PRESET_MAP[provider_key].label}', but no API key is configured."
                ),
            )


@app.get("/api/health")
async def health():
    embedding_index_loaded = False
    embedding_model_warmed = False
    try:
        from embeddings import is_loaded, is_model_warmed
        embedding_index_loaded = is_loaded()
        embedding_model_warmed = is_model_warmed()
    except Exception:
        logger.exception("Failed to read embedding health state")
    return {
        "status": "ok",
        "app_name": APP_NAME,
        "source_name": SOURCE_NAME,
        "db_exists": os.path.isfile(KB_DB_PATH),
        "embedding_index_loaded": embedding_index_loaded,
        "embedding_model_warmed": embedding_model_warmed,
        "supports_remote_discovery": SUPPORTS_REMOTE_DISCOVERY,
    }


@app.get("/api/config")
async def app_config():
    return {
        "app_name": APP_NAME,
        "app_description": APP_DESCRIPTION,
        "source_name": SOURCE_NAME,
        "source_paper_label": SOURCE_PAPER_LABEL,
        "remote_discovery_label": REMOTE_DISCOVERY_LABEL,
        "supports_remote_discovery": SUPPORTS_REMOTE_DISCOVERY,
        "remote_source_kind": REMOTE_SOURCE_KIND,
        "export_basename": EXPORT_BASENAME,
        "kb_db_path": KB_DB_PATH,
        "knowledge_base_dir": str(KNOWLEDGE_BASE_DIR),
        "papers_dir": str(PAPERS_DIR),
        "projects_dir": str(PROJECTS_DIR),
        "agent_db_path": str(AGENT_DB_PATH),
    }


@app.get("/api/libraries")
async def libraries_endpoint():
    return {"libraries": list_libraries()}


@app.get("/api/libraries/{library_id}")
async def library_detail_endpoint(library_id: int):
    library = get_library(library_id)
    if library is None:
        raise HTTPException(status_code=404, detail="Library not found.")
    return {"library": library}


@app.get("/api/libraries/{library_id}/papers")
async def library_papers_endpoint(
    library_id: int,
    q: str = Query(default=""),
    field: str = Query(default=""),
    year_min: int | None = Query(default=None),
    year_max: int | None = Query(default=None),
    processing_status: str = Query(default=""),
    reading_profile: str = Query(default=""),
    coverage: str = Query(default=""),
    feedback: str = Query(default=""),
    has_card: bool | None = Query(default=None),
    sort: str = Query(default="updated_desc"),
    limit: int = Query(default=25, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
):
    if not library_exists(library_id):
        raise HTTPException(status_code=404, detail="Library not found.")
    return list_library_papers(
        library_id=library_id,
        search=q,
        field=field,
        year_min=year_min,
        year_max=year_max,
        processing_status=processing_status,
        reading_profile=reading_profile,
        coverage=coverage,
        feedback=feedback,
        has_card=has_card,
        sort=sort,
        limit=limit,
        offset=offset,
    )


@app.post("/api/libraries/{library_id}/papers/from-doi")
async def library_import_doi_endpoint(library_id: int, body: DoiImportRequest):
    if not library_exists(library_id):
        raise HTTPException(status_code=404, detail="Library not found.")
    try:
        metadata = await asyncio.to_thread(_fetch_doi_metadata, body.doi)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    attach_metadata_paper_to_library(
        library_id=library_id,
        paper_id=str(metadata["paper_id"]),
        title=str(metadata["title"]),
        authors=list(metadata["authors"]) if isinstance(metadata["authors"], list) else [],
        year=metadata["year"] if isinstance(metadata["year"], int) else None,
        source_url=str(metadata["source_url"]),
    )
    return {"paper": metadata, "status": "indexed"}


@app.post("/api/libraries/{library_id}/papers/reprocess")
async def library_batch_reprocess_endpoint(
    library_id: int,
    body: BatchPaperReprocessRequest,
):
    from pipeline import reprocess_existing_paper

    if not library_exists(library_id):
        raise HTTPException(status_code=404, detail="Library not found.")

    paper_ids = [paper_id.strip() for paper_id in body.paper_ids if paper_id.strip()]
    if not paper_ids:
        raise HTTPException(status_code=400, detail="paper_ids is required.")
    if len(paper_ids) > 20:
        raise HTTPException(
            status_code=400,
            detail="Batch reprocess is limited to 20 papers per request.",
        )

    results: list[dict[str, object]] = []
    for paper_id in paper_ids:
        try:
            payload = await reprocess_existing_paper(
                paper_id=paper_id,
                library_id=library_id,
                reading_profile=body.reading_profile or None,
                analysis_focuses=body.analysis_focuses,
            )
            results.append({"paper_id": paper_id, "ok": True, "result": payload})
        except Exception as exc:
            results.append({"paper_id": paper_id, "ok": False, "error": str(exc)})

    processed = sum(1 for item in results if item["ok"])
    return {
        "library_id": library_id,
        "requested": len(paper_ids),
        "processed": processed,
        "failed": len(results) - processed,
        "items": results,
    }


@app.get("/api/papers/{paper_id}/processing")
async def paper_processing_endpoint(
    paper_id: str,
    library_id: int | None = Query(default=None),
):
    resolved_library_id = library_id or get_active_library_id() or ensure_default_library()
    if not library_exists(resolved_library_id):
        raise HTTPException(status_code=404, detail="Library not found.")
    payload = get_paper_processing_state(
        library_id=resolved_library_id,
        paper_id=paper_id,
    )
    if payload is None:
        raise HTTPException(status_code=404, detail="Paper not found in the selected library.")
    return payload


@app.get("/api/papers/{paper_id}/feedback")
async def paper_feedback_endpoint(
    paper_id: str,
    library_id: int | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
):
    resolved_library_id = library_id or get_active_library_id() or ensure_default_library()
    if not library_exists(resolved_library_id):
        raise HTTPException(status_code=404, detail="Library not found.")
    return {
        "items": list_paper_feedback(
            library_id=resolved_library_id,
            paper_id=paper_id,
            limit=limit,
        )
    }


@app.post("/api/papers/{paper_id}/feedback")
async def add_paper_feedback_endpoint(
    paper_id: str,
    body: PaperFeedbackRequest,
):
    resolved_library_id = body.library_id or get_active_library_id() or ensure_default_library()
    if not library_exists(resolved_library_id):
        raise HTTPException(status_code=404, detail="Library not found.")
    if not body.feedback_type.strip():
        raise HTTPException(status_code=400, detail="feedback_type is required.")
    if body.rating is not None and (body.rating < 1 or body.rating > 5):
        raise HTTPException(status_code=400, detail="rating must be between 1 and 5.")
    item = add_paper_feedback(
        library_id=resolved_library_id,
        paper_id=paper_id,
        dimension_key=body.dimension_key,
        feedback_type=body.feedback_type,
        rating=body.rating,
        comment=body.comment,
    )
    return {"item": item}


@app.patch("/api/feedback/{feedback_id}")
async def update_feedback_action_status_endpoint(
    feedback_id: int,
    body: FeedbackActionStatusRequest,
):
    resolved_library_id = body.library_id or get_active_library_id() or ensure_default_library()
    if not library_exists(resolved_library_id):
        raise HTTPException(status_code=404, detail="Library not found.")

    normalized_status = body.action_status.strip().lower()
    if normalized_status not in {"open", "resolved"}:
        raise HTTPException(status_code=400, detail="action_status must be open or resolved.")

    item = update_paper_feedback_action_status(
        library_id=resolved_library_id,
        feedback_id=feedback_id,
        action_status=normalized_status,
    )
    if item is None:
        raise HTTPException(status_code=404, detail="Feedback not found.")
    return {"item": item}


@app.post("/api/papers/{paper_id}/reprocess")
async def reprocess_paper_endpoint(
    paper_id: str,
    body: PaperReprocessRequest,
):
    from pipeline import reprocess_existing_paper

    resolved_library_id = body.library_id or get_active_library_id() or ensure_default_library()
    if not library_exists(resolved_library_id):
        raise HTTPException(status_code=404, detail="Library not found.")
    try:
        result = await reprocess_existing_paper(
            paper_id,
            library_id=resolved_library_id,
            reading_profile=body.reading_profile or None,
            analysis_focuses=body.analysis_focuses if body.analysis_focuses else None,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return result


@app.get("/api/ai/settings")
async def ai_settings_endpoint():
    return get_ai_settings()


@app.put("/api/ai/settings")
async def save_ai_settings_endpoint(body: AISettingsRequest):
    _validate_ai_settings_request(body)
    payload = save_ai_settings(
        provider_settings=[item.model_dump() for item in body.provider_settings],
        step_configs=[item.model_dump() for item in body.step_configs],
    )
    try:
        from rag import reset_llm_clients

        reset_llm_clients()
    except Exception:
        logger.exception("Failed to reset LLM client cache after saving AI settings")
    return payload


@app.post("/api/ai/providers/test")
async def test_ai_provider_endpoint(body: AIProviderTestRequest):
    from llm_runtime import (
        build_async_client_from_runtime,
        build_runtime_override,
        load_workspace_ai_settings,
    )

    settings = load_workspace_ai_settings(include_secrets=True)
    saved_provider = settings["providers"].get(body.provider, {})
    saved_key = "" if body.clear_api_key else str(saved_provider.get("api_key") or "")
    runtime = build_runtime_override(
        step="rag",
        provider=body.provider,
        base_url=body.base_url or str(saved_provider.get("base_url") or ""),
        api_key=body.api_key or saved_key,
        model=body.default_model or str(saved_provider.get("default_model") or ""),
    )

    try:
        client = build_async_client_from_runtime(runtime)
        response = await client.messages.create(
            model=runtime["model"],
            max_tokens=32,
            system="Reply with only the word OK.",
            messages=[{"role": "user", "content": "Connection test."}],
        )
        return {
            "success": True,
            "provider": runtime["provider"],
            "model": runtime["model"],
            "base_url": runtime["base_url"],
            "preview": response.content[0].text[:80],
        }
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/libraries")
async def create_library_endpoint(body: CreateLibraryRequest):
    if not body.name.strip():
        raise HTTPException(status_code=400, detail="Library name is required.")
    library = create_library(
        name=body.name,
        discipline=body.discipline,
        description=body.description,
    )
    return {"library": library}


@app.patch("/api/libraries/{library_id}")
async def update_library_endpoint(library_id: int, body: UpdateLibraryRequest):
    if not body.name.strip():
        raise HTTPException(status_code=400, detail="Library name is required.")
    if not library_exists(library_id):
        raise HTTPException(status_code=404, detail="Library not found.")
    library = update_library(
        library_id,
        name=body.name,
        discipline=body.discipline,
        description=body.description,
    )
    return {"library": library}


@app.delete("/api/libraries/{library_id}")
async def delete_library_endpoint(library_id: int):
    if not library_exists(library_id):
        raise HTTPException(status_code=404, detail="Library not found.")
    try:
        result = delete_library(library_id)
        resolvers.clear_runtime_caches()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return result


@app.get("/api/libraries/{library_id}/imports")
async def library_imports_endpoint(library_id: int, limit: int = Query(default=20, ge=1, le=100)):
    if not library_exists(library_id):
        raise HTTPException(status_code=404, detail="Library not found.")
    from pipeline import get_import_history

    return get_import_history(library_id=library_id, limit=limit)


@app.post("/api/libraries/{library_id}/reindex")
async def library_reindex_endpoint(library_id: int):
    if not library_exists(library_id):
        raise HTTPException(status_code=404, detail="Library not found.")
    from pipeline import refresh_website_db

    return {
        "library_id": library_id,
        "result": refresh_website_db(library_id=library_id),
    }


@app.get("/graphql")
async def graphql_info() -> PlainTextResponse:
    return PlainTextResponse(
        "GraphQL endpoint is available at POST /graphql with a JSON body containing query, variables, and optional operationName.",
    )


@app.post("/graphql")
async def graphql_endpoint(body: GraphQLRequest) -> JSONResponse:
    result = await schema.execute(
        body.query,
        variable_values=body.variables,
        operation_name=body.operationName,
    )

    payload: dict[str, Any] = {"data": result.data}
    status_code = 200
    if result.errors:
        payload["errors"] = [error.formatted for error in result.errors]
        if result.data is None:
            status_code = 400
    if result.extensions:
        payload["extensions"] = result.extensions

    return JSONResponse(payload, status_code=status_code)


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
    """Generate a single BibTeX entry for one paper."""
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
    lines.append(f"  institution = {{{PUBLISHER_NAME}}},")
    lines.append("  type = {Working Paper},")
    lines.append(f"  number = {{{number}}},")
    lines.append(f"  series = {{{SERIES_NAME}}},")
    lines.append(f"  url = {{{build_paper_url(paper_id)}}}")
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
            headers={"Content-Disposition": f'attachment; filename="{EXPORT_BASENAME}.bib"'},
        )

    entries: list[str] = []

    if os.path.isfile(KB_DB_PATH):
        try:
            db = await resolvers._get_db()
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
        headers={"Content-Disposition": f'attachment; filename="{EXPORT_BASENAME}.bib"'},
    )


# ---------------------------------------------------------------------------
# RIS export
# ---------------------------------------------------------------------------


def _paper_to_ris(paper_id: str, title: str | None, authors_raw: str | None, year: int | None) -> str:
    """Generate a single RIS entry for one paper."""
    authors = _parse_authors_bibtex(authors_raw)
    lines = ["TY  - RPRT"]
    for author in authors:
        lines.append(f"AU  - {_format_author_bibtex(author)}")
    lines.append(f"TI  - {title or paper_id}")
    if year:
        lines.append(f"PY  - {year}")
    lines.append(f"PB  - {PUBLISHER_NAME}")
    number = paper_id.lstrip("w") if paper_id.startswith("w") else paper_id
    lines.append(f"M1  - Working Paper {number}")
    lines.append(f"T3  - {SERIES_NAME}")
    lines.append(f"UR  - {build_paper_url(paper_id)}")
    lines.append("ER  - ")
    return "\n".join(lines)


@app.get("/api/export/ris")
async def export_ris(ids: str = Query(..., description="Comma-separated paper IDs")):
    """Export papers as RIS format for reference managers."""
    paper_ids = [pid.strip() for pid in ids.split(",") if pid.strip()]
    if not paper_ids:
        return PlainTextResponse("", media_type="application/x-research-info-systems",
                                 headers={"Content-Disposition": f'attachment; filename="{EXPORT_BASENAME}.ris"'})

    entries = []
    try:
        db = await resolvers._get_db()
        placeholders = ",".join("?" for _ in paper_ids)
        cursor = await db.execute(
            f"SELECT paper_id, title, authors, year FROM papers WHERE paper_id IN ({placeholders})",
            paper_ids,
        )
        rows = await cursor.fetchall()
        row_map = {r["paper_id"]: r for r in rows}
        for pid in paper_ids:
            row = row_map.get(pid)
            if row:
                entries.append(_paper_to_ris(row["paper_id"], row["title"], row["authors"], row["year"]))
    except Exception:
        logger.exception("export_ris failed")

    content = "\n\n".join(entries)
    return PlainTextResponse(
        content,
        media_type="application/x-research-info-systems",
        headers={"Content-Disposition": f'attachment; filename="{EXPORT_BASENAME}.ris"'},
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
    writer.writerow(["paper_id", "title", "authors", "year", "fields", "average_score", "triage_decision", "source_url"])

    if paper_ids:
        if os.path.isfile(KB_DB_PATH):
            try:
                db = await resolvers._get_db()
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
                            row["nber_url"] or build_paper_url(row["paper_id"]),
                        ])
            except Exception:
                logger.exception("export_csv failed")

    csv_content = output.getvalue()
    return PlainTextResponse(
        csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{EXPORT_BASENAME}.csv"'},
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
        if os.path.isfile(KB_DB_PATH):
            try:
                db = await resolvers._get_db()
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
        headers={"Content-Disposition": f'attachment; filename="{EXPORT_BASENAME}.md"'},
    )


# ---------------------------------------------------------------------------
# Annotated bibliography export
# ---------------------------------------------------------------------------


@app.get("/api/export/annotated-bib")
async def export_annotated_bibliography(
    ids: str = Query(..., description="Comma-separated paper IDs"),
    grouping: str = Query("thematic", description="thematic | chronological | methodological"),
):
    """Export an annotated bibliography with per-paper summaries grouped by theme."""
    paper_ids = [pid.strip() for pid in ids.split(",") if pid.strip()]
    if not paper_ids:
        return PlainTextResponse("", media_type="text/markdown")

    db = await resolvers._get_db()
    placeholders = ",".join("?" for _ in paper_ids)

    # Fetch papers
    cursor = await db.execute(
        f"SELECT paper_id, title, authors, year, fields, average_score FROM papers WHERE paper_id IN ({placeholders})",
        paper_ids,
    )
    rows = await cursor.fetchall()

    # Fetch card sections
    sec_cursor = await db.execute(
        f"SELECT paper_id, section, content FROM card_sections WHERE paper_id IN ({placeholders})",
        paper_ids,
    )
    sec_rows = await sec_cursor.fetchall()
    sections_by_paper = {}
    for sr in sec_rows:
        sections_by_paper.setdefault(sr["paper_id"], {})[sr["section"]] = sr["content"]

    # Build annotated entries
    entries = []
    for row in rows:
        pid = row["paper_id"]
        authors = _parse_authors_bibtex(row["authors"])
        sections = sections_by_paper.get(pid, {})

        # Build annotation: research question + key finding (first 2 sentences each)
        rq = sections.get("Research Question", "")
        kf = sections.get("Key Findings", "")
        method = sections.get("Identification & Method", "")

        annotation = ""
        if rq:
            annotation += rq.split(".")[0].strip() + ". "
        if method:
            first_sent = method.split(".")[0].strip()
            annotation += f"Uses {first_sent.lower() if not first_sent[0:1].isupper() else first_sent}. "
        if kf:
            annotation += kf.split(".")[0].strip() + "."

        fields = []
        try:
            fields = json.loads(row["fields"]) if row["fields"] else []
        except (json.JSONDecodeError, TypeError):
            pass

        entries.append({
            "paper_id": pid,
            "title": row["title"] or pid,
            "authors": authors,
            "year": row["year"],
            "fields": fields,
            "annotation": annotation[:500],
        })

    # Group entries
    lines = ["# Annotated Bibliography\n"]

    if grouping == "chronological":
        entries.sort(key=lambda e: e["year"] or 0)
        current_year = None
        for e in entries:
            if e["year"] != current_year:
                current_year = e["year"]
                lines.append(f"\n## {current_year or 'Unknown Year'}\n")
            lines.append(f"**{e['paper_id']}**: {e['title']}")
            lines.append(f"*{', '.join(e['authors'][:3])}* ({e['year'] or 'N/A'})\n")
            lines.append(f"> {e['annotation']}\n")
    elif grouping == "methodological":
        # Group by first field
        by_field: dict[str, list] = {}
        for e in entries:
            field = e["fields"][0] if e["fields"] else "Other"
            by_field.setdefault(field, []).append(e)
        for field, field_entries in sorted(by_field.items()):
            lines.append(f"\n## {field}\n")
            for e in field_entries:
                lines.append(f"**{e['paper_id']}**: {e['title']}")
                lines.append(f"*{', '.join(e['authors'][:3])}* ({e['year'] or 'N/A'})\n")
                lines.append(f"> {e['annotation']}\n")
    else:  # thematic (default) — group by field
        by_field_t: dict[str, list] = {}
        for e in entries:
            field = e["fields"][0] if e["fields"] else "Other"
            by_field_t.setdefault(field, []).append(e)
        for field, field_entries in sorted(by_field_t.items()):
            lines.append(f"\n## {field}\n")
            for e in sorted(field_entries, key=lambda x: x["year"] or 0, reverse=True):
                lines.append(f"**{e['paper_id']}**: {e['title']}")
                lines.append(f"*{', '.join(e['authors'][:3])}* ({e['year'] or 'N/A'})\n")
                lines.append(f"> {e['annotation']}\n")

    content = "\n".join(lines)
    return PlainTextResponse(
        content,
        media_type="text/markdown",
        headers={"Content-Disposition": 'attachment; filename="annotated_bibliography.md"'},
    )


# ---------------------------------------------------------------------------
# Project export bundle (ZIP)
# ---------------------------------------------------------------------------

import zipfile


def _archive_directory(
    zf: zipfile.ZipFile,
    source_dir: Path,
    archive_root: str,
) -> int:
    """Add one directory tree to the ZIP and return the file count."""
    if not source_dir.exists() or not source_dir.is_dir():
        return 0

    count = 0
    for path in sorted(source_dir.rglob("*")):
        if not path.is_file():
            continue
        rel_path = path.relative_to(source_dir)
        zf.write(path, arcname=str(Path(archive_root) / rel_path))
        count += 1
    return count


async def _fetch_library_export_payload(library_id: int) -> dict[str, object]:
    """Collect one library's metadata and structured content for export."""
    library = get_library(library_id)
    if library is None:
        raise HTTPException(status_code=404, detail="Library not found")

    db = await resolvers._get_db()
    cursor = await db.execute(
        """
        SELECT p.*
        FROM papers p
        JOIN library_papers lp ON lp.paper_id = p.paper_id
        WHERE lp.library_id = ?
        ORDER BY p.paper_id
        """,
        (library_id,),
    )
    paper_rows = await cursor.fetchall()

    sections_cursor = await db.execute(
        """
        SELECT cs.paper_id, cs.section, cs.content
        FROM card_sections cs
        JOIN library_papers lp ON lp.paper_id = cs.paper_id
        WHERE lp.library_id = ?
        ORDER BY cs.paper_id, cs.section
        """,
        (library_id,),
    )
    sections_by_paper: dict[str, list[dict[str, str]]] = {}
    for row in await sections_cursor.fetchall():
        sections_by_paper.setdefault(row["paper_id"], []).append(
            {"section": row["section"], "content": row["content"]}
        )

    maps_cursor = await db.execute(
        """
        SELECT slug, title, content, updated_at
        FROM library_field_maps
        WHERE library_id = ?
        ORDER BY slug
        """,
        (library_id,),
    )
    map_rows = await maps_cursor.fetchall()

    ideas_cursor = await db.execute(
        """
        SELECT *
        FROM library_ideas
        WHERE library_id = ?
        ORDER BY generated_date DESC, id DESC
        """,
        (library_id,),
    )
    idea_rows = await ideas_cursor.fetchall()

    evaluations_cursor = await db.execute(
        """
        SELECT *
        FROM library_idea_evaluations
        WHERE library_id = ?
        ORDER BY idea_id
        """,
        (library_id,),
    )
    evaluation_rows = await evaluations_cursor.fetchall()

    digests_cursor = await db.execute(
        """
        SELECT date, content, created_at
        FROM library_digests
        WHERE library_id = ?
        ORDER BY date DESC
        """,
        (library_id,),
    )
    digest_rows = await digests_cursor.fetchall()

    papers: list[dict[str, object]] = []
    for row in paper_rows:
        paper = resolvers._row_to_paper(row)
        paper["sections"] = sections_by_paper.get(row["paper_id"], [])
        papers.append(paper)

    ideas: list[dict[str, object]] = []
    evaluations_by_id = {
        row["idea_id"]: {
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
            "evaluated_at": row["evaluated_at"],
        }
        for row in evaluation_rows
    }
    for row in idea_rows:
        idea = resolvers._row_to_idea(row)
        idea["evaluation"] = evaluations_by_id.get(row["id"])
        ideas.append(idea)

    field_maps = [
        {
            "slug": row["slug"],
            "title": row["title"],
            "content": row["content"],
            "updated_at": row["updated_at"],
        }
        for row in map_rows
    ]
    digests = [
        {"date": row["date"], "content": row["content"], "created_at": row["created_at"]}
        for row in digest_rows
    ]

    return {
        "library": library,
        "papers": papers,
        "field_maps": field_maps,
        "ideas": ideas,
        "digests": digests,
        "imports": list_import_batches(library_id=library_id, limit=200, file_limit=200),
    }


@app.get("/api/libraries/{library_id}/export")
async def export_library_bundle(
    library_id: int,
    include_pdfs: bool = Query(default=True),
    include_knowledge_base: bool = Query(default=True),
    include_agent_db: bool = Query(default=False),
):
    """Export one library as a reusable ZIP bundle."""
    if not library_exists(library_id):
        raise HTTPException(status_code=404, detail="Library not found.")

    payload = await _fetch_library_export_payload(library_id)
    library = payload["library"]
    assert isinstance(library, dict)

    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as zf:
        exported_at = datetime.utcnow().isoformat(timespec="seconds") + "Z"
        manifest = {
            "version": 1,
            "exported_at": exported_at,
            "app_name": APP_NAME,
            "source_name": SOURCE_NAME,
            "library": library,
            "options": {
                "include_pdfs": include_pdfs,
                "include_knowledge_base": include_knowledge_base,
                "include_agent_db": include_agent_db,
            },
            "counts": {
                "papers": len(payload["papers"]),
                "field_maps": len(payload["field_maps"]),
                "ideas": len(payload["ideas"]),
                "digests": len(payload["digests"]),
                "imports": len(payload["imports"]),
            },
        }
        readme_lines = [
            f"# {library['name']} Export Bundle",
            "",
            f"- Exported at: {exported_at}",
            f"- Papers: {len(payload['papers'])}",
            f"- Field maps: {len(payload['field_maps'])}",
            f"- Ideas: {len(payload['ideas'])}",
            f"- Digests: {len(payload['digests'])}",
            "",
            "This bundle contains the library metadata, structured content, import history,",
            "and optionally the raw PDFs / knowledge-base markdown used to build the library.",
        ]

        zf.writestr("manifest.json", json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
        zf.writestr("README.md", "\n".join(readme_lines) + "\n")
        zf.writestr(
            "data/papers.json",
            json.dumps(payload["papers"], indent=2, ensure_ascii=False) + "\n",
        )
        zf.writestr(
            "data/field_maps.json",
            json.dumps(payload["field_maps"], indent=2, ensure_ascii=False) + "\n",
        )
        zf.writestr(
            "data/ideas.json",
            json.dumps(payload["ideas"], indent=2, ensure_ascii=False) + "\n",
        )
        zf.writestr(
            "data/digests.json",
            json.dumps(payload["digests"], indent=2, ensure_ascii=False) + "\n",
        )
        zf.writestr(
            "data/import_history.json",
            json.dumps(payload["imports"], indent=2, ensure_ascii=False) + "\n",
        )

        papers_dir = Path(str(library.get("papers_dir", ""))).expanduser()
        kb_dir = Path(str(library.get("knowledge_base_dir", ""))).expanduser()
        agent_db_path = Path(str(library.get("agent_db_path", ""))).expanduser()

        archived_counts = {
            "pdf_files": _archive_directory(zf, papers_dir, "files/papers") if include_pdfs else 0,
            "knowledge_base_files": _archive_directory(zf, kb_dir, "files/knowledge_base")
            if include_knowledge_base
            else 0,
            "agent_db_files": 0,
        }
        if include_agent_db and agent_db_path.exists() and agent_db_path.is_file():
            zf.write(agent_db_path, arcname="files/agent_db/agent_papers.db")
            archived_counts["agent_db_files"] = 1

        zf.writestr(
            "data/archive_summary.json",
            json.dumps(archived_counts, indent=2, ensure_ascii=False) + "\n",
        )

    output.seek(0)
    filename = f"{library['slug']}_bundle.zip"
    return StreamingResponse(
        output,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _read_bundle_json(zf: zipfile.ZipFile, path: str, fallback: object) -> object:
    try:
        return json.loads(zf.read(path).decode("utf-8"))
    except KeyError:
        return fallback
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=400, detail=f"Invalid bundle JSON: {path}") from exc


def _safe_zip_member_path(filename: str) -> PurePosixPath:
    path = PurePosixPath(filename)
    if path.is_absolute() or any(part in {"", ".", ".."} for part in path.parts):
        raise HTTPException(status_code=400, detail=f"Unsafe bundle path: {filename}")
    return path


def _extract_bundle_tree(zf: zipfile.ZipFile, archive_root: str, target_dir: Path) -> int:
    target_dir.mkdir(parents=True, exist_ok=True)
    root = PurePosixPath(archive_root)
    count = 0
    for info in zf.infolist():
        if info.is_dir():
            continue
        member_path = _safe_zip_member_path(info.filename)
        if not member_path.is_relative_to(root):
            continue
        rel_path = member_path.relative_to(root)
        destination = target_dir.joinpath(*rel_path.parts)
        destination.parent.mkdir(parents=True, exist_ok=True)
        with zf.open(info) as src, destination.open("wb") as dst:
            shutil.copyfileobj(src, dst)
        count += 1
    return count


def _json_list(value: object) -> str:
    if isinstance(value, list):
        return json.dumps(value, ensure_ascii=False)
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            if isinstance(parsed, list):
                return json.dumps(parsed, ensure_ascii=False)
        except json.JSONDecodeError:
            pass
        return json.dumps([value], ensure_ascii=False) if value.strip() else "[]"
    return "[]"


def _restore_library_payload(library_id: int, payload: dict[str, object]) -> dict[str, int]:
    papers = payload.get("papers") if isinstance(payload.get("papers"), list) else []
    field_maps = payload.get("field_maps") if isinstance(payload.get("field_maps"), list) else []
    ideas = payload.get("ideas") if isinstance(payload.get("ideas"), list) else []
    digests = payload.get("digests") if isinstance(payload.get("digests"), list) else []

    conn = get_connection()
    cur = conn.cursor()

    restored_sections = 0
    for raw_paper in papers:
        if not isinstance(raw_paper, dict):
            continue
        paper_id = str(raw_paper.get("paper_id") or raw_paper.get("paperId") or "").strip()
        if not paper_id:
            continue
        cur.execute(
            """
            INSERT INTO papers
            (paper_id, title, authors, year, fields, jel, triage_decision, triage_summary,
             average_score, has_card, abstract, nber_url)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(paper_id) DO UPDATE SET
                title = COALESCE(NULLIF(excluded.title, ''), papers.title),
                authors = CASE WHEN excluded.authors != '[]' THEN excluded.authors ELSE papers.authors END,
                year = COALESCE(excluded.year, papers.year),
                fields = CASE WHEN excluded.fields != '[]' THEN excluded.fields ELSE papers.fields END,
                jel = CASE WHEN excluded.jel != '[]' THEN excluded.jel ELSE papers.jel END,
                triage_decision = COALESCE(excluded.triage_decision, papers.triage_decision),
                triage_summary = COALESCE(excluded.triage_summary, papers.triage_summary),
                average_score = COALESCE(excluded.average_score, papers.average_score),
                has_card = CASE WHEN excluded.has_card THEN excluded.has_card ELSE papers.has_card END,
                abstract = COALESCE(excluded.abstract, papers.abstract),
                nber_url = COALESCE(excluded.nber_url, papers.nber_url)
            """,
            (
                paper_id,
                str(raw_paper.get("title") or paper_id),
                _json_list(raw_paper.get("authors")),
                raw_paper.get("year"),
                _json_list(raw_paper.get("fields")),
                _json_list(raw_paper.get("jel")),
                raw_paper.get("triage_decision"),
                raw_paper.get("triage_summary"),
                raw_paper.get("average_score"),
                1 if raw_paper.get("has_card") else 0,
                raw_paper.get("abstract"),
                raw_paper.get("nber_url"),
            ),
        )
        cur.execute(
            "INSERT OR IGNORE INTO library_papers (library_id, paper_id) VALUES (?, ?)",
            (library_id, paper_id),
        )
        for section in raw_paper.get("sections") or []:
            if not isinstance(section, dict):
                continue
            section_name = str(section.get("section") or "").strip()
            if not section_name:
                continue
            cur.execute(
                """
                INSERT INTO card_sections (paper_id, section, content)
                VALUES (?, ?, ?)
                ON CONFLICT(paper_id, section) DO UPDATE SET content = excluded.content
                """,
                (paper_id, section_name, str(section.get("content") or "")),
            )
            restored_sections += 1

    for item in field_maps:
        if not isinstance(item, dict):
            continue
        slug = str(item.get("slug") or "").strip()
        if not slug:
            continue
        cur.execute(
            """
            INSERT INTO library_field_maps (library_id, slug, title, content, updated_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(library_id, slug) DO UPDATE SET
                title = excluded.title,
                content = excluded.content,
                updated_at = excluded.updated_at
            """,
            (library_id, slug, item.get("title"), item.get("content"), item.get("updated_at")),
        )

    restored_evaluations = 0
    for item in ideas:
        if not isinstance(item, dict):
            continue
        idea_id = str(item.get("id") or "").strip()
        if not idea_id:
            continue
        cur.execute(
            """
            INSERT INTO library_ideas
            (library_id, id, title, status, generated_date, heuristic, source_papers, content,
             novelty, feasibility, impact, composite)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(library_id, id) DO UPDATE SET
                title = excluded.title,
                status = excluded.status,
                generated_date = excluded.generated_date,
                heuristic = excluded.heuristic,
                source_papers = excluded.source_papers,
                content = excluded.content,
                novelty = excluded.novelty,
                feasibility = excluded.feasibility,
                impact = excluded.impact,
                composite = excluded.composite
            """,
            (
                library_id,
                idea_id,
                item.get("title"),
                item.get("status"),
                item.get("generated_date"),
                item.get("heuristic"),
                _json_list(item.get("source_papers")),
                item.get("content"),
                item.get("novelty"),
                item.get("feasibility"),
                item.get("impact"),
                item.get("composite"),
            ),
        )
        evaluation = item.get("evaluation")
        if isinstance(evaluation, dict):
            cur.execute(
                """
                INSERT INTO library_idea_evaluations
                (library_id, idea_id, verdict, novelty_score, identification_score, data_score,
                 contribution_score, feasibility_score, overall_score, key_risk, next_steps,
                 death_reason, evaluation_text, evaluated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(library_id, idea_id) DO UPDATE SET
                    verdict = excluded.verdict,
                    novelty_score = excluded.novelty_score,
                    identification_score = excluded.identification_score,
                    data_score = excluded.data_score,
                    contribution_score = excluded.contribution_score,
                    feasibility_score = excluded.feasibility_score,
                    overall_score = excluded.overall_score,
                    key_risk = excluded.key_risk,
                    next_steps = excluded.next_steps,
                    death_reason = excluded.death_reason,
                    evaluation_text = excluded.evaluation_text,
                    evaluated_at = excluded.evaluated_at
                """,
                (
                    library_id,
                    idea_id,
                    evaluation.get("verdict"),
                    evaluation.get("novelty_score"),
                    evaluation.get("identification_score"),
                    evaluation.get("data_score"),
                    evaluation.get("contribution_score"),
                    evaluation.get("feasibility_score"),
                    evaluation.get("overall_score"),
                    evaluation.get("key_risk"),
                    evaluation.get("next_steps"),
                    evaluation.get("death_reason"),
                    evaluation.get("evaluation_text"),
                    evaluation.get("evaluated_at"),
                ),
            )
            restored_evaluations += 1

    for item in digests:
        if not isinstance(item, dict):
            continue
        date_value = str(item.get("date") or "").strip()
        if not date_value:
            continue
        cur.execute(
            """
            INSERT INTO library_digests (library_id, date, content, created_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(library_id, date) DO UPDATE SET
                content = excluded.content,
                created_at = excluded.created_at
            """,
            (library_id, date_value, str(item.get("content") or ""), item.get("created_at")),
        )

    cur.execute(
        """
        INSERT INTO import_batches
        (library_id, source_type, source_label, total_files, imported_files, skipped_files, failed_files)
        VALUES (?, 'bundle', 'Library ZIP import', ?, ?, 0, 0)
        """,
        (library_id, len(papers), len(papers)),
    )
    conn.commit()
    conn.close()

    return {
        "papers": len([item for item in papers if isinstance(item, dict)]),
        "sections": restored_sections,
        "field_maps": len([item for item in field_maps if isinstance(item, dict)]),
        "ideas": len([item for item in ideas if isinstance(item, dict)]),
        "idea_evaluations": restored_evaluations,
        "digests": len([item for item in digests if isinstance(item, dict)]),
    }


@app.post("/api/libraries/import")
async def import_library_bundle(file: UploadFile = File(...)):
    """Import a library ZIP created by /api/libraries/{id}/export."""
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty upload.")

    try:
        with zipfile.ZipFile(io.BytesIO(content)) as zf:
            manifest = _read_bundle_json(zf, "manifest.json", {})
            if not isinstance(manifest, dict):
                raise HTTPException(status_code=400, detail="Invalid manifest.json.")
            source_library = manifest.get("library") if isinstance(manifest.get("library"), dict) else {}
            source_name = str(source_library.get("name") or Path(file.filename or "Imported Library").stem)
            imported_name = f"{source_name} import"
            imported_description = str(source_library.get("description") or "")
            library = create_library(
                name=imported_name,
                discipline=str(source_library.get("discipline") or ""),
                description=imported_description,
            )
            library_id = int(library["id"])
            created_library = get_library(library_id)
            if created_library is None:
                raise HTTPException(status_code=500, detail="Imported library could not be created.")

            pdf_count = _extract_bundle_tree(
                zf,
                "files/papers",
                Path(str(created_library["papers_dir"])),
            )
            kb_count = _extract_bundle_tree(
                zf,
                "files/knowledge_base",
                Path(str(created_library["knowledge_base_dir"])),
            )
            payload = {
                "papers": _read_bundle_json(zf, "data/papers.json", []),
                "field_maps": _read_bundle_json(zf, "data/field_maps.json", []),
                "ideas": _read_bundle_json(zf, "data/ideas.json", []),
                "digests": _read_bundle_json(zf, "data/digests.json", []),
            }
            restored = _restore_library_payload(library_id, payload)
    except zipfile.BadZipFile as exc:
        raise HTTPException(status_code=400, detail="Upload must be a valid ZIP bundle.") from exc

    resolvers.clear_runtime_caches()
    return {
        "library": get_library(library_id),
        "restored": {
            **restored,
            "pdf_files": pdf_count,
            "knowledge_base_files": kb_count,
        },
    }


@app.get("/api/export/project/{slug}")
async def export_project(slug: str, include_notes: bool = Query(False)):
    """Export a project as a ZIP bundle (markdown + bibtex + csv)."""
    project = await resolvers.get_project(slug)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    paper_ids = project.get("paper_ids", [])
    if not paper_ids:
        raise HTTPException(status_code=400, detail="Project has no papers")

    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as zf:
        # 1. Project overview markdown
        overview = project.get("overview_content") or f"# {project['title']}\n\n{project.get('description', '')}"
        zf.writestr("README.md", overview)

        # 2. Paper summaries markdown
        db = await resolvers._get_db()
        placeholders = ",".join("?" for _ in paper_ids)
        cursor = await db.execute(
            f"SELECT paper_id, title, authors, year, average_score FROM papers WHERE paper_id IN ({placeholders})",
            paper_ids,
        )
        rows = await cursor.fetchall()

        sec_cursor = await db.execute(
            f"SELECT paper_id, section, content FROM card_sections WHERE paper_id IN ({placeholders})",
            paper_ids,
        )
        sec_rows = await sec_cursor.fetchall()
        sections_by_paper = {}
        for sr in sec_rows:
            sections_by_paper.setdefault(sr["paper_id"], {})[sr["section"]] = sr["content"]

        md_lines = [f"# Paper Summaries: {project['title']}\n"]
        bib_entries = []
        csv_output = io.StringIO()
        csv_writer = csv.writer(csv_output)
        csv_writer.writerow(["paper_id", "title", "authors", "year", "average_score", "source_url"])

        row_map = {r["paper_id"]: r for r in rows}
        for pid in paper_ids:
            row = row_map.get(pid)
            if not row:
                continue
            authors = _parse_authors_bibtex(row["authors"])
            author_str = ", ".join(authors) if authors else "Unknown"
            year_str = str(row["year"]) if row["year"] else "N/A"
            score_str = f'{row["average_score"]:.1f}/5' if row["average_score"] is not None else "N/A"

            md_lines.append(f'## {pid}: {row["title"] or "Untitled"}')
            md_lines.append(f"**Authors:** {author_str} | **Year:** {year_str} | **Score:** {score_str}\n")

            sections = sections_by_paper.get(pid, {})
            for section_key, section_label in [("Research Question", "Research Question"), ("Key Findings", "Key Findings"), ("Identification & Method", "Method"), ("Limitations & Open Questions", "Limitations")]:
                if section_key in sections:
                    md_lines.append(f"### {section_label}")
                    md_lines.append(sections[section_key].strip())
                    md_lines.append("")
            md_lines.append("---\n")

            bib_entries.append(_paper_to_bibtex(pid, row["title"], row["authors"], row["year"]))
            csv_writer.writerow([pid, row["title"] or "", "; ".join(authors), row["year"] or "", score_str, build_paper_url(pid)])

        zf.writestr("papers.md", "\n".join(md_lines))
        zf.writestr("references.bib", "\n\n".join(bib_entries))
        zf.writestr("papers.csv", csv_output.getvalue())

        # 3. Include user notes if requested
        if include_notes:
            notes_lines = ["# Research Notes\n"]
            for pid in paper_ids:
                note = await resolvers.get_note("paper", pid)
                if note and note.get("note"):
                    row = row_map.get(pid)
                    title = row["title"] if row else pid
                    notes_lines.append(f"## {pid}: {title}")
                    notes_lines.append(note["note"])
                    notes_lines.append("")
            if len(notes_lines) > 1:
                zf.writestr("notes.md", "\n".join(notes_lines))

    output.seek(0)
    filename = f"{slug}_export.zip"
    return StreamingResponse(
        output,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
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

class ProcessRequest(BaseModel):
    paper_id: str
    library_id: Optional[int] = None
    reading_profile: str = "auto"
    analysis_focuses: list[str] = []


class PaperReprocessRequest(BaseModel):
    library_id: Optional[int] = None
    reading_profile: str = ""
    analysis_focuses: list[str] = []


class BatchPaperReprocessRequest(BaseModel):
    paper_ids: list[str]
    reading_profile: str = ""
    analysis_focuses: list[str] = []


class PaperFeedbackRequest(BaseModel):
    library_id: Optional[int] = None
    dimension_key: str = ""
    feedback_type: str
    rating: Optional[int] = None
    comment: str = ""


class FeedbackActionStatusRequest(BaseModel):
    library_id: Optional[int] = None
    action_status: str


class PipelineRunRequest(BaseModel):
    agent: str = "full-cycle"
    batch_size: int = 10
    library_id: Optional[int] = None


class BuildRelationsRequest(BaseModel):
    library_id: Optional[int] = None
    force_rebuild: bool = True
    paper_ids: list[str] = []


def _parse_focuses_field(raw: str) -> list[str]:
    if not raw.strip():
        return []
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, list):
            return [str(item) for item in parsed]
    except json.JSONDecodeError:
        pass
    return []


@app.post("/api/pipeline/discover")
async def discover_papers(limit: int = 20):
    """Discover new papers from the configured remote source."""
    from pipeline import discover_new_papers

    try:
        papers = discover_new_papers(limit=limit)
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return {"new_papers": papers, "count": len(papers)}


@app.get("/api/pipeline/options")
async def pipeline_options_endpoint():
    from pipeline import get_pipeline_options

    return get_pipeline_options()


@app.post("/api/pipeline/process")
async def process_paper_endpoint(request: ProcessRequest):
    """Download and process a specific paper from the configured remote source."""
    from pipeline import process_paper

    if request.library_id is not None and not library_exists(request.library_id):
        raise HTTPException(status_code=404, detail="Library not found.")
    try:
        result = await process_paper(
            request.paper_id,
            library_id=request.library_id,
            reading_profile=request.reading_profile,
            analysis_focuses=request.analysis_focuses,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return result


@app.post("/api/pipeline/upload")
async def upload_paper(
    file: UploadFile = File(...),
    paper_id: str = Form(default=""),
    library_id: int = Form(default=1),
    reading_profile: str = Form(default="auto"),
    analysis_focuses: str = Form(default="[]"),
):
    """Upload a PDF for processing (max 50 MB)."""
    from pipeline import import_uploaded_file, MAX_UPLOAD_BYTES

    if not library_exists(library_id):
        raise HTTPException(status_code=404, detail="Library not found.")

    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large ({len(content)} bytes). "
                   f"Maximum is {MAX_UPLOAD_BYTES // (1024 * 1024)} MB.",
        )

    result = import_uploaded_file(
        content,
        library_id=library_id,
        paper_id=paper_id or None,
        filename=file.filename or "",
        reading_profile=reading_profile,
        analysis_focuses=_parse_focuses_field(analysis_focuses),
    )
    return result


@app.post("/api/pipeline/upload-batch")
async def upload_paper_batch(
    files: list[UploadFile] = File(...),
    library_id: int = Form(default=1),
    reading_profile: str = Form(default="auto"),
    analysis_focuses: str = Form(default="[]"),
):
    """Upload multiple PDFs or a selected folder worth of PDFs."""
    from pipeline import import_uploaded_batch

    if not library_exists(library_id):
        raise HTTPException(status_code=404, detail="Library not found.")

    payload: list[tuple[bytes, str]] = []
    for file in files:
        content = await file.read()
        payload.append((content, file.filename or "upload.pdf"))

    return import_uploaded_batch(
        payload,
        library_id=library_id,
        reading_profile=reading_profile,
        analysis_focuses=_parse_focuses_field(analysis_focuses),
    )


@app.post("/api/pipeline/run")
async def run_pipeline_endpoint(request: PipelineRunRequest):
    """Run the agent pipeline (scout, reader, linker, etc.)."""
    from pipeline import run_agent_pipeline

    runtime = None
    if request.library_id is not None:
        if not library_exists(request.library_id):
            raise HTTPException(status_code=404, detail="Library not found.")
        from pipeline import _resolve_library_runtime
        runtime = _resolve_library_runtime(request.library_id)

    result = run_agent_pipeline(
        agent=request.agent,
        batch_size=request.batch_size,
        runtime=runtime,
    )
    return result


@app.post("/api/pipeline/build-relations")
async def build_relations_endpoint(request: BuildRelationsRequest):
    from pipeline import build_paper_relations

    if request.library_id is not None and not library_exists(request.library_id):
        raise HTTPException(status_code=404, detail="Library not found.")
    return build_paper_relations(
        library_id=request.library_id,
        force_rebuild=request.force_rebuild,
        paper_ids=request.paper_ids,
    )


@app.post("/api/pipeline/refresh")
async def refresh_db_endpoint(library_id: Optional[int] = Query(default=None)):
    """Re-run ingestion to sync knowledge_base -> kb.db and recompute embeddings."""
    from pipeline import refresh_website_db

    if library_id is not None and not library_exists(library_id):
        raise HTTPException(status_code=404, detail="Library not found.")
    result = refresh_website_db(library_id=library_id)
    return result


@app.get("/api/pipeline/status")
async def pipeline_status(library_id: Optional[int] = Query(default=None)):
    """Get current pipeline status: pending papers, last run, etc."""
    from pipeline import get_pipeline_status

    if library_id is not None and not library_exists(library_id):
        raise HTTPException(status_code=404, detail="Library not found.")
    return get_pipeline_status(library_id=library_id)


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
# Debate results persistence
# ---------------------------------------------------------------------------

class SaveDebateRequest(BaseModel):
    idea_id: str
    verdict_json: str
    transcript_json: str
    focus_prompt: str = ""


@app.post("/api/debate/save")
async def save_debate_endpoint(body: SaveDebateRequest) -> dict:
    result_id = await resolvers.save_debate_result(
        body.idea_id, body.verdict_json, body.transcript_json, body.focus_prompt
    )
    return {"id": result_id, "status": "saved"}


@app.get("/api/debate/history/{idea_id}")
async def debate_history_endpoint(idea_id: str) -> dict:
    history = await resolvers.get_debate_history(idea_id)
    return {"idea_id": idea_id, "debates": history}


# ---------------------------------------------------------------------------
# Unified feasibility pre-flight check
# ---------------------------------------------------------------------------

class FeasibilityCheckRequest(BaseModel):
    title: str
    description: str
    research_question: str = ""
    proposed_method: str = ""


@app.post("/api/feasibility-check")
@limiter.limit("5/minute")
async def feasibility_check_endpoint(request: Request, body: FeasibilityCheckRequest) -> dict:
    """Run novelty + method + data checks in parallel, then synthesize."""
    import asyncio

    # Run all three checks in parallel
    novelty_task = resolvers.check_idea_novelty(body.title + " " + body.description)
    method_task = resolvers.suggest_methodology(body.description + " " + body.research_question)
    data_task = resolvers.check_data_availability(body.description + " " + body.research_question)

    novelty_result, method_result, data_result = await asyncio.gather(
        novelty_task, method_task, data_task,
        return_exceptions=True
    )

    # Handle exceptions
    if isinstance(novelty_result, Exception):
        novelty_result = {"similar_papers": [], "similar_ideas": [], "novelty_assessment": "Check failed"}
    if isinstance(method_result, Exception):
        method_result = []
    if isinstance(data_result, Exception):
        data_result = []

    return {
        "novelty": novelty_result,
        "methods": method_result[:5] if isinstance(method_result, list) else [],
        "data": data_result[:5] if isinstance(data_result, list) else [],
        "title": body.title,
    }


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
        from llm_runtime import LLMConfigurationError, LLMConnectionError, LLMStatusError

        try:
            async for chunk in run_debate(
                idea_title=body.idea_title,
                idea_text=body.idea_text,
                paper_ids=body.paper_ids,
                rounds=min(body.rounds, 3),
            ):
                yield f"data: {chunk}\n\n"
        except LLMConfigurationError as e:
            yield f'data: {json.dumps({"type": "error", "message": str(e)})}\n\n'
        except LLMConnectionError:
            yield f'data: {json.dumps({"type": "error", "message": "Could not reach the configured debate AI provider. Check the provider base URL, network connection, and API availability."})}\n\n'
        except LLMStatusError as e:
            yield f'data: {json.dumps({"type": "error", "message": f"The configured debate AI provider returned HTTP {e.status_code}. Check the API key, quota, and model name."})}\n\n'
        except ValueError as e:
            yield f'data: {json.dumps({"type": "error", "message": str(e)})}\n\n'
        except Exception:
            logger.exception("Debate failed")
            yield f'data: {json.dumps({"type": "error", "message": "Debate failed unexpectedly on the backend. Check the backend logs for details."})}\n\n'

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
# On-demand idea generation
# ---------------------------------------------------------------------------

class GenerateIdeasRequest(BaseModel):
    topic: str = ""
    paper_ids: list[str] = []
    method_focus: str = ""
    field_focus: str = ""
    num_ideas: int = 3


@app.post("/api/generate-ideas")
@limiter.limit("5/minute")
async def generate_ideas_endpoint(request: Request, body: GenerateIdeasRequest) -> StreamingResponse:
    """Generate research ideas on-demand via SSE streaming."""

    async def event_stream():
        try:
            # Build context from paper cards and knowledge base
            context_parts = []

            if body.paper_ids:
                for pid in body.paper_ids[:5]:  # Max 5 source papers
                    paper = await resolvers.get_paper(pid)
                    if paper:
                        sections = await resolvers.get_card_sections(pid)
                        sections_text = "\n".join(f"### {s['section']}\n{s['content']}" for s in sections)
                        context_parts.append(f"## Paper {pid}: {paper.get('title', pid)}\n{sections_text}")

            # Fetch landscape context
            gaps_map = await resolvers.get_field_map("frontier_gaps")
            methods_map = await resolvers.get_field_map("method_registry")
            gaps_context = (gaps_map or {}).get("content", "")[:5000]
            methods_context = (methods_map or {}).get("content", "")[:3000]

            system_prompt = (
                "You are a research idea generator for an empirical economics researcher. "
                "Generate novel, actionable research ideas based on the provided context. "
                "Each idea should include: Title, Research Question, Proposed Method, "
                "Data Needed, Why It Matters, and a Feasibility assessment (1-5). "
                "Focus on ideas that are specific enough to start working on immediately. "
                "Format each idea with ## IDEA-N: Title header."
            )

            user_message_parts = [f"Generate {body.num_ideas} research ideas."]
            if body.topic:
                user_message_parts.append(f"Topic focus: {body.topic}")
            if body.method_focus:
                user_message_parts.append(f"Method preference: {body.method_focus}")
            if body.field_focus:
                user_message_parts.append(f"Field focus: {body.field_focus}")
            if context_parts:
                user_message_parts.append("\n## Source Papers\n" + "\n\n".join(context_parts))
            if gaps_context:
                user_message_parts.append(f"\n## Known Frontier Gaps\n{gaps_context}")
            if methods_context:
                user_message_parts.append(f"\n## Available Methods\n{methods_context}")

            user_message = "\n\n".join(user_message_parts)

            from rag import _get_client, _get_model
            client = _get_client("rag")

            async with client.messages.stream(
                model=_get_model("rag"),
                max_tokens=4096,
                system=system_prompt,
                messages=[{"role": "user", "content": user_message}],
            ) as stream:
                async for text in stream.text_stream:
                    event = json.dumps({"type": "chunk", "text": text})
                    yield f"data: {event}\n\n"

            yield f'data: {json.dumps({"type": "done"})}\n\n'

        except Exception as e:
            logger.exception("Idea generation failed")
            yield f'data: {json.dumps({"type": "error", "message": str(e)})}\n\n'

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
    )


# ---------------------------------------------------------------------------
# Paper-specific Q&A
# ---------------------------------------------------------------------------

class PaperAskRequest(BaseModel):
    paper_id: str
    question: str
    style: str = "detailed"  # detailed | seminar | brief


@app.post("/api/ask/paper")
@limiter.limit("10/minute")
async def ask_paper_endpoint(request: Request, body: PaperAskRequest) -> StreamingResponse:
    """Ask a question about a specific paper with full card context."""

    async def event_stream():
        try:
            paper = await resolvers.get_paper(body.paper_id)
            if not paper:
                yield f'data: {json.dumps({"type": "error", "message": "Paper not found"})}\n\n'
                return

            sections = await resolvers.get_card_sections(body.paper_id)
            sections_text = "\n".join(f"### {s['section']}\n{s['content']}" for s in sections)

            style_instruction = {
                "detailed": "Give a thorough, detailed answer with specific references to the paper's content.",
                "seminar": "Answer as if presenting this paper in a research seminar — focus on contribution, identification, and limitations.",
                "brief": "Give a concise 2-3 sentence answer.",
            }.get(body.style, "Give a detailed answer.")

            system_prompt = (
                f"You are a research assistant answering questions about a specific economics paper. "
                f"Paper: {paper.get('title', body.paper_id)} ({paper.get('year', 'N/A')})\n"
                f"Authors: {', '.join(paper.get('authors', []))}\n\n"
                f"Full paper card:\n{sections_text}\n\n"
                f"Instructions: {style_instruction} "
                f"Cite specific findings with numbers when available."
            )

            from rag import _get_client, _get_model
            client = _get_client("rag")

            async with client.messages.stream(
                model=_get_model("rag"),
                max_tokens=2048,
                system=system_prompt,
                messages=[{"role": "user", "content": body.question}],
            ) as stream:
                async for text in stream.text_stream:
                    event = json.dumps({"type": "chunk", "text": text})
                    yield f"data: {event}\n\n"

            yield f'data: {json.dumps({"type": "done"})}\n\n'

        except Exception as e:
            logger.exception("Paper Q&A failed")
            yield f'data: {json.dumps({"type": "error", "message": str(e)})}\n\n'

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
    )
