"""
Agent 1: Scout — Triage & Prioritize papers.
Reads first/last pages, decides DEEP_READ / SKIM / SKIP.
"""

import json
import logging
from datetime import datetime, timezone

from agents.config import (
    MAX_TOKENS_SCOUT, PROMPTS_DIR, TRIAGE_JSONL,
    SCOUT_FIRST_PAGES, SCOUT_LAST_PAGES, get_client, get_model,
)
from agents.pdf_utils import extract_pages
from agents.db_utils import get_pending_papers, update_paper_triage, update_paper_status

logger = logging.getLogger("scout")

_FOCUS_LABELS = {
    "title_abstract": "title and abstract framing",
    "research_question": "research question",
    "methods_data": "methods and data",
    "findings": "main findings",
    "writing_style": "writing style",
    "argument_logic": "argument logic",
}


def _load_json_dict(raw) -> dict[str, str]:
    try:
        parsed = json.loads(raw) if isinstance(raw, str) else raw
    except json.JSONDecodeError:
        return {}
    if not isinstance(parsed, dict):
        return {}
    return {
        str(key).strip().lower(): str(value).strip()
        for key, value in parsed.items()
        if str(key).strip() and str(value).strip()
    }


def _load_json_list(raw) -> list[str]:
    try:
        parsed = json.loads(raw) if isinstance(raw, str) else raw
    except json.JSONDecodeError:
        return []
    if not isinstance(parsed, list):
        return []
    return [str(item).strip().lower() for item in parsed if str(item).strip()]


def load_prompt() -> str:
    return (PROMPTS_DIR / "scout.txt").read_text()


def build_prompt(system_prompt: str, paper: dict) -> str:
    reading_profile = (paper.get("reading_profile") or "auto").strip().lower()
    extra_lines: list[str] = []

    if reading_profile == "title_abstract":
        extra_lines.append(
            "This paper is configured for title-and-abstract level reading only. "
            "Keep the triage grounded in lightweight summary signals and avoid pretending to have deep-read the paper."
        )
    elif reading_profile == "full_content":
        extra_lines.append(
            "This paper is marked for full-content reading. Treat scout as an intake step before a deeper read."
        )
    elif reading_profile == "style_logic":
        extra_lines.append(
            "This paper is marked for deeper reading with extra attention to writing style and argument logic."
        )
    elif reading_profile == "custom":
        extra_lines.append(
            "This paper uses a custom reading mode. Follow the user-provided instructions and dimensions below."
        )

    custom_instructions = str(paper.get("custom_reading_instructions") or "").strip()
    if custom_instructions:
        extra_lines.append("Custom reading instructions: " + custom_instructions)

    focuses = _load_json_list(paper.get("analysis_focuses") or "[]")
    prompt_map = _load_json_dict(paper.get("analysis_focus_prompts") or "{}")
    labels = [prompt_map.get(key) or _FOCUS_LABELS.get(key) or key for key in focuses]
    if labels:
        extra_lines.append(
            "Prioritize these analysis dimensions in the scout summary when visible: "
            + "; ".join(labels)
            + "."
        )

    if not extra_lines:
        return system_prompt
    return system_prompt + "\n\nAdditional run instructions:\n- " + "\n- ".join(extra_lines)


def triage_one(client, model: str, paper: dict, system_prompt: str):
    """Triage a single paper. Returns parsed JSON or None on failure."""
    paper_id = paper["paper_id"]
    pdf_path = paper["file_path"]

    try:
        text = extract_pages(pdf_path, first_n=SCOUT_FIRST_PAGES, last_n=SCOUT_LAST_PAGES)
    except Exception as e:
        logger.error(f"[{paper_id}] PDF extraction failed: {e}")
        update_paper_status(paper_id, "pdf_error")
        return None

    if len(text.strip()) < 100:
        logger.warning(f"[{paper_id}] Extracted text too short, marking pdf_error")
        update_paper_status(paper_id, "pdf_error")
        return None

    try:
        response = client.messages.create(
            model=model,
            max_tokens=MAX_TOKENS_SCOUT,
            system=build_prompt(system_prompt, paper),
            messages=[{"role": "user", "content": f"Paper ID: {paper_id}\n\n{text}"}],
        )
        raw = response.content[0].text.strip()

        # Parse JSON — handle markdown code blocks
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1].rsplit("```", 1)[0]
        result = json.loads(raw)

    except json.JSONDecodeError as e:
        logger.error(f"[{paper_id}] JSON parse error: {e}\nRaw: {raw[:200]}")
        update_paper_status(paper_id, "error")
        return None
    except Exception as e:
        logger.error(f"[{paper_id}] API error: {e}")
        update_paper_status(paper_id, "error")
        return None

    # Validate required fields
    for key in ["title", "fields", "methods", "relevance", "decision", "summary"]:
        if key not in result:
            logger.error(f"[{paper_id}] Missing key '{key}' in response")
            update_paper_status(paper_id, "error")
            return None

    # Normalize
    result["paper_id"] = paper_id
    result["year"] = paper.get("year")
    try:
        result["relevance"] = int(float(result["relevance"]))
    except (ValueError, TypeError):
        result["relevance"] = 3  # default mid-range if unparseable
    result["decision"] = result["decision"].upper()
    if result["decision"] not in ("DEEP_READ", "SKIM", "SKIP"):
        result["decision"] = "SKIM"
    result["triaged_at"] = datetime.now(timezone.utc).isoformat()

    return result


def save_triage(result: dict):
    """Save triage result to JSONL and update DB."""
    # Append to JSONL
    with open(TRIAGE_JSONL, "a") as f:
        f.write(json.dumps(result, ensure_ascii=False) + "\n")

    # Update DB
    update_paper_triage(
        paper_id=result["paper_id"],
        decision=result["decision"],
        relevance=result["relevance"],
        field_tags=json.dumps(result["fields"]),
        summary=result["summary"],
    )


def run(batch_size: int = 50) -> dict:
    """Run Scout on a batch of pending papers. Returns summary stats."""
    client = get_client("scout")
    model = get_model("scout")
    system_prompt = load_prompt()
    papers = get_pending_papers(limit=batch_size)

    if not papers:
        logger.info("No pending papers to triage.")
        return {"processed": 0}

    logger.info(f"Scout: triaging {len(papers)} papers...")

    stats = {"processed": 0, "DEEP_READ": 0, "SKIM": 0, "SKIP": 0, "errors": 0}

    for i, paper in enumerate(papers):
        result = triage_one(client, model, paper, system_prompt)
        if result:
            save_triage(result)
            stats[result["decision"]] += 1
            stats["processed"] += 1
            logger.info(
                f"[{result['paper_id']}] {result['decision']} "
                f"(relevance={result['relevance']}) — {result['title'][:60]}"
            )
        else:
            stats["errors"] += 1

        # Rate limiting: 1s between calls, 5s pause every 10 papers
        if i < len(papers) - 1:
            import time
            time.sleep(1)
            if (i + 1) % 10 == 0:
                time.sleep(4)  # extra 4s every 10 papers

    logger.info(f"Scout done: {stats}")
    return stats


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(message)s")
    from agents.config import ensure_dirs, SCOUT_BATCH_SIZE
    ensure_dirs()
    from agents.db_utils import ensure_columns
    ensure_columns()
    run(SCOUT_BATCH_SIZE)
