"""
Agent 5: Critic — Stress-test ideas, promote or kill them.
"""

import logging
import re
from datetime import date

from agents.config import (
    MAX_TOKENS_CRITIC, PROMPTS_DIR, IDEAS_DIR, MAPS_DIR, CARDS_DIR, get_client, get_model,
)

logger = logging.getLogger("critic")


def load_prompt() -> str:
    return (PROMPTS_DIR / "critic.txt").read_text()


def read_file_safe(path) -> str:
    if path.exists():
        return path.read_text().strip()
    return "(empty)"


def extract_new_ideas(idea_bank_text: str) -> str:
    """Extract ideas with status 'new' from the idea bank."""
    # Find all idea blocks with status: new
    blocks = []
    current_block = []
    in_idea = False

    for line in idea_bank_text.split("\n"):
        if line.startswith("## IDEA-"):
            if current_block and in_idea:
                blocks.append("\n".join(current_block))
            current_block = [line]
            in_idea = False
        elif current_block:
            current_block.append(line)
            if "**Status:** new" in line:
                in_idea = True

    if current_block and in_idea:
        blocks.append("\n".join(current_block))

    return "\n\n---\n\n".join(blocks) if blocks else ""


def update_idea_statuses(idea_bank_text: str, evaluations: str) -> str:
    """Update idea statuses in the bank based on Critic evaluations.

    Targets each idea by its ID so the correct status line is updated,
    rather than blindly replacing the first occurrence of '**Status:** new'.
    """
    verdict_map = {
        "KILL": "killed",
        "PROMOTE": "promoted",
        "DEVELOP": "developing",
    }

    for match in re.finditer(
        r"### (IDEA-[\d-]+) Evaluation\s*\n.*?\*\*Verdict:\*\*\s*(\w+)",
        evaluations, re.DOTALL
    ):
        idea_id = match.group(1)
        verdict = match.group(2).upper()
        new_status = verdict_map.get(verdict)
        if not new_status:
            continue

        # Find this idea's header (## IDEA-...) and replace the status
        # line within that idea's block only.
        pattern = re.compile(
            r"(## " + re.escape(idea_id) + r"\b.*?)"          # idea header + content up to status
            r"(\*\*Status:\*\*\s*)new",                         # the status line
            re.DOTALL,
        )
        idea_bank_text = pattern.sub(
            r"\g<1>\g<2>" + new_status,
            idea_bank_text,
            count=1,
        )

    return idea_bank_text


def run() -> dict:
    """Run Critic on new ideas. Returns summary stats."""
    idea_bank_path = IDEAS_DIR / "idea_bank.md"
    idea_bank_text = read_file_safe(idea_bank_path)

    new_ideas = extract_new_ideas(idea_bank_text)
    if not new_ideas:
        logger.info("No new ideas to evaluate.")
        return {"evaluated": 0}

    ideas_count = len(re.findall(r"## IDEA-", new_ideas))
    logger.info(f"Critic: evaluating {ideas_count} new ideas...")

    client = get_client("critic")
    model = get_model("critic")
    system_prompt = load_prompt()

    # Context
    landscape = read_file_safe(MAPS_DIR / "research_landscape.md")
    frontier = read_file_safe(MAPS_DIR / "frontier_gaps.md")

    user_message = (
        f"Today: {date.today().isoformat()}\n\n"
        f"## New Ideas to Evaluate\n\n{new_ideas}\n\n"
        f"## Research Landscape (for context)\n\n{landscape[:20000]}\n\n"
        f"## Frontier Gaps (for context)\n\n{frontier[:10000]}"
    )

    try:
        response = client.messages.create(
            model=model,
            max_tokens=MAX_TOKENS_CRITIC,
            system=system_prompt,
            messages=[{"role": "user", "content": user_message}],
        )
        raw = response.content[0].text.strip()
    except Exception as e:
        logger.error(f"Critic API error: {e}")
        return {"evaluated": 0, "error": str(e)}

    # Count verdicts
    promoted = len(re.findall(r"\*\*Verdict:\*\*\s*PROMOTE", raw))
    developing = len(re.findall(r"\*\*Verdict:\*\*\s*DEVELOP", raw))
    killed = len(re.findall(r"\*\*Verdict:\*\*\s*KILL", raw))

    # Extract and save top_10 if present
    top10_match = re.search(r"# Top 10 Research Ideas.*", raw, re.DOTALL)
    if top10_match:
        top10_path = IDEAS_DIR / "top_10.md"
        top10_path.write_text(top10_match.group(0).strip())
        logger.info("Updated top_10.md")

    # Save killed ideas to graveyard
    graveyard_path = IDEAS_DIR / "graveyard.md"
    if killed > 0:
        graveyard_entries = []
        for match in re.finditer(
            r"### (IDEA-[\d-]+) Evaluation.*?\*\*Verdict:\*\*\s*KILL.*?(?=###|\Z)",
            raw, re.DOTALL
        ):
            graveyard_entries.append(match.group(0).strip())

        if graveyard_entries:
            existing_graveyard = read_file_safe(graveyard_path)
            if existing_graveyard == "(empty)":
                existing_graveyard = "# Idea Graveyard\n\n*Ideas killed by the Critic, with reasons.*\n\n---\n"
            graveyard_path.write_text(
                existing_graveyard.rstrip() + "\n\n" + "\n\n---\n\n".join(graveyard_entries) + "\n"
            )

    # Save full evaluation output
    eval_path = IDEAS_DIR / "latest_evaluation.md"
    eval_path.write_text(raw)

    # Update idea statuses in the bank based on evaluations
    updated_bank = update_idea_statuses(idea_bank_text, raw)
    if updated_bank != idea_bank_text:
        idea_bank_path.write_text(updated_bank)
        logger.info("Updated idea statuses in idea_bank.md")

    result = {"evaluated": ideas_count, "promoted": promoted, "developing": developing, "killed": killed}
    logger.info(f"Critic done: {result}")
    
    # Rate limiting: 5s pause after Critic to avoid API hammering
    import time
    time.sleep(5)
    
    return result


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(message)s")
    from agents.config import ensure_dirs
    ensure_dirs()
    run()
