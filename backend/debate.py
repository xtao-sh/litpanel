"""
Multi-agent research idea debate system.

Agents:
- Advocate: argues FOR the idea
- Skeptic: challenges the idea
- Methodologist: evaluates research design
- Moderator: synthesizes and produces verdict
"""

from __future__ import annotations

import json
import logging
import re
from typing import AsyncGenerator

from llm_runtime import LLMConfigurationError, LLMConnectionError, LLMStatusError
from rag import _fetch_full_content, _get_client, _get_model, _truncate
import resolvers

logger = logging.getLogger("debate")

AGENT_ROLES = {
    "advocate": {
        "label": "Dr. Chen (Advocate)",
        "system": (
            "You are Dr. Chen, an enthusiastic economics researcher. "
            "Argue FOR this research idea.\n"
            "- Identify its strongest contributions and novelty\n"
            "- Cite papers from the context (use IDs like w31161)\n"
            "- Highlight potential impact and policy implications\n"
            "- In later rounds, defend against the Skeptic's concerns\n"
            "Keep to 250-350 words. Be specific, not generic."
        ),
    },
    "skeptic": {
        "label": "Dr. Smith (Skeptic)",
        "system": (
            "You are Dr. Smith, a rigorous referee. "
            "Challenge this research idea.\n"
            "- Identify threats: endogeneity, selection bias, reverse causality\n"
            "- Point out existing work that already covers similar ground (cite paper IDs)\n"
            "- Challenge data assumptions and external validity\n"
            "- In later rounds, push harder on the weakest points\n"
            "Keep to 250-350 words. Be constructive but tough."
        ),
    },
    "methodologist": {
        "label": "Dr. Li (Methodologist)",
        "system": (
            "You are Dr. Li, a senior econometrician. "
            "Evaluate the empirical strategy.\n"
            "- Propose the best identification strategy (DID, RDD, IV, structural, etc.)\n"
            "- Assess data requirements and feasibility\n"
            "- Reference methods from the context (cite paper IDs)\n"
            "- Suggest robustness checks\n"
            "- For China-focused ideas, note Chinese data sources (CFPS, CHNS, NBS, etc.)\n"
            "Keep to 250-350 words. Be technical but accessible."
        ),
    },
    "moderator": {
        "label": "Editor (Moderator)",
        "system": (
            "You are a senior economics journal editor. Synthesize this debate.\n\n"
            "Structure your response:\n"
            "## Consensus Points\n"
            "(What all debaters agreed on)\n\n"
            "## Key Tensions\n"
            "(Unresolved disagreements, which side is stronger)\n\n"
            "## Recommended Design\n"
            "(Optimal approach based on the Methodologist's input)\n\n"
            "## Verdict\n"
            "State clearly: PURSUE, MODIFY, or ABANDON. Give 3 specific next steps.\n\n"
            "Keep to 400-500 words. Be decisive."
        ),
    },
}

VERDICT_PROMPT = (
    "Based on the debate, provide ONLY valid JSON:\n"
    '{"overall_strength": <1-5>, "novelty": <1-5>, "feasibility": <1-5>, '
    '"recommendation": "<pursue|modify|abandon>", '
    '"summary": "<1 sentence>", '
    '"next_steps": ["<step1>", "<step2>", "<step3>"]}'
)


def _debate_error_payload(stage: str, exc: Exception) -> dict[str, str]:
    if isinstance(exc, LLMConfigurationError):
        message = str(exc)
    elif isinstance(exc, LLMConnectionError):
        message = f"The debate model could not reach its AI provider during {stage}. Check the provider base URL and network connection."
    elif isinstance(exc, LLMStatusError):
        message = f"The debate AI provider returned an API error during {stage}: HTTP {exc.status_code}."
    else:
        raw = str(exc).strip()
        message = raw or f"Debate failed during {stage}."
    return {
        "type": "error",
        "stage": stage,
        "message": message,
    }


async def _fetch_paper_content(paper_id: str) -> str:
    """Fetch full content for a paper by wrapping it in a hit-like dict."""
    paper = await resolvers.get_paper(paper_id)
    title = paper["title"] if paper else paper_id

    hit = {
        "entity_type": "paper",
        "entity_id": paper_id,
        "title": title,
        "snippet": "",
    }
    return await _fetch_full_content(hit)


async def run_debate(
    idea_title: str,
    idea_text: str,
    paper_ids: list[str] | None = None,
    rounds: int = 2,
) -> AsyncGenerator[str, None]:
    """Run multi-agent debate. Yields SSE-ready JSON strings."""

    client = _get_client("debate")  # raises ValueError if no API key

    # 1. Retrieve context
    context_items: list[dict] = []
    context_parts: list[str] = []

    if paper_ids:
        for pid in paper_ids[:10]:
            try:
                content = await _fetch_paper_content(pid)
                if content:
                    context_parts.append(content)
                    paper = await resolvers.get_paper(pid)
                    context_items.append({
                        "entity_type": "paper",
                        "entity_id": pid,
                        "title": paper["title"] if paper else pid,
                    })
            except Exception:
                logger.debug("Failed to fetch paper %s for debate", pid)

    # Fallback: semantic search if no context assembled
    if not context_parts:
        try:
            from embeddings import is_loaded
            from hybrid_search import semantic_search_resolver

            if is_loaded():
                results = await semantic_search_resolver(
                    idea_text,
                    entity_type="paper",
                    limit=5,
                )
                for r in results:
                    try:
                        content = await _fetch_paper_content(r["entity_id"])
                        if content:
                            context_parts.append(content)
                            context_items.append({
                                "entity_type": "paper",
                                "entity_id": r["entity_id"],
                                "title": r["entity_id"],
                            })
                    except Exception:
                        pass
        except Exception:
            pass

    context_str = _truncate("\n\n".join(context_parts), 8000)

    # Yield context event
    yield json.dumps({"type": "context", "items": context_items})

    # 2. Build idea block
    idea_block = f"=== RESEARCH IDEA ===\nTitle: {idea_title}\n{idea_text}\n=== END IDEA ==="
    context_block = (
        f"=== KNOWLEDGE BASE CONTEXT ===\n{context_str}\n=== END CONTEXT ==="
        if context_str
        else ""
    )

    # 3. Run debate rounds
    transcript: list[dict] = []  # [{role, label, round, text}]
    agent_order = ["advocate", "skeptic", "methodologist"]

    for round_num in range(1, rounds + 1):
        yield json.dumps({"type": "round_start", "round": round_num})

        for role in agent_order:
            agent = AGENT_ROLES[role]
            yield json.dumps({
                "type": "agent_start",
                "role": role,
                "label": agent["label"],
                "round": round_num,
            })

            # Build transcript section for context
            transcript_text = ""
            if transcript:
                transcript_text = "\n=== DEBATE TRANSCRIPT ===\n"
                for t in transcript:
                    transcript_text += (
                        f"[Round {t['round']}] {t['label']}:\n{t['text']}\n\n"
                    )
                transcript_text += "=== END TRANSCRIPT ==="
                # Truncate if too long
                if len(transcript_text) > 12000:
                    transcript_text = transcript_text[-12000:]

            user_msg = (
                f"{idea_block}\n\n{context_block}\n\n{transcript_text}\n\n"
                f"You are speaking in Round {round_num}. Provide your analysis."
            )

            # Stream agent response
            agent_text_parts: list[str] = []
            try:
                async with client.messages.stream(
                    model=_get_model("debate"),
                    max_tokens=1500,
                    system=agent["system"],
                    messages=[{"role": "user", "content": user_msg}],
                ) as stream:
                    async for text in stream.text_stream:
                        agent_text_parts.append(text)
                        yield json.dumps({"type": "chunk", "text": text})
            except Exception as e:
                logger.exception("Agent %s failed in round %d", role, round_num)
                yield json.dumps(_debate_error_payload(f"{agent['label']} in round {round_num}", e))
                return

            full_text = "".join(agent_text_parts)
            transcript.append({
                "role": role,
                "label": agent["label"],
                "round": round_num,
                "text": full_text,
            })

            yield json.dumps({"type": "agent_done", "role": role, "round": round_num})

        yield json.dumps({"type": "round_done", "round": round_num})

    # 4. Moderator synthesis
    yield json.dumps({"type": "synthesis_start"})
    yield json.dumps({
        "type": "agent_start",
        "role": "moderator",
        "label": AGENT_ROLES["moderator"]["label"],
        "round": 0,
    })

    transcript_text = "\n=== FULL DEBATE TRANSCRIPT ===\n"
    for t in transcript:
        transcript_text += f"[Round {t['round']}] {t['label']}:\n{t['text']}\n\n"

    user_msg = f"{idea_block}\n\n{context_block}\n\n{transcript_text}\n\nProvide your synthesis."

    synthesis_parts: list[str] = []
    try:
        async with client.messages.stream(
            model=_get_model("debate"),
            max_tokens=2000,
            system=AGENT_ROLES["moderator"]["system"],
            messages=[{"role": "user", "content": user_msg}],
        ) as stream:
            async for text in stream.text_stream:
                synthesis_parts.append(text)
                yield json.dumps({"type": "chunk", "text": text})
    except Exception as e:
        logger.exception("Moderator synthesis failed")
        yield json.dumps(_debate_error_payload("moderator synthesis", e))
        return

    yield json.dumps({"type": "agent_done", "role": "moderator", "round": 0})
    yield json.dumps({"type": "synthesis_done"})

    # 5. Extract verdict (non-streaming)
    try:
        verdict_response = await client.messages.create(
            model=_get_model("debate"),
            max_tokens=500,
            system="You extract structured verdicts from debate syntheses. Respond with ONLY valid JSON.",
            messages=[{
                "role": "user",
                "content": f"Synthesis:\n{''.join(synthesis_parts)}\n\n{VERDICT_PROMPT}",
            }],
        )
        verdict_text = verdict_response.content[0].text.strip()
        # Try to parse JSON
        verdict_match = re.search(r"\{.*\}", verdict_text, re.DOTALL)
        if verdict_match:
            verdict = json.loads(verdict_match.group())
            yield json.dumps({"type": "verdict", "data": verdict})
    except Exception as e:
        logger.warning("Verdict extraction failed: %s", e)
        yield json.dumps({
            "type": "verdict",
            "data": {
                "overall_strength": 3,
                "novelty": 3,
                "feasibility": 3,
                "recommendation": "modify",
                "summary": "See synthesis above.",
                "next_steps": [],
            },
        })

    # 6. Extract citations from all text
    all_text = " ".join(t["text"] for t in transcript) + " " + "".join(synthesis_parts)
    citations = sorted(set(re.findall(r"w\d{4,5}", all_text)))

    yield json.dumps({"type": "done", "citations": citations})
