"""Classify atoms into thematic categories using keyword matching."""
import sqlite3
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Theme dictionaries
# ---------------------------------------------------------------------------

METHOD_THEMES = {
    "Difference-in-Differences": [
        "difference-in-diff", "did ", " did", "staggered", "event study",
        "two-way fixed", "twfe", "parallel trend", "diff-in-diff",
    ],
    "Instrumental Variables": [
        "instrumental variable", " iv ", "2sls", "two-stage", " late ",
        "wald estimator",
    ],
    "Regression Discontinuity": [
        "regression discontinuity", "rdd", "rd design", "fuzzy rd",
        "sharp rd", "running variable",
    ],
    "Structural Estimation": [
        "structural estimation", "structural model", " blp", " gmm",
        "maximum likelihood", " mle", "moment condition", "counterfactual simul",
    ],
    "Randomized Experiments": [
        "rct", "randomiz", "experiment", "random assignment", "treatment group",
        "control group", "field experiment",
    ],
    "Machine Learning": [
        "machine learning", " ml ", "random forest", "neural network",
        "xgboost", "lasso", "gradient boost", "deep learning",
        "prediction model", "causal forest",
    ],
    "Panel Methods": [
        "panel", "fixed effect", "within estimator", "between estimator",
        "hausman", "correlated random",
    ],
    "Matching & Weighting": [
        "matching", "propensity score", "inverse probability",
        "entropy balanc", "coarsened exact", "nearest neighbor",
    ],
    "Synthetic Control": [
        "synthetic control", "synthetic diff", "donor pool", "pre-treatment",
    ],
    "Survey & Descriptive": [
        "survey", "descriptive", "summary statistic", "tabulation",
        "cross-section",
    ],
    "Time Series": [
        "time series", " var ", "arima", "impulse response", "granger",
        "cointegrat", "autoregress",
    ],
    "Spatial Methods": [
        "spatial", "geographic", " gis", "gravity model", "distance decay",
    ],
    "Bayesian Methods": [
        "bayesian", "mcmc", "posterior", "prior distribution",
    ],
    "Bunching & Kink": [
        "bunching", " kink", " notch", "threshold",
    ],
    "Other Methods": [],  # catch-all
}

MECHANISM_THEMES = {
    "Market Power & Competition": [
        "market power", "markup", "monopol", "oligopol", "competition",
        "entry", "barrier", "concentration",
    ],
    "Information & Signaling": [
        "information", "signal", "asymmetr", "adverse selection",
        "moral hazard", "screening", "disclosure",
    ],
    "Incentives & Contracts": [
        "incentive", "contract", "principal-agent", "moral hazard",
        "compensation", "reward",
    ],
    "Human Capital & Skills": [
        "human capital", "skill", "education", "training", "learning",
        "experience", "ability",
    ],
    "Technology & Innovation": [
        "technolog", "innovat", "r&d", "patent", "diffusion", "adoption",
        "automat", " ai ", "digital",
    ],
    "Behavioral": [
        "behavioral", "bias", "heuristic", "bounded rational",
        "present bias", "loss aversion", "anchoring",
    ],
    "Insurance & Risk": [
        "insurance", "risk", "moral hazard", "adverse selection",
        "coverage", "premium",
    ],
    "Labor Market": [
        "wage", "employment", "labor", "hiring", "firing", "search",
        "matching", "unemploy",
    ],
    "Trade & Globalization": [
        "trade", "tariff", "export", "import", "offshoring", "global",
        "comparative advantage",
    ],
    "Regulation & Policy": [
        "regulat", "policy", "subsidy", " tax", "mandate", "compliance",
        "enforcement",
    ],
    "Health & Healthcare": [
        "health", "hospital", "physician", "patient", "medical",
        "pharmaceutical", "diagnos",
    ],
    "Spatial & Urban": [
        "spatial", "urban", "agglomerat", "city", "location", "commut",
        "housing",
    ],
    "Other Mechanisms": [],  # catch-all
}

DATASET_THEMES = {
    "Government Administrative": [
        "census", "administrative", "government", "federal", " irs",
        " ssa", " cms", "medicare", "medicaid",
    ],
    "Survey Data": [
        "survey", "psid", " cps", " acs", "nlsy", " hrs", "sipp", "atus",
    ],
    "Health Data": [
        "health", "hospital", "claims", " ehr", "medical", "patient",
        "clinical",
    ],
    "Financial Data": [
        "financial", "stock", "crsp", "compustat", "bank", "credit", "loan",
    ],
    "Trade Data": [
        "trade", "customs", "tariff", "import", "export", "comtrade",
    ],
    "Education Data": [
        "education", "school", "student", "teacher", "college", "university",
    ],
    "Firm/Establishment": [
        "firm", "establishment", "business", "employer", " lbd", "qcew",
    ],
    "Consumer/Retail": [
        "consumer", "retail", "nielsen", "scanner", "purchase", "price",
    ],
    "Labor Market": [
        "labor", "employment", "wage", "occupation", "o*net", " job",
    ],
    "Geospatial": [
        "geographic", " gis", "satellite", "remote sensing", "location",
    ],
    "Other Data": [],  # catch-all
}

PUZZLE_THEMES = {
    "Market Anomalies": [
        "anomal", "puzzle", "paradox", "excess return", "premium",
    ],
    "Policy Puzzles": [
        "policy", "regulat", "welfare", "redistrib",
    ],
    "Behavioral Puzzles": [
        "behavioral", "bias", "irration", "overconfid",
    ],
    "Other Puzzles": [],  # catch-all
}


def classify_atom(title: str, description: str, atom_type: str) -> str:
    """Classify a single atom into a theme based on its title and description."""
    text = f" {title} {description or ''} ".lower()

    if atom_type == "method":
        themes = METHOD_THEMES
    elif atom_type == "mechanism":
        themes = MECHANISM_THEMES
    elif atom_type == "dataset":
        themes = DATASET_THEMES
    elif atom_type == "puzzle":
        themes = PUZZLE_THEMES
    else:
        return f"Other {atom_type.title()}s"

    for theme, keywords in themes.items():
        if not keywords:
            continue  # skip catch-all
        for kw in keywords:
            if kw.lower() in text:
                return theme

    # Catch-all
    if atom_type == "method":
        return "Other Methods"
    elif atom_type == "mechanism":
        return "Other Mechanisms"
    elif atom_type == "dataset":
        return "Other Data"
    elif atom_type == "puzzle":
        return "Other Puzzles"
    return f"Other {atom_type.title()}s"


def run_classification():
    import os
    db_path = os.path.join(os.path.dirname(__file__), "kb.db")
    conn = sqlite3.connect(db_path)

    # Add theme column if not exists
    try:
        conn.execute("ALTER TABLE atoms ADD COLUMN theme TEXT")
        logger.info("Added 'theme' column to atoms table")
    except sqlite3.OperationalError:
        logger.info("'theme' column already exists")

    atoms = conn.execute(
        "SELECT slug, title, description, type FROM atoms"
    ).fetchall()

    counts: dict[str, int] = {}
    for slug, title, desc, atype in atoms:
        theme = classify_atom(title, desc or "", atype)
        conn.execute(
            "UPDATE atoms SET theme = ? WHERE slug = ?", (theme, slug)
        )
        key = f"{atype}:{theme}"
        counts[key] = counts.get(key, 0) + 1

    conn.commit()

    # Report
    print("\n--- Atom Theme Classification Results ---")
    for key in sorted(counts.keys()):
        print(f"  {key}: {counts[key]}")

    classified = conn.execute(
        "SELECT COUNT(*) FROM atoms WHERE theme IS NOT NULL AND theme NOT LIKE 'Other%'"
    ).fetchone()[0]
    total = conn.execute("SELECT COUNT(*) FROM atoms").fetchone()[0]
    print(f"\nClassified: {classified}/{total} ({100*classified/total:.0f}%)")

    # Show type breakdown
    for atype in ["method", "mechanism", "dataset", "puzzle"]:
        type_total = conn.execute(
            "SELECT COUNT(*) FROM atoms WHERE type = ?", (atype,)
        ).fetchone()[0]
        type_classified = conn.execute(
            "SELECT COUNT(*) FROM atoms WHERE type = ? AND theme IS NOT NULL AND theme NOT LIKE 'Other%'",
            (atype,),
        ).fetchone()[0]
        if type_total > 0:
            print(f"  {atype}: {type_classified}/{type_total} ({100*type_classified/type_total:.0f}%)")

    conn.close()


if __name__ == "__main__":
    run_classification()
