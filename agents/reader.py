"""
Agent 2: Reader — Deep-read papers and extract structured knowledge + atoms.
"""

from __future__ import annotations

import difflib
import json
import logging
import os
import re
import time
from pathlib import Path

from agents.config import (
    MAX_TOKENS_READER, PROMPTS_DIR,
    CARDS_DIR, METHODS_DIR, DATASETS_DIR, MECHANISMS_DIR, PUZZLES_DIR, get_client, get_model,
)
from agents.pdf_utils import extract_full_text
from agents.db_utils import get_triaged_for_reading, update_paper_completed, update_paper_status

logger = logging.getLogger("reader")

_FOCUS_LABELS = {
    "title_abstract": "Title & Abstract",
    "research_question": "Research Question",
    "literature_position": "Literature Position",
    "theory_framework": "Theory Framework",
    "hypotheses_predictions": "Hypotheses & Predictions",
    "institutional_context": "Institutional Context",
    "methods_data": "Methods & Data",
    "identification": "Identification",
    "robustness": "Robustness",
    "findings": "Findings",
    "mechanisms": "Mechanisms",
    "external_validity": "External Validity",
    "policy_implications": "Policy Implications",
    "welfare_counterfactuals": "Welfare & Counterfactuals",
    "method_reuse": "Reusable Research Design",
    "data_reuse": "Reusable Data Assets",
    "limitations": "Limitations",
    "future_research": "Future Research",
    "writing_style": "Writing Style",
    "argument_logic": "Argument Logic",
    "figures_tables": "Figures & Tables",
    "technical_appendix": "Technical Appendix",
}

_DEFAULT_SECTION_LABELS = [
    "Research Question",
    "Methods & Data",
    "Identification",
    "Findings",
    "Mechanisms",
    "Limitations",
    "Research Reuse & Extensions",
]

_COMMON_SECTION_HEADINGS = {
    "abstract",
    "introduction",
    "background",
    "related literature",
    "literature review",
    "institutional background",
    "model",
    "theory",
    "conceptual framework",
    "data",
    "empirical strategy",
    "identification",
    "method",
    "methods",
    "estimation",
    "results",
    "findings",
    "main results",
    "robustness",
    "robustness checks",
    "mechanism",
    "mechanisms",
    "heterogeneity",
    "discussion",
    "conclusion",
    "conclusions",
    "appendix",
    "references",
}

_SECTION_BREAK_RE = re.compile(
    r"^(?:section\s+)?(?:\d{1,2}|[ivxlcdm]{1,6})[\.\)]\s+(.{3,100})$",
    re.IGNORECASE,
)

_MAX_SECTION_CHARS = 26000
_MAX_SECTION_NOTES = 12
_SECTION_NOTE_TOKENS = min(2400, MAX_TOKENS_READER)


def _humanize_focus_key(key: str) -> str:
    text = re.sub(r"^custom_", "", key).replace("_", " ").strip()
    return text.title() if text else key


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
    return (PROMPTS_DIR / "reader.txt").read_text()


def build_prompt(system_prompt: str, paper: dict) -> str:
    reading_profile = (paper.get("reading_profile") or "auto").strip().lower()
    extra_lines: list[str] = []

    if reading_profile == "style_logic":
        extra_lines.append(
            "Pay extra attention to writing style, exposition choices, argument structure, assumptions, and inferential logic."
        )
    elif reading_profile == "full_content":
        extra_lines.append(
            "This run should prioritize extracting the paper's full-content contribution, methods, datasets, and findings."
        )
    elif reading_profile == "section_batch":
        extra_lines.append(
            "This run uses section-by-section reading notes. Synthesize across all section notes and preserve where the evidence came from when useful."
        )
    elif reading_profile == "custom":
        extra_lines.append(
            "This run uses a custom reading mode. Follow the user-provided instructions and dimensions below."
        )

    custom_instructions = str(paper.get("custom_reading_instructions") or "").strip()
    if custom_instructions:
        extra_lines.append("Custom reading instructions: " + custom_instructions)

    focuses = _load_json_list(paper.get("analysis_focuses") or "[]")
    prompt_map = _load_json_dict(paper.get("analysis_focus_prompts") or "{}")
    focus_specs = []
    for key in focuses:
        label = _FOCUS_LABELS.get(key) or _humanize_focus_key(key)
        instruction = prompt_map.get(key) or label
        focus_specs.append(f"{label}: {instruction}")
    if focus_specs:
        extra_lines.append(
            "Selected reading dimensions. Override the Paper Card template for this run: after ## Meta, output exactly one level-2 markdown section for each selected dimension below, in the same order, using the exact dimension label as the heading. Do not add unselected analytical sections such as 'What Makes This Paper Good'. Keep ## Scores after the selected dimension sections. If evidence is missing, say that the paper does not provide it rather than inventing it:\n  - "
            + "\n  - ".join(focus_specs)
        )
    else:
        extra_lines.append(
            "No custom reading dimensions were selected. Use these default Paper Card sections after ## Meta: "
            + ", ".join(_DEFAULT_SECTION_LABELS)
            + ". Do not include 'What Makes This Paper Good' unless it is explicitly requested as a selected dimension."
        )

    if not extra_lines:
        return system_prompt
    return system_prompt + "\n\nAdditional run instructions:\n- " + "\n- ".join(extra_lines)


def _focus_specs_for_notes(paper: dict) -> str:
    focuses = _load_json_list(paper.get("analysis_focuses") or "[]")
    prompt_map = _load_json_dict(paper.get("analysis_focus_prompts") or "{}")
    if not focuses:
        return "\n".join(f"- {label}" for label in _DEFAULT_SECTION_LABELS)
    lines = []
    for key in focuses:
        label = _FOCUS_LABELS.get(key) or _humanize_focus_key(key)
        instruction = prompt_map.get(key) or label
        lines.append(f"- {label}: {instruction}")
    return "\n".join(lines)


def slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")


# Patterns that indicate LLM chain-of-thought preamble (case-insensitive)
_LLM_PREAMBLE_PATTERNS = re.compile(
    r"^("
    r"I'll\b.*|"
    r"I will\b.*|"
    r"Let me\b.*|"
    r"Here is\b.*|"
    r"Here's\b.*|"
    r"Below is\b.*|"
    r"Sure[,!.].*|"
    r"Certainly[,!.].*|"
    r"Of course[,!.].*|"
    r"Key observations:.*|"
    r"Let's\b.*|"
    r"Now I'll\b.*|"
    r"Now let me\b.*|"
    r"Alright[,.].*|"
    r"Okay[,.].*"
    r")$",
    re.IGNORECASE,
)


def strip_llm_preamble(text: str) -> str:
    """Remove LLM chain-of-thought preamble lines from the beginning of text.

    Strips lines like "I'll analyze...", "Let me...", "Key observations:" etc.
    that appear before the actual content starts.
    """
    lines = text.split("\n")
    # Drop leading preamble lines (blank lines and matching patterns)
    start = 0
    for i, line in enumerate(lines):
        stripped = line.strip()
        if not stripped:
            # Allow blank lines at the start — keep scanning
            start = i + 1
            continue
        if _LLM_PREAMBLE_PATTERNS.match(stripped):
            start = i + 1
            continue
        # First non-blank, non-preamble line: stop
        break
    return "\n".join(lines[start:])


# Canonical method names — common economics methods mapped to their preferred slug
_CANONICAL_METHODS = {
    "difference_in_differences": ["did", "diff_in_diff", "twfe", "two_way_fixed_effects"],
    "staggered_did": ["staggered_difference_in_differences", "staggered_treatment"],
    "callaway_santanna": ["cs_estimator", "cs_did"],
    "event_study": ["dynamic_event_study", "distributed_lag"],
    "regression_discontinuity": ["rdd", "rd_design", "sharp_rd", "fuzzy_rd"],
    "instrumental_variables": ["iv", "2sls", "two_stage_least_squares", "tsls"],
    "shift_share": ["bartik", "bartik_instrument"],
    "synthetic_control": ["synthetic_control_method", "scm"],
    "bunching": ["bunching_estimator", "bunching_design"],
    "matching": ["propensity_score_matching", "psm", "nearest_neighbor_matching"],
    "triple_differences": ["ddd", "diff_in_diff_in_diff"],
}

# Canonical dataset names — common economics datasets mapped to their preferred slug
_CANONICAL_DATASETS = {
    "acs_pums": ["acs_puma", "acs_puma_health", "ipums_acs", "ipums_acs_harmonized", "ipums_census_acs", "american_community_survey"],
    "medicare_claims": ["medicare_ffs_claims", "medicare_ffs_claims_100pct", "medicare_100_pct_claims", "medicare_inpatient_claims"],
    "medicare_cost_reports": ["cms_hospital_cost_reports", "cms_hcris", "medicare_cost_reports_hcris", "hcris"],
    "medicare_part_d": ["medicare_part_d_claims", "medicare_part_d_event", "medicare_part_d_prescriber"],
    "medicare_carrier": ["medicare_carrier_claims", "medicare_carrier_file", "medicare_carrier_outpatient"],
    "cps": ["current_population_survey", "cps_monthly", "cps_annual", "cps_asec", "march_cps"],
    "seer_medicare": ["seer_medicare_linked", "seer_cancer_registry"],
    "meps": ["medical_expenditure_panel_survey", "meps_household", "meps_insurance"],
    "nhis": ["national_health_interview_survey"],
    "brfss": ["behavioral_risk_factor_surveillance"],
    "psid": ["panel_study_income_dynamics"],
    "nlsy": ["national_longitudinal_survey_youth", "nlsy79", "nlsy97"],
    "cfps": ["china_family_panel_studies"],
    "charls": ["china_health_retirement_longitudinal"],
    "chns": ["china_health_nutrition_survey"],
    "compustat": ["compustat_fundamentals", "compustat_north_america"],
    "crsp": ["crsp_stock", "crsp_monthly"],
}

# Canonical mechanism names — common economics mechanisms mapped to their preferred slug
_CANONICAL_MECHANISMS = {
    "moral_hazard": ["moral_hazard_health", "moral_hazard_insurance", "ex_ante_moral_hazard", "ex_post_moral_hazard"],
    "adverse_selection": ["adverse_selection_health", "adverse_selection_insurance", "adverse_selection_market"],
    "selection_bias": ["selection_on_observables", "selection_on_unobservables", "sample_selection"],
    "price_elasticity": ["price_elasticity_demand", "price_elasticity_supply", "demand_elasticity"],
    "crowd_out": ["crowding_out", "crowd_out_private", "crowd_out_public"],
    "spillover": ["spillover_effect", "spillover_externality", "geographic_spillover", "price_mediated_market_spillover", "price_mediated_market_spillovers"],
    "income_effect": ["income_effect_labor", "income_effect_consumption"],
    "substitution_effect": ["substitution_effect_labor", "substitution_effect_consumption"],
}

# Build reverse lookup
_SLUG_TO_CANONICAL = {}
for _canonical, _aliases in _CANONICAL_METHODS.items():
    _SLUG_TO_CANONICAL[_canonical] = _canonical
    for _alias in _aliases:
        _SLUG_TO_CANONICAL[_alias] = _canonical

for _canonical, _aliases in _CANONICAL_DATASETS.items():
    _SLUG_TO_CANONICAL[_canonical] = _canonical
    for _alias in _aliases:
        _SLUG_TO_CANONICAL[_alias] = _canonical

for _canonical, _aliases in _CANONICAL_MECHANISMS.items():
    _SLUG_TO_CANONICAL[_canonical] = _canonical
    for _alias in _aliases:
        _SLUG_TO_CANONICAL[_alias] = _canonical


def normalize_atom_slug(slug: str, atom_type: str) -> str:
    """Normalize an atom slug to a canonical name if possible."""
    # Direct lookup
    if slug in _SLUG_TO_CANONICAL:
        return _SLUG_TO_CANONICAL[slug]

    # Determine which canonical dicts to check based on atom_type
    canonical_dicts = {
        "method": _CANONICAL_METHODS,
        "dataset": _CANONICAL_DATASETS,
        "mechanism": _CANONICAL_MECHANISMS,
    }
    # Check if slug starts with or contains a canonical name (all types)
    for cdict in canonical_dicts.values():
        for canonical in cdict:
            if slug.startswith(canonical + "_") or slug.endswith("_" + canonical):
                return canonical

    # Fuzzy match against canonical names (threshold 0.75)
    if atom_type in ("method", "dataset", "mechanism"):
        target_dict = canonical_dicts.get(atom_type)
        if target_dict:
            best_match = None
            best_ratio = 0.0
            all_names = list(target_dict.keys()) + [
                alias for aliases in target_dict.values() for alias in aliases
            ]
            for name in all_names:
                ratio = difflib.SequenceMatcher(None, slug, name).ratio()
                if ratio > best_ratio:
                    best_ratio = ratio
                    best_match = name
            if best_ratio >= 0.75 and best_match:
                return _SLUG_TO_CANONICAL.get(best_match, best_match)

    return slug  # No match, keep original


def save_atom_file(directory: Path, atom: dict, paper_id: str):
    """Save or update an atom file. Appends paper reference if atom already exists."""
    # Handle missing 'name' field gracefully
    atom_name = atom.get("name", atom.get("label", "unnamed_atom"))
    slug = slugify(atom_name)
    if not slug:
        slug = "unnamed_atom"

    # Determine atom type from directory name for normalization
    atom_type = directory.name.rstrip("s")  # methods -> method, datasets -> dataset, etc.
    slug = normalize_atom_slug(slug, atom_type)

    filepath = directory / f"{slug}.md"

    if filepath.exists():
        content = filepath.read_text()
        # Append paper reference if not already there. Match a whole list line,
        # not a substring — otherwise a shorter id (w311) is wrongly treated as
        # already present inside a longer one (w31161) and never recorded.
        already_listed = re.search(rf"(?m)^\s*-\s*{re.escape(paper_id)}\s*$", content)
        if not already_listed:
            content = content.rstrip() + f"\n- {paper_id}\n"
            filepath.write_text(content)
        return

    # Create new atom file
    label = atom.get("label", atom_name)
    desc = atom.get("description", "")
    lines = [f"# {label}", "", f"## Description", desc, ""]

    if "when_to_use" in atom:
        lines += ["## When to Use", atom["when_to_use"], ""]
    if "access" in atom:
        lines += [f"## Access", atom["access"], ""]
    if "url" in atom and atom["url"]:
        lines += [f"## URL", atom["url"], ""]
    if "evidence_strength" in atom:
        lines += [f"## Evidence Strength", atom["evidence_strength"], ""]
    if "key_references" in atom:
        lines += ["## Key References"] + [f"- {r}" for r in atom["key_references"]] + [""]

    lines += ["## Papers", f"- {paper_id}", ""]
    filepath.write_text("\n".join(lines))


def remove_paper_from_atom_files(paper_id: str):
    """Remove stale atom references for a paper before saving fresh atoms."""
    for directory in (METHODS_DIR, DATASETS_DIR, MECHANISMS_DIR, PUZZLES_DIR):
        if not directory.exists():
            continue
        for filepath in directory.glob("*.md"):
            content = filepath.read_text()
            updated = re.sub(
                rf"(?m)^\s*-\s*{re.escape(paper_id)}\s*$\n?",
                "",
                content,
            )
            if updated != content:
                filepath.write_text(updated.rstrip() + "\n")


def parse_scores(card_text: str) -> dict:
    """Extract 15-dimension scores from the card's Scores section."""
    scores = {}
    # Match pattern like "- literature_innovation: X/5" or "literature_innovation: X/5"
    for match in re.finditer(r"(?:^|\n)\s*-?\s*(\w+):\s*([\d.]+)/5", card_text):
        scores[match.group(1)] = float(match.group(2))
    return scores


def parse_key_contribution(card_text: str) -> str:
    """Extract the research question as the key contribution."""
    match = re.search(r"## Research Question\s*\n(.+?)(?:\n#|\Z)", card_text, re.DOTALL)
    if match:
        return match.group(1).strip()[:500]
    return ""


def _looks_like_section_heading(line: str) -> str | None:
    stripped = re.sub(r"\s+", " ", line.strip())
    if not stripped or len(stripped) > 120:
        return None
    if stripped.endswith((".", ",", ";", ":")) and stripped.lower() not in _COMMON_SECTION_HEADINGS:
        return None

    numbered = _SECTION_BREAK_RE.match(stripped)
    if numbered:
        title = numbered.group(1).strip()
        if len(title.split()) <= 12:
            return stripped

    normalized = stripped.lower().strip(" .:-")
    if normalized in _COMMON_SECTION_HEADINGS:
        return stripped
    if len(normalized.split()) <= 8:
        for heading in _COMMON_SECTION_HEADINGS:
            if normalized.startswith(heading + " ") or normalized.endswith(" " + heading):
                return stripped
    return None


def _split_text_into_sections(text: str) -> list[dict[str, str]]:
    sections: list[dict[str, str]] = []
    current_title = "Front Matter"
    current_lines: list[str] = []
    seen_body = False

    for raw_line in text.splitlines():
        line = raw_line.rstrip()
        heading = _looks_like_section_heading(line)
        if heading and seen_body:
            body = "\n".join(current_lines).strip()
            if body:
                sections.append({"title": current_title, "text": body})
            current_title = heading
            current_lines = []
            if heading.lower().strip(" .:-") == "references":
                break
            continue
        if line.strip():
            seen_body = True
        current_lines.append(line)

    body = "\n".join(current_lines).strip()
    if body:
        sections.append({"title": current_title, "text": body})

    sections = [
        section
        for section in sections
        if len(section["text"].strip()) >= 500
        and section["title"].lower().strip(" .:-") != "references"
    ]
    if len(sections) >= 2:
        return sections[:_MAX_SECTION_NOTES]

    chunks = []
    for index, start in enumerate(range(0, len(text), _MAX_SECTION_CHARS), start=1):
        chunk = text[start:start + _MAX_SECTION_CHARS].strip()
        if chunk:
            chunks.append({"title": f"Text Chunk {index}", "text": chunk})
        if len(chunks) >= _MAX_SECTION_NOTES:
            break
    return chunks


def _message_text(response) -> str:
    return response.content[0].text.strip()


# Transient network failures (e.g. "Server disconnected without sending a
# response", read timeouts) are common against the hosted LLM endpoint and a
# single drop must not fail the whole multi-call read. Retry patiently with
# exponential backoff so a brief bad window is ridden out.
_READER_MAX_ATTEMPTS = int(os.environ.get("READER_MAX_ATTEMPTS", "5"))


def _create_message_with_retries(
    client,
    *,
    model: str,
    system: str,
    user_content: str,
    max_tokens: int,
    paper_id: str,
    step_label: str,
):
    last_error: Exception | None = None
    for attempt in range(1, _READER_MAX_ATTEMPTS + 1):
        try:
            return client.messages.create(
                model=model,
                max_tokens=max_tokens,
                system=system,
                messages=[{"role": "user", "content": user_content}],
            )
        except Exception as exc:
            last_error = exc
            logger.warning(
                f"[{paper_id}] {step_label} attempt {attempt}/{_READER_MAX_ATTEMPTS} failed: {exc}"
            )
            if attempt < _READER_MAX_ATTEMPTS:
                time.sleep(min(30, 3 * (2 ** (attempt - 1))))
    raise RuntimeError(str(last_error))


def _read_section_notes(client, model: str, paper: dict, text: str) -> str:
    paper_id = paper["paper_id"]
    focus_specs = _focus_specs_for_notes(paper)
    sections = _split_text_into_sections(text)
    logger.info(f"[{paper_id}] Section-batch reading: {len(sections)} sections/chunks")
    notes: list[str] = []
    note_system = (
        "You are reading one section of an academic paper. Produce concise evidence notes only. "
        "Do not create the final paper card. Preserve concrete details, equations, data names, "
        "section-local claims, table/figure references, caveats, and page/section signals if present. "
        "If a selected dimension is not discussed in this section, write 'not discussed in this section'."
    )

    for index, section in enumerate(sections, start=1):
        title = section["title"]
        section_text = section["text"][:_MAX_SECTION_CHARS]
        user_content = (
            f"Paper ID: {paper_id}\n"
            f"Section {index}/{len(sections)}: {title}\n\n"
            "Selected reading dimensions:\n"
            f"{focus_specs}\n\n"
            "Section text:\n"
            f"{section_text}"
        )
        response = _create_message_with_retries(
            client,
            model=model,
            system=note_system,
            user_content=user_content,
            max_tokens=_SECTION_NOTE_TOKENS,
            paper_id=paper_id,
            step_label=f"section {index}",
        )
        note = strip_llm_preamble(_message_text(response))
        notes.append(f"## Section {index}: {title}\n{note[:6500].strip()}")
        if index < len(sections):
            time.sleep(1)

    return "\n\n".join(notes)


# ---------------------------------------------------------------------------
# Multi-call card assembly
# ---------------------------------------------------------------------------
# A single LLM response cannot hold many dimension sections + the 15-dimension
# Scores block + the atoms JSON. When many reading dimensions are selected the
# response is truncated at max_tokens before Scores/atoms are ever emitted (so
# the card saves with no scores and no atoms), and simply raising max_tokens
# trades that truncation for an HTTP read timeout. We instead generate the card
# in focused calls — dimension sections in small batches, then Scores, then
# atoms — and stitch the legacy "card ===ATOMS=== atoms" string back together
# so read_one() parses it exactly as before. Each call stays well under both the
# token cap and the request timeout regardless of how many dimensions are picked.

_READER_DIM_BATCH = 6                            # dimension sections per call
_READER_DIM_TOKENS = max(2048, MAX_TOKENS_READER)
_READER_SCORES_TOKENS = 900
_READER_ATOMS_TOKENS = 2048
_READER_TEXT_WINDOW = 80000
_READER_CALL_GAP = 1.5                           # seconds between focused calls (avoid rate-limit drops)

_DIM_SYSTEM = (
    "You are a senior academic research assistant performing a deep read of an NBER working paper. "
    "Extract structured knowledge that helps scholars understand, reuse, critique, and extend the paper. "
    "Output ONLY the markdown sections requested in the user message, using the exact headings given. "
    "Do not output scores, atoms, triage decisions (DEEP_READ/SKIM/SKIP), or any section that was not "
    "requested. If the paper does not provide evidence for a requested dimension, say so explicitly rather "
    "than inventing it."
)

_SCORES_SYSTEM = (
    "You are scoring an NBER working paper across 15 fixed dimensions on a 1-5 integer scale. "
    "Output ONLY the '## Scores' markdown block in exactly the requested format, with each X replaced by an "
    "integer from 1 to 5 grounded in the paper text. Do not output anything else."
)

_ATOMS_SYSTEM = (
    "You extract reusable research building blocks ('atoms') from an NBER working paper as a single JSON "
    "object. Output ONLY the JSON object, with no prose before or after. Only include atoms that are "
    "genuinely reusable across papers; do not force extraction."
)

_SCORES_TEMPLATE = """## Scores (15 Dimensions, 1-5 scale)

### Literature & Theory (4 dimensions)
- literature_innovation: X/5 [Novelty relative to existing literature]
- theory_contribution: X/5 [Theoretical framework or conceptual advance]
- empirical_rigor: X/5 [Credibility of causal identification]
- data_quality: X/5 [Uniqueness, granularity, and reliability of data]

### Methods & Data (4 dimensions)
- method_complexity: X/5 [Technical sophistication of methods used]
- technical_difficulty: X/5 [Skill required to implement the approach]
- method_innovation: X/5 [Novel methodological contribution]
- reproducibility: X/5 [Clarity of description and availability of materials]

### Writing & Presentation (4 dimensions)
- narrative_clarity: X/5 [Quality of storytelling and logical flow]
- structure_quality: X/5 [Organization of sections and arguments]
- lit_review_quality: X/5 [Comprehensiveness and critical assessment of prior work]
- presentation_quality: X/5 [Tables, figures, and visual communication]

### Relevance (3 dimensions)
- scholarly_relevance: X/5 [Importance to the paper's own field and adjacent academic fields]
- data_accessibility: X/5 [Feasibility of obtaining similar data for follow-up work]
- inspiration: X/5 [Potential to generate new research ideas]

**Average: X.X/5**"""

_ATOMS_SCHEMA = """{
  "methods": [
    {"name": "slug_name (e.g., stacked_did)", "label": "Human-readable name", "description": "2-3 sentence recipe: what it solves and how it works", "when_to_use": "conditions under which this method is appropriate", "key_references": ["Author (Year)"]}
  ],
  "datasets": [
    {"name": "slug_name (e.g., brfss)", "label": "Human-readable name", "description": "What it contains, coverage, granularity", "access": "public / restricted / administrative", "url": "if known, else null"}
  ],
  "mechanisms": [
    {"name": "slug_name (e.g., income_effect_on_bmi)", "label": "Human-readable name", "description": "The causal channel: X affects Y through Z", "evidence_strength": "strong / moderate / suggestive"}
  ],
  "puzzles": [
    {"name": "slug_name", "label": "Human-readable name", "description": "The unresolved question this paper raises or fails to answer"}
  ]
}"""


def _dimension_specs(paper: dict) -> list[tuple[str, str]]:
    """Return [(label, instruction)] for the selected dimensions, or defaults."""
    focuses = _load_json_list(paper.get("analysis_focuses") or "[]")
    prompt_map = _load_json_dict(paper.get("analysis_focus_prompts") or "{}")
    if not focuses:
        return [(label, "") for label in _DEFAULT_SECTION_LABELS]
    specs: list[tuple[str, str]] = []
    for key in focuses:
        label = _FOCUS_LABELS.get(key) or _humanize_focus_key(key)
        specs.append((label, prompt_map.get(key) or label))
    return specs


def _profile_hint(reading_profile: str) -> str:
    if reading_profile == "style_logic":
        return (
            " For this run pay extra attention to writing style, exposition choices, argument structure, "
            "assumptions, and inferential logic."
        )
    if reading_profile == "full_content":
        return " For this run prioritize the paper's full-content contribution, methods, datasets, and findings."
    return ""


def _build_dimension_user(
    paper_id: str,
    batch: list[tuple[str, str]],
    text: str,
    *,
    include_header: bool,
    custom_instructions: str,
) -> str:
    lines = [f"Paper ID: {paper_id}", ""]
    if include_header:
        lines += [
            "Produce the Paper Card header and Meta block first, then one level-2 markdown section for EACH "
            "dimension listed below, in order, using the EXACT dimension label as the heading.",
            "",
            "Header and Meta format:",
            f"# {paper_id}: [Full Title]",
            "",
            "## Meta",
            "- Authors: [full author list]",
            "- Year: [year]",
            "- Fields: [field tags]",
            '- JEL: [JEL codes if found, else "N/A"]',
            "",
            "Then the dimension sections:",
        ]
    else:
        lines += [
            "Output one level-2 markdown section for EACH dimension listed below, in order, using the EXACT "
            "dimension label as the heading. Output ONLY these sections — no card header, no Meta, no Scores, "
            "no atoms.",
        ]
    if custom_instructions:
        lines += ["", f"Custom reading instructions: {custom_instructions}"]
    lines += ["", "Dimensions for this batch:"]
    for label, instruction in batch:
        lines.append(f"- {label}: {instruction}" if instruction else f"- {label}")
    lines += ["", "Paper text:", text]
    return "\n".join(lines)


def _assemble_card_multi_call(client, model: str, paper: dict, text: str) -> str:
    """Generate the card across several focused calls and return the legacy
    "card ===ATOMS=== atoms" string that read_one() expects."""
    paper_id = paper["paper_id"]
    reading_profile = (paper.get("reading_profile") or "auto").strip().lower()
    custom_instructions = str(paper.get("custom_reading_instructions") or "").strip()
    specs = _dimension_specs(paper)
    window = text[:_READER_TEXT_WINDOW]
    dim_system = _DIM_SYSTEM + _profile_hint(reading_profile)

    batches = [specs[i:i + _READER_DIM_BATCH] for i in range(0, len(specs), _READER_DIM_BATCH)]
    logger.info(
        f"[{paper_id}] Multi-call reader: {len(specs)} dimension(s) in {len(batches)} batch(es) + scores + atoms"
    )

    card_parts: list[str] = []
    for index, batch in enumerate(batches):
        if index > 0:
            time.sleep(_READER_CALL_GAP)
        user_content = _build_dimension_user(
            paper_id,
            batch,
            window,
            include_header=(index == 0),
            custom_instructions=custom_instructions,
        )
        response = _create_message_with_retries(
            client,
            model=model,
            system=dim_system,
            user_content=user_content,
            max_tokens=_READER_DIM_TOKENS,
            paper_id=paper_id,
            step_label=f"dimensions {index + 1}/{len(batches)}",
        )
        part = strip_llm_preamble(_message_text(response)).strip()
        if part:
            card_parts.append(part)

    time.sleep(_READER_CALL_GAP)
    scores_user = (
        f"Paper ID: {paper_id}\n\n"
        "Produce exactly the following block, replacing each X with an integer from 1 to 5 grounded in the "
        "paper. Keep the headings and dimension keys exactly as written.\n\n"
        f"{_SCORES_TEMPLATE}\n\n"
        f"Paper text:\n{window}"
    )
    scores_response = _create_message_with_retries(
        client,
        model=model,
        system=_SCORES_SYSTEM,
        user_content=scores_user,
        max_tokens=_READER_SCORES_TOKENS,
        paper_id=paper_id,
        step_label="scores",
    )
    scores_block = strip_llm_preamble(_message_text(scores_response)).strip()
    if scores_block:
        card_parts.append(scores_block)

    time.sleep(_READER_CALL_GAP)
    atoms_user = (
        f"Paper ID: {paper_id}\n\n"
        "Extract reusable atoms as a single JSON object with keys methods, datasets, mechanisms, and "
        "puzzles, using this schema:\n"
        f"{_ATOMS_SCHEMA}\n\n"
        "Only include atoms that are genuinely reusable across papers — don't force extraction. Output ONLY "
        "the JSON object.\n\n"
        f"Paper text:\n{window}"
    )
    atoms_response = _create_message_with_retries(
        client,
        model=model,
        system=_ATOMS_SYSTEM,
        user_content=atoms_user,
        max_tokens=_READER_ATOMS_TOKENS,
        paper_id=paper_id,
        step_label="atoms",
    )
    atoms_text = strip_llm_preamble(_message_text(atoms_response)).strip()

    card = "\n\n".join(card_parts)
    return f"{card}\n\n===ATOMS===\n{atoms_text}"


def _read_final_card(client, model: str, paper: dict, system_prompt: str, text: str) -> str:
    paper_id = paper["paper_id"]
    reading_profile = (paper.get("reading_profile") or "auto").strip().lower()

    # For long papers in section-batch mode, distill section notes first and feed
    # those (instead of raw text) into the focused dimension/scores/atoms calls.
    source_text = text
    if reading_profile == "section_batch":
        try:
            source_text = _read_section_notes(client, model, paper, text)
        except Exception as exc:
            logger.warning(f"[{paper_id}] Section-batch notes failed; using raw text: {exc}")
            source_text = text

    return _assemble_card_multi_call(client, model, paper, source_text)


def read_one(client, model: str, paper: dict, system_prompt: str) -> bool:
    """Deep-read a single paper. Returns True on success."""
    paper_id = paper["paper_id"]
    pdf_path = paper["file_path"]

    try:
        text = extract_full_text(pdf_path)
    except Exception as e:
        logger.error(f"[{paper_id}] PDF extraction failed: {e}")
        update_paper_status(paper_id, "pdf_error")
        return False

    if len(text.strip()) < 200:
        logger.warning(f"[{paper_id}] Extracted text too short")
        update_paper_status(paper_id, "pdf_error")
        return False

    try:
        raw = _read_final_card(client, model, paper, system_prompt, text)
    except Exception as e:
        logger.error(f"[{paper_id}] API error after retries: {e}")
        update_paper_status(paper_id, "error")
        return False

    # Split card and atoms
    if "===ATOMS===" in raw:
        card_text, atoms_text = raw.split("===ATOMS===", 1)
    else:
        card_text = raw
        atoms_text = ""

    # Clean card text: strip LLM preamble and code fences
    card_text = strip_llm_preamble(card_text.strip())
    # Remove everything before the first "# <paper_id>:" header (any id scheme,
    # not just NBER wNNNNN — uploads and DOI-derived ids also reach here).
    header_match = re.search(rf"^(# {re.escape(paper_id)}:.*)", card_text, re.MULTILINE)
    if header_match:
        card_text = card_text[header_match.start():]
    # Remove wrapping code fences (```markdown ... ```)
    card_text = re.sub(r"^```(?:markdown)?\s*\n", "", card_text)
    card_text = re.sub(r"\n```\s*$", "", card_text)
    card_text = card_text.strip()

    # Validate BEFORE persisting: a card with no parseable 1-5 scores means the
    # scores generation failed or returned garbage (e.g. a dropped multi-call
    # step). Writing it would publish a broken, scoreless card to the site, so
    # mark the paper as error for retry instead of silently "completing" it.
    scores = parse_scores(card_text)
    if not scores:
        logger.error(f"[{paper_id}] No parseable scores in card; marking error for retry")
        update_paper_status(paper_id, "error")
        return False

    # Clean atoms text: strip LLM preamble
    atoms_text = strip_llm_preamble(atoms_text.strip())

    # Save card
    card_path = CARDS_DIR / f"{paper_id}.md"
    card_path.write_text(card_text)
    logger.info(f"[{paper_id}] Card saved to {card_path}")

    # A re-read should replace this paper's atom set, not accumulate stale
    # references from previous AI outputs.
    remove_paper_from_atom_files(paper_id)

    # Parse and save atoms
    if atoms_text.strip():
        try:
            # Extract JSON from a possible markdown code block. Tolerate both
            # multi-line (```json\n{...}```) and single-line (```json {...}```)
            # fences — the newline after the fence is optional.
            atoms_clean = atoms_text.strip()
            if "```" in atoms_clean:
                atoms_match = re.search(r"```(?:json)?\s*(.*?)```", atoms_clean, re.DOTALL)
                atoms_clean = atoms_match.group(1) if atoms_match else atoms_text.strip()
            atoms = json.loads(atoms_clean)

            atom_dirs = {
                "methods": METHODS_DIR,
                "datasets": DATASETS_DIR,
                "mechanisms": MECHANISMS_DIR,
                "puzzles": PUZZLES_DIR,
            }
            atom_count = 0
            for category, directory in atom_dirs.items():
                for atom in atoms.get(category, []):
                    save_atom_file(directory, atom, paper_id)
                    atom_count += 1
            logger.info(f"[{paper_id}] Saved {atom_count} atoms")

        except (json.JSONDecodeError, AttributeError) as e:
            logger.warning(f"[{paper_id}] Failed to parse atoms JSON: {e}")

    # Update DB (scores already parsed and validated above)
    key_contribution = parse_key_contribution(card_text)

    # Read field tags from card
    fields_match = re.search(r"Fields:\s*(.+)", card_text)
    field_tags = fields_match.group(1).strip() if fields_match else ""

    update_paper_completed(paper_id, scores, key_contribution, field_tags)
    return True


def run(batch_size: int = 10) -> dict:
    """Run Reader on a batch of papers ready for AI reading."""
    client = get_client("reader")
    model = get_model("reader")
    system_prompt = load_prompt()
    papers = get_triaged_for_reading(limit=batch_size)

    if not papers:
        logger.info("No papers ready for Reader.")
        return {"processed": 0}

    logger.info(f"Reader: reading {len(papers)} papers...")

    stats = {"processed": 0, "errors": 0}

    for i, paper in enumerate(papers):
        success = read_one(client, model, paper, system_prompt)
        if success:
            stats["processed"] += 1
            logger.info(f"[{paper['paper_id']}] Deep read complete")
        else:
            stats["errors"] += 1

        # Rate limiting: 2s between calls (reader sends much more data)
        if i < len(papers) - 1:
            import time
            time.sleep(2)

    logger.info(f"Reader done: {stats}")
    return stats


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(message)s")
    from agents.config import ensure_dirs, READER_BATCH_SIZE
    ensure_dirs()
    from agents.db_utils import ensure_columns
    ensure_columns()
    run(READER_BATCH_SIZE)
