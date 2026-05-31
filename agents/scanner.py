"""
Agent 0: Scanner — Live literature scanning.
Searches arXiv and economics venues for new papers relevant to the researcher's profile.
Inspired by Junshi's daily literature monitoring.

Runs before Scout in the pipeline to bring in fresh external papers.
"""

import json
import logging
import re
from datetime import date
from urllib.parse import quote_plus

from agents.config import get_client, get_model, KNOWLEDGE_BASE, PROMPTS_DIR

logger = logging.getLogger("scanner")

DIGESTS_DIR = KNOWLEDGE_BASE / "digests"

# Economics venue search patterns
VENUE_SEARCH_PATTERNS = {
    "AER": "site:aeaweb.org/articles {keywords}",
    "Econometrica": "site:econometricsociety.org {keywords}",
    "QJE": "site:academic.oup.com/qje {keywords}",
    "JPE": "site:journals.uchicago.edu/journal/jpe {keywords}",
    "REStud": "site:academic.oup.com/restud {keywords}",
    "RAND": "site:onlinelibrary.wiley.com/journal/17562171 {keywords}",
    "JHE": "site:sciencedirect.com/journal/journal-of-health-economics {keywords}",
    "NBER": "site:nber.org/papers {keywords}",
}

ARXIV_CATEGORIES = ["econ.EM", "econ.TH", "econ.GN", "stat.ME", "stat.ML", "cs.AI"]


def build_arxiv_url(categories: list[str], keywords: list[str], max_results: int = 50) -> str:
    """Build arXiv API query URL."""
    cat_query = "+OR+".join(f"cat:{c}" for c in categories)
    if keywords:
        kw_query = "+OR+".join(quote_plus(k) for k in keywords)
        query = f"({cat_query})+AND+({kw_query})"
    else:
        query = cat_query
    return (
        f"https://export.arxiv.org/api/query?"
        f"search_query={query}&start=0&max_results={max_results}"
        f"&sortBy=submittedDate&sortOrder=descending"
    )


def parse_arxiv_xml(xml_text: str) -> list[dict]:
    """Parse arXiv API XML response into paper dicts."""
    papers = []
    entries = re.findall(r"<entry>(.*?)</entry>", xml_text, re.DOTALL)
    for entry in entries:
        title = re.search(r"<title>(.*?)</title>", entry, re.DOTALL)
        summary = re.search(r"<summary>(.*?)</summary>", entry, re.DOTALL)
        arxiv_id = re.search(r"<id>(.*?)</id>", entry)
        authors = re.findall(r"<name>(.*?)</name>", entry)
        published = re.search(r"<published>(.*?)</published>", entry)

        if title:
            papers.append({
                "title": " ".join(title.group(1).split()),
                "abstract": " ".join(summary.group(1).split()) if summary else "",
                "arxiv_id": arxiv_id.group(1) if arxiv_id else "",
                "authors": authors[:5],
                "published": published.group(1)[:10] if published else "",
                "source": "arxiv",
            })
    return papers


def load_prompt() -> str:
    prompt_path = PROMPTS_DIR / "scanner.txt"
    if prompt_path.exists():
        return prompt_path.read_text()
    return ""


def run(keywords: list = None) -> dict:
    """
    Scan arXiv for new papers. Returns summary stats.

    If WebFetch is not available (no requests installed for URL fetching),
    falls back to generating a digest from the profile + existing knowledge.
    """
    from agents.profile import load_profile

    profile = load_profile()
    DIGESTS_DIR.mkdir(parents=True, exist_ok=True)
    today = date.today().isoformat()

    # Extract keywords from profile if not provided
    if not keywords:
        keywords = [
            "industrial organization", "health economics", "platform economics",
            "digital economy", "artificial intelligence", "causal inference",
            "difference in differences", "regression discontinuity",
        ]

    # Try to fetch arXiv
    arxiv_papers = []
    fetch_error = None
    try:
        import requests
        url = build_arxiv_url(ARXIV_CATEGORIES, keywords[:4], max_results=50)
        logger.info(f"Fetching arXiv: {url[:100]}...")
        resp = requests.get(url, timeout=30)
        if resp.status_code == 200:
            arxiv_papers = parse_arxiv_xml(resp.text)
            logger.info(f"Found {len(arxiv_papers)} arXiv papers")
        else:
            fetch_error = f"arXiv returned HTTP {resp.status_code}"
            logger.warning(fetch_error)
    except ImportError:
        logger.warning("requests not installed — skipping arXiv fetch")
    except Exception as e:
        fetch_error = f"arXiv fetch failed: {e}"
        logger.warning(fetch_error)

    if not arxiv_papers:
        logger.info("No arXiv papers found. Generating digest from existing knowledge only.")
        result = {"arxiv_papers": 0, "digest": None}
        if fetch_error is not None:
            result["error"] = fetch_error
        return result

    # Build context for Claude to generate a digest
    papers_text = ""
    for i, p in enumerate(arxiv_papers[:20], 1):
        papers_text += (
            f"\n### Paper {i}\n"
            f"**{p['title']}**\n"
            f"Authors: {', '.join(p['authors'])}\n"
            f"Published: {p['published']}\n"
            f"Abstract: {p['abstract'][:500]}\n"
        )

    client = get_client("scanner")
    model = get_model("scanner")
    system_prompt = (
        "You are a research digest generator for an economics researcher. "
        "Given their profile and recent arXiv papers, produce a daily digest with:\n"
        "1. **Today's Landscape** (2-3 sentences: what's the field doing?)\n"
        "2. **Top Papers** (5-8 most relevant, with: title, core idea, key insight, what it leaves open, relevance to researcher)\n"
        "3. **Quick Ideas** (3-5 bold ideas inspired by these papers + researcher's profile. "
        "Each idea needs: title, pitch (2 sentences), why now, first experiment, main risk)\n"
        "Be bold, not safe. Think like a 军师."
    )

    try:
        response = client.messages.create(
            model=model,
            max_tokens=4096,
            system=system_prompt,
            messages=[{
                "role": "user",
                "content": (
                    f"## Researcher Profile\n{profile}\n\n"
                    f"## Recent arXiv Papers (last few days)\n{papers_text}"
                ),
            }],
        )
        digest_text = response.content[0].text.strip()
    except Exception as e:
        logger.error(f"Digest generation failed: {e}")
        return {"arxiv_papers": len(arxiv_papers), "digest": None, "error": str(e)}

    # Save digest
    digest_path = DIGESTS_DIR / f"{today}.md"
    header = f"# Research Digest — {today}\n\n"
    digest_path.write_text(header + digest_text)
    logger.info(f"Digest saved to {digest_path}")

    return {"arxiv_papers": len(arxiv_papers), "digest": str(digest_path)}


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(message)s")
    from agents.config import ensure_dirs
    ensure_dirs()
    result = run()
    print(result)
