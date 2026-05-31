#!/usr/bin/env python3
"""
Orchestrator — Main entry point for the NBER agent system.

Decides which agent(s) to run based on current system state.
Runs multiple batches per cycle to avoid cold-start deadlock.

Usage:
    python3 -m agents.orchestrator                     # auto mode: run what's needed
    python3 -m agents.orchestrator --agent scanner     # run specific agent
    python3 -m agents.orchestrator --agent reader
    python3 -m agents.orchestrator --agent linker
    python3 -m agents.orchestrator --agent thinker
    python3 -m agents.orchestrator --agent critic
    python3 -m agents.orchestrator --agent full-cycle  # scanner → reader → linker → thinker → critic
    python3 -m agents.orchestrator --loops 5           # run auto mode 5 times
"""

import argparse
import logging
import sys
import time
from datetime import datetime
from pathlib import Path

# Ensure project root is on path
sys.path.insert(0, str(Path(__file__).parent.parent))

from agents.config import (
    ensure_dirs, LINKER_TRIGGER_THRESHOLD,
    READER_BATCH_SIZE, JOURNAL_DIR, MAPS_DIR, IDEAS_DIR,
)
from agents.db_utils import (
    ensure_columns, get_stats, count_new_cards_since_last_linker,
    get_triaged_for_reading, reset_errors_for_retry,
)

logger = logging.getLogger("orchestrator")


def log_cycle(actions: list[dict]):
    """Append a cycle summary to the learning log."""
    log_path = JOURNAL_DIR / "learning_log.md"
    now = datetime.now().strftime("%Y-%m-%d %H:%M")

    entry = f"\n## Cycle: {now}\n\n"
    for action in actions:
        agent = action.get("agent", "unknown")
        result = action.get("result", {})
        entry += f"- **{agent}**: {result}\n"
    entry += "\n---\n"

    if log_path.exists():
        existing = log_path.read_text()
    else:
        existing = "# Learning Log\n\n*Automated log of each orchestrator cycle.*\n"

    log_path.write_text(existing + entry)


def has_maps_content() -> bool:
    """Check if Linker has produced meaningful content."""
    landscape = MAPS_DIR / "research_landscape.md"
    if not landscape.exists():
        return False
    return len(landscape.read_text().strip()) > 100


def has_new_ideas() -> bool:
    """Check if there are new (unevaluated) ideas."""
    idea_bank = IDEAS_DIR / "idea_bank.md"
    if not idea_bank.exists():
        return False
    return "**Status:** new" in idea_bank.read_text()


def run_auto():
    """Auto mode: run a complete cycle with live state checks between steps."""
    actions = []
    log_entry = {}

    # Reset API-error papers for retry (not pdf_error — those are permanent)
    reset_errors_for_retry()

    stats = get_stats()
    logger.info("=" * 60)
    logger.info("ORCHESTRATOR — Auto mode")
    logger.info(f"Current stats: {stats}")
    logger.info("=" * 60)

    # Step 0: Ensure researcher profile exists
    from agents.profile import load_profile
    load_profile()

    # Step 0.5: Scanner — fetch fresh arXiv papers
    logger.info("→ Running Scanner (arXiv search)")
    from agents.scanner import run as run_scanner
    try:
        result = run_scanner()
        log_entry["scanner"] = result
    except Exception as e:
        logger.error(f"Scanner failed: {e}")
        log_entry["scanner"] = {"error": str(e)}
        result = {"error": str(e)}
    actions.append({"agent": "scanner", "result": result})

    # Step 1: Reader — read papers directly, without relevance triage.
    readable_papers = get_triaged_for_reading(limit=READER_BATCH_SIZE)
    if readable_papers:
        logger.info(f"→ Running Reader ({len(readable_papers)} papers)")
        from agents.reader import run as run_reader
        try:
            result = run_reader(READER_BATCH_SIZE)
            log_entry["reader"] = result
        except Exception as e:
            logger.error(f"Reader failed: {e}")
            log_entry["reader"] = {"error": str(e)}
            result = {"error": str(e)}
        actions.append({"agent": "reader", "result": result})
    else:
        logger.info("→ No papers ready for Reader")

    # Step 2: Linker — re-check card count AFTER Reader
    new_cards = count_new_cards_since_last_linker()
    if new_cards >= LINKER_TRIGGER_THRESHOLD:
        logger.info(f"→ Running Linker ({new_cards} new cards)")
        from agents.linker import run as run_linker
        try:
            result = run_linker()
            log_entry["linker"] = result
        except Exception as e:
            logger.error(f"Linker failed: {e}")
            log_entry["linker"] = {"error": str(e)}
            result = {"error": str(e)}
        actions.append({"agent": "linker", "result": result})
    else:
        logger.info(f"→ Linker waiting ({new_cards}/{LINKER_TRIGGER_THRESHOLD} new cards)")

    # Step 3: Thinker — re-check AFTER Linker
    if has_maps_content():
        logger.info("→ Running Thinker")
        from agents.thinker import run as run_thinker
        try:
            result = run_thinker()
            log_entry["thinker"] = result
        except Exception as e:
            logger.error(f"Thinker failed: {e}")
            log_entry["thinker"] = {"error": str(e)}
            result = {"error": str(e)}
        actions.append({"agent": "thinker", "result": result})
    else:
        logger.info("→ Thinker waiting for Linker to produce maps")

    # Step 4: Critic — re-check AFTER Thinker
    if has_new_ideas():
        logger.info("→ Running Critic")
        from agents.critic import run as run_critic
        try:
            result = run_critic()
            log_entry["critic"] = result
        except Exception as e:
            logger.error(f"Critic failed: {e}")
            log_entry["critic"] = {"error": str(e)}
            result = {"error": str(e)}
        actions.append({"agent": "critic", "result": result})
    else:
        logger.info("→ No new ideas for Critic")

    # Log
    log_cycle(actions)

    logger.info("=" * 60)
    logger.info("ORCHESTRATOR — Cycle complete")
    for a in actions:
        logger.info(f"  {a['agent']}: {a['result']}")
    logger.info("=" * 60)

    return actions


def run_single(agent_name: str):
    """Run a single named agent."""
    actions = []
    log_entry = {}

    # Reset API-error papers for retry (not pdf_error — those are permanent)
    reset_errors_for_retry()

    if agent_name == "scanner":
        from agents.scanner import run as run_scanner
        try:
            result = run_scanner()
            log_entry["scanner"] = result
        except Exception as e:
            logger.error(f"Scanner failed: {e}")
            log_entry["scanner"] = {"error": str(e)}
            result = {"error": str(e)}
        actions.append({"agent": "scanner", "result": result})

    elif agent_name == "reader":
        from agents.reader import run as run_reader
        try:
            result = run_reader(READER_BATCH_SIZE)
            log_entry["reader"] = result
        except Exception as e:
            logger.error(f"Reader failed: {e}")
            log_entry["reader"] = {"error": str(e)}
            result = {"error": str(e)}
        actions.append({"agent": "reader", "result": result})

    elif agent_name == "linker":
        from agents.linker import run as run_linker
        try:
            result = run_linker()
            log_entry["linker"] = result
        except Exception as e:
            logger.error(f"Linker failed: {e}")
            log_entry["linker"] = {"error": str(e)}
            result = {"error": str(e)}
        actions.append({"agent": "linker", "result": result})

    elif agent_name == "thinker":
        from agents.thinker import run as run_thinker
        try:
            result = run_thinker()
            log_entry["thinker"] = result
        except Exception as e:
            logger.error(f"Thinker failed: {e}")
            log_entry["thinker"] = {"error": str(e)}
            result = {"error": str(e)}
        actions.append({"agent": "thinker", "result": result})

    elif agent_name == "critic":
        from agents.critic import run as run_critic
        try:
            result = run_critic()
            log_entry["critic"] = result
        except Exception as e:
            logger.error(f"Critic failed: {e}")
            log_entry["critic"] = {"error": str(e)}
            result = {"error": str(e)}
        actions.append({"agent": "critic", "result": result})

    elif agent_name == "full-cycle":
        from agents.scanner import run as run_scanner
        from agents.reader import run as run_reader
        from agents.linker import run as run_linker
        from agents.thinker import run as run_thinker
        from agents.critic import run as run_critic
        from agents.profile import load_profile

        load_profile()

        for name, fn, kwargs in [
            ("scanner", run_scanner, {}),
            ("reader", run_reader, {"batch_size": READER_BATCH_SIZE}),
            ("linker", run_linker, {}),
            ("thinker", run_thinker, {}),
            ("critic", run_critic, {}),
        ]:
            logger.info(f"→ Running {name}...")
            try:
                result = fn(**kwargs)
                log_entry[name] = result
            except Exception as e:
                logger.error(f"{name} failed: {e}")
                log_entry[name] = {"error": str(e)}
                result = {"error": str(e)}
            actions.append({"agent": name, "result": result})
            logger.info(f"  {name}: {result}")

    else:
        logger.error(f"Unknown agent: {agent_name}")
        logger.info("Valid agents: scanner, reader, linker, thinker, critic, full-cycle")
        return

    log_cycle(actions)


def main():
    parser = argparse.ArgumentParser(description="NBER Agent System Orchestrator")
    parser.add_argument("--agent", type=str, default=None,
                        help="Run specific agent: scanner|reader|linker|thinker|critic|full-cycle")
    parser.add_argument("--batch-size", type=int, default=None,
                        help="Override Reader batch size")
    parser.add_argument("--loops", type=int, default=1,
                        help="Number of auto-mode cycles to run (default: 1). "
                             "Use higher values to process more papers in one session.")
    parser.add_argument("--linker-threshold", type=int, default=None,
                        help="Override Linker trigger threshold (default: 20)")
    args = parser.parse_args()

    # Override config if provided — rebind module-level names so run_auto/run_single see them
    global READER_BATCH_SIZE, LINKER_TRIGGER_THRESHOLD
    if args.batch_size:
        READER_BATCH_SIZE = args.batch_size
    if args.linker_threshold:
        LINKER_TRIGGER_THRESHOLD = args.linker_threshold

    # Setup
    ensure_dirs()
    ensure_columns()

    if args.agent:
        run_single(args.agent)
    else:
        for i in range(args.loops):
            if args.loops > 1:
                logger.info(f"\n{'#' * 60}")
                logger.info(f"# LOOP {i + 1}/{args.loops}")
                logger.info(f"{'#' * 60}\n")
            run_auto()
            # Brief pause between loops to avoid hammering the API
            if i < args.loops - 1:
                logger.info("Pausing 10s between loops...")
                time.sleep(10)


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(name)s] %(levelname)s %(message)s",
        handlers=[
            logging.StreamHandler(),
            logging.FileHandler(Path(__file__).parent.parent / "agent_run.log"),
        ],
    )
    main()
