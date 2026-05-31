#!/usr/bin/env python3
"""Create a small public demo SQLite database for Lit Panel."""

from __future__ import annotations

import argparse
import json
import os
import sqlite3
import sys
from datetime import date
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = ROOT / "backend"


PAPERS = [
    {
        "paper_id": "demo-001",
        "title": "Wage Posting and the Geography of Monopsony Power",
        "authors": ["Maya Chen", "Julian Hart", "Elena Rossi"],
        "year": 2026,
        "fields": ["Labor Economics", "Industrial Organization"],
        "jel": ["J42", "J31", "L13"],
        "score": 4.7,
        "summary": "A synthetic panel shows how wage-posting frictions can generate persistent local wage dispersion.",
    },
    {
        "paper_id": "demo-002",
        "title": "Credit Constraints and Climate Adaptation in Smallholder Agriculture",
        "authors": ["Amina Okafor", "Leo Marin"],
        "year": 2026,
        "fields": ["Development Economics", "Environmental Economics"],
        "jel": ["O13", "Q54"],
        "score": 4.5,
        "summary": "A randomized demo study links liquidity timing to adoption of heat-resistant inputs.",
    },
    {
        "paper_id": "demo-003",
        "title": "Algorithmic Pricing in Decentralized Markets",
        "authors": ["Noah Singh", "Clara Bell", "Mateo Alvarez"],
        "year": 2025,
        "fields": ["Industrial Organization", "Digital Economy"],
        "jel": ["L13", "D43"],
        "score": 4.3,
        "summary": "Agent-based simulations illustrate when adaptive pricing rules mimic tacit collusion.",
    },
    {
        "paper_id": "demo-004",
        "title": "School-Choice Mechanism Design under Strategic Reporting",
        "authors": ["Iris Novak", "Priya Raman"],
        "year": 2025,
        "fields": ["Public Economics", "Education"],
        "jel": ["I24", "D47"],
        "score": 4.1,
        "summary": "A clean example of matching-market rules and reporting incentives in school assignment.",
    },
    {
        "paper_id": "demo-005",
        "title": "Remote Work and the Shape of Urban Wage Premia",
        "authors": ["Maya Chen", "Daniel Reed"],
        "year": 2024,
        "fields": ["Urban Economics", "Labor Economics"],
        "jel": ["R23", "J31"],
        "score": 4.0,
        "summary": "Synthetic commuting zones reveal how hybrid work reshapes skill sorting and wage premia.",
    },
    {
        "paper_id": "demo-006",
        "title": "Public Procurement Scores and Supplier Entry",
        "authors": ["Clara Bell", "Sofia Duarte"],
        "year": 2024,
        "fields": ["Public Economics", "Industrial Organization"],
        "jel": ["H57", "L15"],
        "score": 3.9,
        "summary": "A scoring-rule demo shows when transparent procurement expands the supplier base.",
    },
    {
        "paper_id": "demo-007",
        "title": "Health Insurance Networks and Preventive Care Take-Up",
        "authors": ["Elena Rossi", "Amina Okafor"],
        "year": 2023,
        "fields": ["Health Economics", "Public Economics"],
        "jel": ["I13", "I18"],
        "score": 3.8,
        "summary": "A compact network example connects provider access to preventive-care use.",
    },
    {
        "paper_id": "demo-008",
        "title": "Inventor Teams and the Diffusion of Green Patents",
        "authors": ["Julian Hart", "Noah Singh"],
        "year": 2023,
        "fields": ["Innovation Economics", "Environmental Economics"],
        "jel": ["O31", "Q55"],
        "score": 3.7,
        "summary": "A citation-network demo follows how team composition predicts clean-tech diffusion.",
    },
]


ATOMS = [
    ("shift-share-iv", "method", "Shift-share IV", "Instrumental variation built from exposure shares and aggregate shocks.", "strong", "Identification"),
    ("difference-in-differences", "method", "Difference-in-Differences", "Compares changes across treated and control units over time.", "strong", "Identification"),
    ("monopsony-power", "mechanism", "Monopsony power", "Employers face upward-sloping labor supply and can set wages below marginal product.", "moderate", "Labor Markets"),
    ("search-frictions", "mechanism", "Search frictions", "Workers and firms do not instantly meet, producing wage dispersion and delayed adjustment.", "moderate", "Labor Markets"),
    ("liquidity-constraint", "mechanism", "Liquidity constraint", "Short-run financing gaps prevent otherwise profitable investment.", "moderate", "Development"),
    ("climate-adaptation", "puzzle", "Climate adaptation", "Who adapts, when, and why adjustment remains incomplete.", "emerging", "Climate"),
    ("algorithmic-pricing", "mechanism", "Algorithmic pricing", "Automated rules can amplify strategic interdependence across sellers.", "moderate", "Digital Markets"),
    ("tacit-collusion", "puzzle", "Tacit collusion", "Market outcomes look coordinated without explicit communication.", "emerging", "Industrial Organization"),
    ("deferred-acceptance", "method", "Deferred acceptance", "A matching mechanism that iteratively rejects low-priority assignments.", "strong", "Market Design"),
    ("strategic-reporting", "mechanism", "Strategic reporting", "Participants alter stated preferences when rules reward misrepresentation.", "moderate", "Market Design"),
    ("administrative-claims", "dataset", "Administrative claims", "Structured enrollment, billing, and service-use records.", "strong", "Health"),
    ("patent-citations", "dataset", "Patent citations", "Links among patents used to study innovation diffusion.", "moderate", "Innovation"),
]


PAPER_ATOMS = {
    "demo-001": ["monopsony-power", "search-frictions", "shift-share-iv"],
    "demo-002": ["liquidity-constraint", "climate-adaptation", "difference-in-differences"],
    "demo-003": ["algorithmic-pricing", "tacit-collusion"],
    "demo-004": ["deferred-acceptance", "strategic-reporting"],
    "demo-005": ["search-frictions", "shift-share-iv"],
    "demo-006": ["algorithmic-pricing", "difference-in-differences"],
    "demo-007": ["administrative-claims", "difference-in-differences"],
    "demo-008": ["patent-citations", "climate-adaptation"],
}


SCORE_DIMENSIONS = [
    "identification",
    "data_quality",
    "contribution",
    "external_validity",
    "clarity",
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--db",
        default=str(ROOT / "backend" / "kb.db"),
        help="Path to the SQLite database to create.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Replace an existing database at --db.",
    )
    return parser.parse_args()


def ensure_schema(db_path: Path, force: bool) -> None:
    if db_path.exists() and not force:
        raise SystemExit(f"{db_path} already exists. Pass --force to replace it.")
    for suffix in ("", "-wal", "-shm"):
        path = Path(f"{db_path}{suffix}")
        if path.exists():
            path.unlink()

    db_path.parent.mkdir(parents=True, exist_ok=True)
    os.environ["KB_DB_PATH"] = str(db_path)
    sys.path.insert(0, str(ROOT))
    sys.path.insert(0, str(BACKEND_DIR))

    from database import init_db

    init_db()


def json_text(value: object) -> str:
    return json.dumps(value, ensure_ascii=False)


def get_default_library_id(cur: sqlite3.Cursor) -> int:
    row = cur.execute("SELECT id FROM libraries ORDER BY id LIMIT 1").fetchone()
    if row is None:
        raise RuntimeError("No default library was created.")
    library_id = int(row[0])
    data_root = ROOT / "Data"
    papers_dir = data_root / "papers" / "source-library"
    knowledge_base_dir = data_root / "knowledge_base" / "source-library"
    agent_db_path = data_root / "source-library_agent.db"
    papers_dir.mkdir(parents=True, exist_ok=True)
    knowledge_base_dir.mkdir(parents=True, exist_ok=True)
    cur.execute(
        """
        UPDATE libraries
        SET slug = ?, name = ?, discipline = ?, description = ?, papers_dir = ?, knowledge_base_dir = ?, agent_db_path = ?
        WHERE id = ?
        """,
        (
            "source-library",
            "Demo Library",
            "Economics",
            "Synthetic public demo corpus for Lit Panel.",
            str(papers_dir),
            str(knowledge_base_dir),
            str(agent_db_path),
            library_id,
        ),
    )
    return library_id


def seed_papers(cur: sqlite3.Cursor, library_id: int) -> None:
    for paper in PAPERS:
        cur.execute(
            """
            INSERT INTO papers
            (paper_id, title, authors, year, fields, jel, triage_decision, triage_summary, average_score, has_card, abstract, nber_url)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
            """,
            (
                paper["paper_id"],
                paper["title"],
                json_text(paper["authors"]),
                paper["year"],
                json_text(paper["fields"]),
                json_text(paper["jel"]),
                "include",
                paper["summary"],
                paper["score"],
                paper["summary"],
                f"https://example.org/papers/{paper['paper_id']}",
            ),
        )
        cur.execute(
            "INSERT INTO library_papers (library_id, paper_id, source_path, file_sha256) VALUES (?, ?, ?, ?)",
            (library_id, paper["paper_id"], "", ""),
        )
        cur.execute(
            """
            INSERT INTO triage_cards
            (paper_id, title, authors, fields, methods, relevance, decision, summary, year, triaged_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                paper["paper_id"],
                paper["title"],
                json_text(paper["authors"]),
                json_text(paper["fields"]),
                json_text(["research design", "causal evidence"]),
                int(round(float(paper["score"]) * 20)),
                "include",
                paper["summary"],
                paper["year"],
                date.today().isoformat(),
            ),
        )
        cur.execute(
            """
            INSERT INTO paper_processing_state
            (library_id, paper_id, processing_status, reading_profile, analysis_focuses, reading_status)
            VALUES (?, ?, 'completed', 'deep-read', ?, 'read')
            """,
            (library_id, paper["paper_id"], json_text(["identification", "data", "contribution"])),
        )
        for idx, dimension in enumerate(SCORE_DIMENSIONS):
            score = max(1, min(5, int(round(float(paper["score"]) + ((idx % 2) * 0.3 - 0.15)))))
            cur.execute(
                "INSERT INTO paper_scores (paper_id, dimension, score) VALUES (?, ?, ?)",
                (paper["paper_id"], dimension, score),
            )
        for section, content in [
            ("Setup", paper["summary"]),
            ("Finding", f"The demo card highlights how {paper['fields'][0].lower()} evidence can be organized into reusable atoms."),
            ("Mechanism", "The example separates question, method, data, and contribution so the UI can be inspected without private data."),
        ]:
            cur.execute(
                "INSERT INTO card_sections (paper_id, section, content) VALUES (?, ?, ?)",
                (paper["paper_id"], section, content),
            )


def seed_atoms(cur: sqlite3.Cursor) -> None:
    for slug, atom_type, title, description, strength, theme in ATOMS:
        cur.execute(
            """
            INSERT INTO atoms
            (slug, type, title, description, evidence_strength, when_to_use, access, url, key_references, theme)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                slug,
                atom_type,
                title,
                description,
                strength,
                "Use this atom as a public demo concept.",
                "Demo",
                "",
                json_text([]),
                theme,
            ),
        )
    for paper_id, atom_slugs in PAPER_ATOMS.items():
        for slug in atom_slugs:
            cur.execute(
                "INSERT INTO atom_paper_refs (atom_slug, paper_id) VALUES (?, ?)",
                (slug, paper_id),
            )


def seed_maps_and_ideas(cur: sqlite3.Cursor, library_id: int) -> None:
    field_map = """# Demo Atlas

This public seed contains synthetic papers and atoms only. Replace it with your own corpus by importing PDFs or pointing `KB_DB_PATH` at a private database.
"""
    cur.execute(
        "INSERT INTO field_maps (slug, title, content, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)",
        ("demo-atlas", "Demo Atlas", field_map),
    )
    cur.execute(
        "INSERT INTO library_field_maps (library_id, slug, title, content, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)",
        (library_id, "demo-atlas", "Demo Atlas", field_map),
    )
    ideas = [
        ("idea-001", "Measure how search frictions alter wage-posting pass-through.", ["demo-001", "demo-005"], 4.1),
        ("idea-002", "Compare procurement score transparency across synthetic supplier markets.", ["demo-006"], 3.8),
        ("idea-003", "Map green patent diffusion through inventor-team composition.", ["demo-008"], 3.7),
    ]
    for idea_id, title, source_papers, composite in ideas:
        content = f"Demo idea generated from {', '.join(source_papers)}."
        idea_values = (
            idea_id,
            title,
            date.today().isoformat(),
            json_text(source_papers),
            content,
            composite,
        )
        cur.execute(
            """
            INSERT INTO ideas
            (id, title, status, generated_date, heuristic, source_papers, content, novelty, feasibility, impact, composite)
            VALUES (?, ?, 'new', ?, 'demo-seed', ?, ?, 4, 4, 4, ?)
            """,
            idea_values,
        )
        cur.execute(
            """
            INSERT INTO library_ideas
            (library_id, id, title, status, generated_date, heuristic, source_papers, content, novelty, feasibility, impact, composite)
            VALUES (?, ?, ?, 'new', ?, 'demo-seed', ?, ?, 4, 4, 4, ?)
            """,
            (library_id, idea_id, title, idea_values[2], idea_values[3], content, composite),
        )


def rebuild_search_index(cur: sqlite3.Cursor, library_id: int) -> None:
    cur.execute("DELETE FROM search_index")
    for paper in PAPERS:
        cur.execute(
            """
            INSERT INTO search_index (entity_type, entity_id, title, content, library_id)
            VALUES ('paper', ?, ?, ?, ?)
            """,
            (paper["paper_id"], paper["title"], paper["summary"], library_id),
        )
    for slug, atom_type, title, description, _strength, theme in ATOMS:
        cur.execute(
            """
            INSERT INTO search_index (entity_type, entity_id, title, content, library_id)
            VALUES ('atom', ?, ?, ?, ?)
            """,
            (slug, title, f"{atom_type} {theme} {description}", library_id),
        )


def seed_demo_db(db_path: Path) -> None:
    conn = sqlite3.connect(str(db_path))
    try:
        cur = conn.cursor()
        library_id = get_default_library_id(cur)
        seed_papers(cur, library_id)
        seed_atoms(cur)
        seed_maps_and_ideas(cur, library_id)
        rebuild_search_index(cur, library_id)
        conn.commit()
    finally:
        conn.close()


def main() -> None:
    args = parse_args()
    db_path = Path(args.db).resolve()
    ensure_schema(db_path, force=args.force)
    seed_demo_db(db_path)
    print(f"Created demo database: {db_path}")


if __name__ == "__main__":
    main()
