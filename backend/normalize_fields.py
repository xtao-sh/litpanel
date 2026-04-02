"""Normalize all paper field names to a canonical taxonomy."""
from __future__ import annotations

import sqlite3
import json
import re
from typing import Optional

# Canonical field taxonomy (human-readable)
CANONICAL_FIELDS = {
    # Triage snake_case -> canonical
    "io": "Industrial Organization",
    "health_econ": "Health Economics",
    "labor": "Labor Economics",
    "empirical_methods": "Empirical Methods",
    "public_econ": "Public Economics",
    "macro": "Macroeconomics",
    "finance": "Finance",
    "trade": "International Trade",
    "development": "Development Economics",
    "education": "Education",
    "political_econ": "Political Economy",
    "digital_econ": "Digital Economy & AI",
    "innovation": "Innovation & Entrepreneurship",
    "urban": "Urban Economics",
    "environment": "Environmental Economics",
    "behavioral": "Behavioral Economics",
    "history": "Economic History",
    "theory": "Economic Theory",
    "monetary": "Monetary Economics",
    "org_econ": "Organizational Economics",
    "law_econ": "Law & Economics",
    "demographics": "Demographics",
    "agriculture": "Agricultural Economics",
    "energy": "Energy Economics",
    "real_estate": "Real Estate",
    "insurance": "Insurance",
    "crime": "Economics of Crime",

    # Title Case -> canonical (common variants from card papers)
    "Industrial Organization": "Industrial Organization",
    "Health Economics": "Health Economics",
    "Labor Economics": "Labor Economics",
    "Labor Studies": "Labor Economics",
    "Causal Inference": "Empirical Methods",
    "Econometrics": "Empirical Methods",
    "Empirical Microeconomics": "Empirical Methods",
    "Empirical IO": "Empirical Methods",
    "Panel Data Methods": "Empirical Methods",
    "Computational Methods": "Empirical Methods",
    "Experimental Economics": "Empirical Methods",
    "Digital Economy": "Digital Economy & AI",
    "Digital Economy & AI": "Digital Economy & AI",
    "Digital Economics": "Digital Economy & AI",
    "AI Economics": "Digital Economy & AI",
    "Public Economics": "Public Economics",
    "Public Finance": "Public Economics",
    "Consumer Finance": "Finance",
    "Financial Economics": "Finance",
    "Corporate Finance": "Finance",
    "Asset Pricing": "Finance",
    "International Trade": "International Trade",
    "Firm-to-Firm Trade": "International Trade",
    "International Finance and Macroeconomics": "Macroeconomics",
    "Economic Fluctuations and Growth": "Macroeconomics",
    "Development Economics": "Development Economics",
    "Behavioral Economics": "Behavioral Economics",
    "Finance": "Finance",
    "Macroeconomics": "Macroeconomics",
    "Monetary Economics": "Monetary Economics",
    "Political Economy": "Political Economy",
    "Urban Economics": "Urban Economics",
    "Economic Geography": "Urban Economics",
    "Environmental Economics": "Environmental Economics",
    "Environment and Energy Economics": "Environmental Economics",
    "Education": "Education",
    "Economics of Education": "Education",
    "Economic History": "Economic History",
    "Innovation": "Innovation & Entrepreneurship",
    "Innovation Economics": "Innovation & Entrepreneurship",
    "Productivity, Innovation, and Entrepreneurship": "Innovation & Entrepreneurship",
    "Organizational Economics": "Organizational Economics",
    "Law and Economics": "Law & Economics",
    "Law & Economics": "Law & Economics",
    "Health Care": "Health Economics",
    "Children and Families": "Demographics",
    "Economics of Aging": "Demographics",
    "Demographics": "Demographics",
    "Agricultural Economics": "Agricultural Economics",
    "Energy Economics": "Energy Economics",
    "Real Estate": "Real Estate",
    "Insurance": "Insurance",
    "Economics of Crime": "Economics of Crime",
    "Economic Theory": "Economic Theory",
    "Bargaining Theory": "Economic Theory",
    "Regulation": "Public Economics",
    "Antitrust/Competition Policy": "Industrial Organization",
    "Market Power": "Industrial Organization",
    "Marketing": "Industrial Organization",
    "Mergers & Acquisitions": "Industrial Organization",
    "Product Variety": "Industrial Organization",
    "Production Networks": "Industrial Organization",
    "Structural Change": "Macroeconomics",
    "Economic Growth": "Macroeconomics",
    "Firm Productivity": "Industrial Organization",
    "Chinese Economy": "Development Economics",
    "Pharmaceutical Economics": "Health Economics",

    # Additional mappings for remaining high-count fields
    "other": None,  # drop generic "other"
    "Applied Microeconomics": "Empirical Methods",
    "Machine Learning": "Digital Economy & AI",
    "Machine Learning/AI": "Digital Economy & AI",
    "AI/ML": "Digital Economy & AI",
    "AI/ML Systems Design": "Digital Economy & AI",
    "AI/ML in Economics": "Digital Economy & AI",
    "AI/Machine Learning": "Digital Economy & AI",
    "Applied Machine Learning": "Digital Economy & AI",
    "Artificial Intelligence": "Digital Economy & AI",
    "AI & Society": "Digital Economy & AI",
    "AI Policy": "Digital Economy & AI",
    "Digital Health/AI": "Digital Economy & AI",
    "Text Analysis/AI": "Digital Economy & AI",
    "Natural Language Processing": "Digital Economy & AI",
    "Text Analysis": "Digital Economy & AI",
    "Platform Economics": "Digital Economy & AI",
    "Digital Platforms": "Digital Economy & AI",
    "Digital Payments": "Digital Economy & AI",
    "E-commerce": "Digital Economy & AI",
    "Blockchain Economics": "Digital Economy & AI",
    "Cryptocurrency": "Digital Economy & AI",
    "DeFi": "Digital Economy & AI",
    "FinTech": "Finance",
    "Fintech": "Finance",
    "Banking": "Finance",
    "Corporate Governance": "Finance",
    "Private Equity": "Finance",
    "Venture Capital": "Finance",
    "Credit Markets": "Finance",
    "Consumer Credit": "Finance",
    "Market Microstructure": "Finance",
    "Revenue Management": "Finance",
    "Market Design": "Economic Theory",
    "Mechanism Design": "Economic Theory",
    "General Equilibrium": "Economic Theory",
    "Dynamic Games": "Economic Theory",
    "Dynamic Discrete Choice": "Economic Theory",
    "Dynamic Programming": "Economic Theory",
    "Dynamic Oligopoly": "Economic Theory",
    "Learning Models": "Economic Theory",
    "Search and Matching": "Economic Theory",
    "Spatial Economics": "Urban Economics",
    "Housing Economics": "Urban Economics",
    "Firm Dynamics": "Industrial Organization",
    "Antitrust Economics": "Industrial Organization",
    "Antitrust Law": "Industrial Organization",
    "Market Structure": "Industrial Organization",
    "Pharmaceutical Markets": "Industrial Organization",
    "Healthcare Markets": "Industrial Organization",
    "Retail Economics": "Industrial Organization",
    "Vertical Contracting": "Industrial Organization",
    "Supply Chain Economics": "Industrial Organization",
    "Consumer Demand": "Industrial Organization",
    "Consumer Search": "Industrial Organization",
    "Consumer Economics": "Industrial Organization",
    "Discrete Choice": "Industrial Organization",
    "Personnel Economics": "Labor Economics",
    "Gender Economics": "Labor Economics",
    "gender_econ": "Labor Economics",
    "Human Capital": "Labor Economics",
    "Remote Work": "Labor Economics",
    "Race": "Labor Economics",
    "Race and Economics": "Labor Economics",
    "Race/Ethnicity Studies": "Labor Economics",
    "Racial Disparities": "Labor Economics",
    "Public Health": "Health Economics",
    "Health Policy": "Health Economics",
    "Healthcare Policy": "Health Economics",
    "Medical Care Quality": "Health Economics",
    "Medical Technology": "Health Economics",
    "Clinical Medicine": "Health Economics",
    "Clinical Trials": "Health Economics",
    "Family Economics": "Demographics",
    "Child Welfare": "Demographics",
    "Demography": "Demographics",
    "Economic Demography": "Demographics",
    "Genoeconomics": "Demographics",
    "Science of Science": "Innovation & Entrepreneurship",
    "Science Policy": "Innovation & Entrepreneurship",
    "Science & Technology Policy": "Innovation & Entrepreneurship",
    "Research Funding": "Innovation & Entrepreneurship",
    "Intellectual Property": "Innovation & Entrepreneurship",
    "Patent Economics": "Innovation & Entrepreneurship",
    "Copyright Economics": "Innovation & Entrepreneurship",
    "Technology Economics": "Innovation & Entrepreneurship",
    "Technology Policy": "Innovation & Entrepreneurship",
    "Technology Transfer": "Innovation & Entrepreneurship",
    "Technology Management": "Innovation & Entrepreneurship",
    "Technology Measurement": "Innovation & Entrepreneurship",
    "Technological Change": "Innovation & Entrepreneurship",
    "R&D": "Innovation & Entrepreneurship",
    "R&D Strategy": "Innovation & Entrepreneurship",
    "Corporate Venture Capital": "Innovation & Entrepreneurship",
    "Strategic Alliances": "Innovation & Entrepreneurship",
    "Corporate Strategy": "Innovation & Entrepreneurship",
    "Intangible Capital": "Innovation & Entrepreneurship",
    "Knowledge Economics": "Innovation & Entrepreneurship",
    "Knowledge Management": "Innovation & Entrepreneurship",
    "Small Business Economics": "Innovation & Entrepreneurship",
    "Climate Economics": "Environmental Economics",
    "Natural Resource Economics": "Environmental Economics",
    "Endogenous Growth": "Macroeconomics",
    "Growth Economics": "Macroeconomics",
    "Heterogeneous Agent Models": "Macroeconomics",
    "Forecasting": "Macroeconomics",
    "Structural VAR": "Macroeconomics",
    "Industrial Policy": "Political Economy",
    "Judicial Politics": "Political Economy",
    "Social Movements": "Political Economy",
    "Geoeconomics": "Political Economy",
    "Defense Economics": "Political Economy",
    "Welfare Economics": "Public Economics",
    "Public Policy": "Public Economics",
    "Public Procurement": "Public Economics",
    "Policy Analysis": "Public Economics",
    "Policy Design": "Public Economics",
    "Tax Policy": "Public Economics",
    "Fiscal Federalism": "Public Economics",
    "Intergovernmental Transfers": "Public Economics",
    "Criminal Justice": "Economics of Crime",
    "Inequality": "Public Economics",
    "Privacy Economics": "Law & Economics",
    "Algorithmic Fairness": "Law & Economics",
    "Accounting": "Finance",
    "Management": "Organizational Economics",
    "Strategic Management": "Organizational Economics",
    "Strategy": "Organizational Economics",
    "Non-Profit Economics": "Organizational Economics",
    "Media Economics": "Digital Economy & AI",
    "Network Economics": "Digital Economy & AI",
    "Network Analysis": "Digital Economy & AI",
    "Social Networks": "Digital Economy & AI",
    "Data Science": "Digital Economy & AI",
    "Data Linkage": "Empirical Methods",
    "Record Linkage": "Empirical Methods",
    "Remote Sensing": "Empirical Methods",
    "Design-Based Inference": "Empirical Methods",
    "Econometric Methods": "Empirical Methods",
    "Experimental Methods": "Empirical Methods",
    "Experimental Design": "Empirical Methods",
    "Field Experiments": "Empirical Methods",
    "RCT Methods": "Empirical Methods",
    "Instrumental Variables": "Empirical Methods",
    "Difference-in-Differences": "Empirical Methods",
    "Nonparametric Statistics": "Empirical Methods",
    "Bayesian Statistics": "Empirical Methods",
    "Statistics": "Empirical Methods",
    "Spatial Statistics": "Empirical Methods",
    "Structural Methods": "Empirical Methods",
    "Synthetic Control": "Empirical Methods",
    "Research Methods": "Empirical Methods",
    "Methodology": "Empirical Methods",
    "Measurement": "Empirical Methods",
    "Measurement Error": "Empirical Methods",
    "Price Measurement": "Empirical Methods",
    "Productivity Measurement": "Empirical Methods",
    "Survey Methods": "Empirical Methods",
    "Survey Methodology": "Empirical Methods",
    "Time Series": "Empirical Methods",
    "Numerical Methods": "Empirical Methods",
    "Revealed Preference": "Empirical Methods",
    "Empirical Bayes Methods": "Empirical Methods",
    "Meta-Analysis": "Empirical Methods",
    "Meta-Science": "Empirical Methods",
    "Metascience": "Empirical Methods",
    "Economic Methodology": "Empirical Methods",
    "Open Science": "Empirical Methods",
    "Peer Review": "Empirical Methods",
    "Productivity Analysis": "Innovation & Entrepreneurship",
    "Productivity Economics": "Innovation & Entrepreneurship",
    "Cognitive Economics": "Behavioral Economics",
    "Economic Anthropology": "Economic History",
    "Sports Economics": "Labor Economics",
    "Language Economics": "Labor Economics",
    "Uncertainty": "Macroeconomics",
    "M&A": "Industrial Organization",
    "agricultural_econ": "Agricultural Economics",
    "financial_econ": "Finance",
    "Household Economics": "Finance",
    "Economic Policy": "Public Economics",
    "Economics of Science": "Innovation & Entrepreneurship",
}


def normalize_field(field: str) -> Optional[str]:
    """Map a field name to its canonical form. Returns None to drop."""
    # Direct lookup
    if field in CANONICAL_FIELDS:
        return CANONICAL_FIELDS[field]
    # Case-insensitive lookup
    lower = field.lower().strip()
    for k, v in CANONICAL_FIELDS.items():
        if k.lower() == lower:
            return v
    # Partial match (only for longer keys to avoid false positives)
    for k, v in CANONICAL_FIELDS.items():
        if len(k) >= 5 and (k.lower() in lower or lower in k.lower()):
            return v
    # Return as-is if no match (preserving original)
    return field


def run_normalization():
    conn = sqlite3.connect('kb.db')

    # Get all papers with fields
    rows = conn.execute("SELECT paper_id, fields FROM papers WHERE fields IS NOT NULL AND fields != '' AND fields != '[]'").fetchall()

    updated = 0
    for paper_id, fields_json in rows:
        try:
            fields = json.loads(fields_json)
            normalized = list(dict.fromkeys(
                nf for f in fields
                if (nf := normalize_field(f)) is not None
            ))  # dedupe while preserving order, drop None
            new_json = json.dumps(normalized)
            if new_json != fields_json:
                conn.execute("UPDATE papers SET fields = ? WHERE paper_id = ?", (new_json, paper_id))
                updated += 1
        except Exception:
            continue

    conn.commit()

    # Report
    all_fields = set()
    for r in conn.execute("SELECT fields FROM papers WHERE fields IS NOT NULL AND fields != ''").fetchall():
        try:
            for f in json.loads(r[0]):
                all_fields.add(f)
        except Exception:
            pass

    print(f"Updated {updated} papers. {len(all_fields)} distinct fields remaining.")
    for f in sorted(all_fields):
        count = 0
        for r in conn.execute("SELECT fields FROM papers WHERE fields LIKE ?", (f'%{f}%',)).fetchall():
            try:
                if f in json.loads(r[0]):
                    count += 1
            except Exception:
                pass
        print(f"  {f}: {count}")

    conn.close()


if __name__ == "__main__":
    run_normalization()
