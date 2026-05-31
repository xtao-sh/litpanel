"""
Agent 3: Linker — Cross-paper synthesis. Updates field maps.
"""

import logging
import time
from datetime import date
from pathlib import Path

from agents.config import (
    MAX_TOKENS_LINKER, PROMPTS_DIR, CARDS_DIR, MAPS_DIR, get_client, get_model,
)
from agents.db_utils import (
    get_unlinked_papers, mark_linker_batch, get_next_linker_batch_number,
    count_new_cards_since_last_linker,
)

logger = logging.getLogger("linker")

MAP_FILES = {
    "RESEARCH_LANDSCAPE": MAPS_DIR / "research_landscape.md",
    "METHOD_REGISTRY": MAPS_DIR / "method_registry.md",
    "DEBATE_MAP": MAPS_DIR / "debate_map.md",
    "FRONTIER_GAPS": MAPS_DIR / "frontier_gaps.md",
}


def load_prompt() -> str:
    return (PROMPTS_DIR / "linker.txt").read_text()


def read_current_maps() -> dict[str, str]:
    """Read current state of all map files. Returns dict of name -> content."""
    result = {}
    for name, path in MAP_FILES.items():
        if path.exists():
            result[name] = path.read_text().strip()
        else:
            result[name] = ""
    return result


def format_maps_for_context(maps: dict[str, str]) -> str:
    """Format current maps for inclusion in the LLM prompt."""
    parts = []
    for name, content in maps.items():
        display = content if content else "(empty — first run)"
        parts.append(f"=== Current {name} ===\n{display}")
    return "\n\n".join(parts)


def summarize_card(text: str, max_chars: int = 2000) -> str:
    """Truncate a card to key sections to fit context limits."""
    if len(text) <= max_chars:
        return text
    # Keep header + Research Question + Identification + Key Findings + Scores
    lines = text.split("\n")
    keep = []
    in_section = False
    important_sections = {"# w", "## Meta", "## Research Question", "## Identification",
                          "## Key Findings", "## China Applicability", "## Scores"}
    skip_sections = {"## What Makes", "## Limitations"}
    for line in lines:
        if any(line.startswith(s) for s in important_sections):
            in_section = True
        elif line.startswith("## ") and any(line.startswith(s) for s in skip_sections):
            in_section = False
        elif line.startswith("## ") and not any(line.startswith(s) for s in important_sections):
            in_section = False
        if in_section:
            keep.append(line)
    result = "\n".join(keep)
    return result[:max_chars]


def read_card_files(paper_ids: list[str]) -> str:
    """Read card files for given paper IDs, summarized to fit context."""
    parts = []
    for pid in paper_ids:
        card_path = CARDS_DIR / f"{pid}.md"
        if card_path.exists():
            parts.append(summarize_card(card_path.read_text().strip()))
    return "\n\n---\n\n".join(parts)


def parse_maps(response_text: str) -> dict[str, str]:
    """Parse the four map documents from the response."""
    maps = {}
    markers = ["===RESEARCH_LANDSCAPE===", "===METHOD_REGISTRY===",
               "===DEBATE_MAP===", "===FRONTIER_GAPS==="]

    for i, marker in enumerate(markers):
        key = marker.strip("=")
        start = response_text.find(marker)
        if start == -1:
            continue
        start += len(marker)
        # Find end (next marker or end of text)
        end = len(response_text)
        for next_marker in markers[i + 1:]:
            next_pos = response_text.find(next_marker, start)
            if next_pos != -1:
                end = next_pos
                break
        maps[key] = response_text[start:end].strip()

    return maps


import re as _re

# Patterns that indicate the LLM skipped reproducing existing content
_STUB_PATTERN = _re.compile(
    r"^\s*\[.*(?:existing|previous|prior|above|earlier).*(?:content|sections?|entries?).*(?:preserved|unchanged|retained|remains?|kept|omitted|same).*\]\s*$",
    _re.IGNORECASE | _re.MULTILINE,
)


def _extract_section_headers(content: str) -> str:
    """Extract markdown section headers from content for context summary."""
    headers = []
    for line in content.split("\n"):
        stripped = line.strip()
        if stripped.startswith("#"):
            headers.append(stripped)
    return "\n".join(headers) if headers else "(no sections found)"


def merge_map_content(existing: str, new_additions: str) -> str:
    """Merge new additions into existing map content.

    If the LLM returned full content (no stubs), use it directly.
    If the LLM used stubs like '[existing content preserved]', strip
    those stubs and append only the genuinely new lines to the existing content.
    """
    if not new_additions.strip():
        return existing

    # Check if the new output contains preservation stubs
    has_stubs = bool(_STUB_PATTERN.search(new_additions))

    if not has_stubs:
        new_stripped = new_additions.strip()
        existing_stripped = existing.strip()
        # Guard against catastrophic shrinkage: the model dropped prior sections
        # without a preservation stub, returning a short-but-nonempty document.
        # Replacing the accumulated map with it would destroy content, so keep
        # the existing content and append the new under it instead.
        if existing_stripped and len(new_stripped) < 0.5 * len(existing_stripped):
            logger.warning(
                "Linker map update suspiciously short (%d chars vs existing %d) "
                "with no preservation stub — keeping existing content and "
                "appending new content instead of replacing.",
                len(new_stripped), len(existing_stripped),
            )
            return existing_stripped + "\n\n" + new_stripped
        # LLM produced full content without stubs — use it as-is
        return new_additions

    # Strip stub lines and keep only genuinely new content
    cleaned_lines = []
    for line in new_additions.split("\n"):
        if _STUB_PATTERN.match(line):
            continue
        cleaned_lines.append(line)
    cleaned = "\n".join(cleaned_lines).strip()

    if not cleaned:
        return existing

    # Append new content to existing
    if existing:
        return existing.rstrip() + "\n\n" + cleaned
    return cleaned


def run() -> dict:
    """Run Linker: update each map document separately."""
    unlinked_count = count_new_cards_since_last_linker()
    if unlinked_count == 0:
        logger.info("No new cards to link.")
        return {"processed": 0}

    logger.info(f"Linker: synthesizing {unlinked_count} new papers...")

    client = get_client("linker")
    model = get_model("linker")
    system_prompt = load_prompt()

    # Get unlinked papers
    papers = get_unlinked_papers()
    paper_ids = [p["paper_id"] for p in papers]

    # Build cards context (shared across all map updates)
    cards_context = read_card_files(paper_ids)

    # Truncate cards context if too long
    if len(cards_context) > 80000:
        cards_context = cards_context[:80000] + "\n\n[TRUNCATED — more papers available in next batch]"

    results = {}
    maps_to_update = [
        ("research_landscape", "Research Landscape", MAPS_DIR / "research_landscape.md"),
        ("method_registry", "Method Registry", MAPS_DIR / "method_registry.md"),
        ("debate_map", "Debate Map", MAPS_DIR / "debate_map.md"),
        ("frontier_gaps", "Frontier Gaps", MAPS_DIR / "frontier_gaps.md"),
    ]

    for map_slug, map_title, map_path in maps_to_update:
        try:
            existing_content = map_path.read_text().strip() if map_path.exists() else ""
            was_truncated = len(existing_content) > 15000

            if was_truncated:
                # Content too large for full rewrite — use append-only mode
                user_message = (
                    f"Today: {date.today().isoformat()}\n\n"
                    f"## Document to Update: {map_title}\n\n"
                    f"The existing document is large ({len(existing_content)} chars). "
                    f"I will show you a summary of existing sections, then the new paper cards.\n\n"
                    f"### Existing Section Headers:\n{_extract_section_headers(existing_content)}\n\n"
                    f"### New Paper Cards:\n{cards_context}\n\n"
                    f"Output ONLY the new content to ADD to this document. "
                    f"Do NOT reproduce existing content. "
                    f"Format new entries to fit under the existing section headers above, "
                    f"or create new sections if needed."
                )
            else:
                user_message = (
                    f"Today: {date.today().isoformat()}\n\n"
                    f"## Document to Update: {map_title}\n\n"
                    f"### Current Content:\n{existing_content}\n\n"
                    f"### New Paper Cards:\n{cards_context}\n\n"
                    f"Produce the COMPLETE updated {map_title} document. "
                    f"Integrate new findings from the paper cards above into the existing content. "
                    f"Do NOT use placeholders like '[existing content preserved]'. "
                    f"Output the full document."
                )

            response = client.messages.create(
                model=model,
                max_tokens=MAX_TOKENS_LINKER,
                system=system_prompt,
                messages=[{"role": "user", "content": user_message}],
            )
            raw = response.content[0].text.strip()

            if was_truncated:
                # Append-only mode: always add to existing, never replace
                cleaned = _STUB_PATTERN.sub("", raw).strip()
                if cleaned:
                    merged = existing_content.rstrip() + "\n\n" + cleaned
                else:
                    merged = existing_content
            else:
                # Small enough for full rewrite — use merge logic
                merged = merge_map_content(existing_content, raw)
            map_path.write_text(merged)

            results[map_slug] = "updated"
            logger.info(f"Updated {map_title} ({len(merged)} chars)")

            time.sleep(3)  # Rate limit between calls

        except Exception as e:
            logger.error(f"Failed to update {map_title}: {e}")
            results[map_slug] = f"error: {e}"

    # Mark papers as linked only if at least one map update succeeded
    successful_updates = [k for k, v in results.items() if v == "updated"]
    if successful_updates:
        batch_num = get_next_linker_batch_number()
        mark_linker_batch(paper_ids, batch_num)
    else:
        batch_num = None
        logger.warning("No map updates succeeded — papers NOT marked as linked")

    result = {"processed": len(paper_ids), "maps": results, "batch": batch_num}
    logger.info(f"Linker done: {result}")

    # Rate limiting: 5s pause after Linker to avoid API hammering
    time.sleep(5)

    return result


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(message)s")
    from agents.config import ensure_dirs
    ensure_dirs()
    from agents.db_utils import ensure_columns
    ensure_columns()
    run()
