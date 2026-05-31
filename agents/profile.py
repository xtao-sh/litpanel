"""
Researcher profile management.
Inspired by Junshi: ideas should build on YOUR specific skills, methods, and open problems.
"""

from pathlib import Path

from agents.config import KNOWLEDGE_BASE

PROFILE_PATH = KNOWLEDGE_BASE / "profile.md"

DEFAULT_PROFILE = """\
# Researcher Profile

## Research Area
Economics — empirical microeconomics

## Core Fields
1. Industrial Organization (IO) — market structure, platform economics, competition policy
2. Health Economics — healthcare markets, insurance, health policy
3. Digital Economy & AI — artificial intelligence, digitization, automation
4. Product Innovation — innovation economics, R&D, technology diffusion
5. Empirical Methods — causal inference, structural estimation, experimental design

## Methods I Know Well
- Difference-in-Differences (DID, stacked DID, Sun-Abraham)
- Instrumental Variables (IV / 2SLS)
- Regression Discontinuity (RD)
- Structural estimation (BLP-style demand, entry models)
- Event study designs
- Panel fixed effects

## Research Context
- Based in China
- Strong interest in applying methods/findings from US/EU literature to the Chinese context
- Access to Chinese administrative and survey data

## Research Taste
- Prefers clean identification over complex structural models
- Values surprising findings that challenge conventional wisdom
- Interested in policy-relevant research with real-world impact
- Appreciates methodological innovation that can be applied broadly

## Open Problems I'm Thinking About
(Update this section as you develop research interests)

## Preliminary Results & Observations
(Add your own observations, surprising findings, or early results here.
Format: - [Date] [Observation] → [What it might imply])

## Target Venues
- AER (American Economic Review)
- Econometrica
- QJE (Quarterly Journal of Economics)
- JPE (Journal of Political Economy)
- REStud (Review of Economic Studies)
- RAND Journal of Economics
- Journal of Health Economics
- Journal of Industrial Economics

## Last Updated
2026-03-23
"""


def load_profile() -> str:
    """Load the researcher profile, creating default if needed."""
    if not PROFILE_PATH.exists():
        PROFILE_PATH.write_text(DEFAULT_PROFILE)
    return PROFILE_PATH.read_text()


def update_profile(new_content: str):
    """Overwrite the profile."""
    PROFILE_PATH.write_text(new_content)
