"""Strawberry GraphQL schema for the NBER research knowledge base."""

from __future__ import annotations

from enum import Enum
from typing import Optional

import strawberry

import resolvers


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

@strawberry.enum
class PaperSort(Enum):
    YEAR_DESC = "year_desc"
    YEAR_ASC = "year_asc"
    SCORE_DESC = "score_desc"
    SCORE_ASC = "score_asc"
    ID_DESC = "id_desc"


# ---------------------------------------------------------------------------
# Input types
# ---------------------------------------------------------------------------

@strawberry.input
class ScoreDimensionFilter:
    dimension: str  # e.g., "empirical_rigor"
    min_score: int  # e.g., 4


@strawberry.input
class PaperFilter:
    search: Optional[str] = None
    fields: Optional[list[str]] = None
    year_min: Optional[int] = None
    year_max: Optional[int] = None
    score_min: Optional[float] = None
    score_max: Optional[float] = None
    triage_decision: Optional[list[str]] = None
    has_card: Optional[bool] = None
    authors: Optional[list[str]] = None
    methods: Optional[list[str]] = None
    score_dimensions: Optional[list[ScoreDimensionFilter]] = None
    atom_slugs: Optional[list[str]] = None


@strawberry.input
class AtomFilter:
    search: Optional[str] = None
    type: Optional[str] = None
    evidence_strength: Optional[str] = None
    access: Optional[str] = None
    theme: Optional[str] = None


# ---------------------------------------------------------------------------
# Object types
# ---------------------------------------------------------------------------

@strawberry.type
class PaperScore:
    dimension: str
    score: int


@strawberry.type
class CardSection:
    section: str
    content: str


@strawberry.type
class Paper:
    paper_id: str
    title: Optional[str]
    authors: list[str]
    year: Optional[int]
    fields: list[str]
    jel: list[str]
    triage_decision: Optional[str]
    average_score: Optional[float]
    has_card: bool
    abstract: Optional[str] = None
    nber_url: Optional[str] = None

    @strawberry.field
    async def scores(self) -> list[PaperScore]:
        rows = await resolvers.get_paper_scores(self.paper_id)
        return [PaperScore(dimension=r["dimension"], score=r["score"]) for r in rows]

    @strawberry.field
    async def sections(self) -> list[CardSection]:
        rows = await resolvers.get_card_sections(self.paper_id)
        return [CardSection(section=r["section"], content=r["content"]) for r in rows]

    @strawberry.field
    async def atoms(self) -> list[Atom]:
        rows = await resolvers.get_paper_atoms(self.paper_id)
        return [_dict_to_atom(r) for r in rows]

    @strawberry.field
    async def related_papers(self, limit: int = 10) -> list[RelatedPaper]:
        rows = await resolvers.get_related_papers_scored(self.paper_id, limit=limit)
        return [
            RelatedPaper(
                paper_id=r["paper_id"],
                title=r.get("title"),
                year=r.get("year"),
                average_score=r.get("average_score"),
                fields=r.get("fields", []),
                shared_atom_count=r.get("shared_atom_count", 0),
                shared_atoms=r.get("shared_atoms", []),
            )
            for r in rows
        ]

    @strawberry.field
    async def related_by_axis(self, axis: str = "all", limit: int = 10) -> list[RelatedPaper]:
        """Find related papers filtered by relationship axis.
        axis: 'all' | 'method' | 'dataset' | 'mechanism' | 'topic'
        """
        rows = await resolvers.get_related_papers_by_axis(
            self.paper_id, axis=axis, limit=limit
        )
        return [
            RelatedPaper(
                paper_id=r["paper_id"],
                title=r.get("title"),
                year=r.get("year"),
                average_score=r.get("average_score"),
                fields=r.get("fields", []),
                shared_atom_count=r.get("shared_atom_count", 0),
                shared_atoms=r.get("shared_atoms", []),
                similarity_score=r.get("similarity_score"),
            )
            for r in rows
        ]

    @strawberry.field
    async def similar_papers(self, limit: int = 10) -> list[SimilarPaper]:
        """Papers semantically similar (via embeddings), independent of atom links."""
        rows = await resolvers.get_similar_papers(self.paper_id, limit=limit)
        return [SimilarPaper(
            paper_id=r["paper_id"],
            title=r.get("title"),
            year=r.get("year"),
            average_score=r.get("average_score"),
            fields=r.get("fields", []),
            similarity_score=r.get("similarity_score", 0),
        ) for r in rows]

    @strawberry.field
    async def tldr(self) -> Optional[str]:
        return await resolvers.get_paper_tldr(self.paper_id)

    @strawberry.field
    async def idea_count(self) -> int:
        return await resolvers.get_idea_count_for_paper(self.paper_id)

    @strawberry.field
    async def is_bookmarked(self) -> bool:
        return await resolvers.is_bookmarked(self.paper_id)

    @strawberry.field
    async def reading_status(self) -> Optional[str]:
        return await resolvers.get_reading_status(self.paper_id)

    @strawberry.field
    async def user_note(self) -> Optional[str]:
        note_data = await resolvers.get_note("paper", self.paper_id)
        return note_data["note"] if note_data else None

    @strawberry.field
    async def backlink_notes(self) -> list[BacklinkNote]:
        rows = await resolvers.get_note_backlinks("paper", self.paper_id)
        return [
            BacklinkNote(
                entity_type=r["entity_type"],
                entity_id=r["entity_id"],
                note_preview=r["note_preview"],
            )
            for r in rows
        ]

    @strawberry.field
    async def debates(self) -> list[PaperDebate]:
        rows = await resolvers.get_paper_debates(self.paper_id)
        return [
            PaperDebate(
                title=r["title"],
                context=r["context"],
                paper_stance=r["paper_stance"],
                other_papers=r["other_papers"],
            )
            for r in rows
        ]


@strawberry.type
class Atom:
    slug: str
    type: str
    title: str
    description: Optional[str]
    evidence_strength: Optional[str]
    when_to_use: Optional[str]
    access: Optional[str]
    url: Optional[str]
    theme: Optional[str] = None

    @strawberry.field
    async def papers(self) -> list[Paper]:
        rows = await resolvers.get_atom_papers(self.slug)
        return [_dict_to_paper(r) for r in rows]

    @strawberry.field
    async def paper_count(self) -> int:
        return await resolvers.get_atom_paper_count(self.slug)

    @strawberry.field
    async def similar_atoms(self, limit: int = 10) -> list[SimilarAtom]:
        """Atoms semantically similar (via embeddings)."""
        rows = await resolvers.get_similar_atoms(self.slug, limit=limit)
        return [SimilarAtom(
            slug=r["slug"],
            type=r["type"],
            title=r["title"],
            description=r.get("description"),
            similarity_score=r.get("similarity_score", 0),
        ) for r in rows]

    @strawberry.field
    async def cooccurring_atoms(self, limit: int = 10) -> list[CooccurringAtom]:
        """Atoms that frequently appear alongside this one in the same papers."""
        rows = await resolvers.get_cooccurring_atoms(self.slug, limit=limit)
        return [CooccurringAtom(
            slug=r["slug"],
            type=r["type"],
            title=r["title"],
            description=r.get("description"),
            co_count=r.get("co_count", 0),
        ) for r in rows]

    @strawberry.field
    async def backlink_notes(self) -> list[BacklinkNote]:
        rows = await resolvers.get_note_backlinks("atom", self.slug)
        return [
            BacklinkNote(
                entity_type=r["entity_type"],
                entity_id=r["entity_id"],
                note_preview=r["note_preview"],
            )
            for r in rows
        ]


@strawberry.type
class FieldMap:
    slug: str
    title: str
    content: str


@strawberry.type
class IdeaEvaluation:
    idea_id: str
    verdict: Optional[str]
    novelty_score: Optional[int]
    identification_score: Optional[int]
    data_score: Optional[int]
    contribution_score: Optional[int]
    feasibility_score: Optional[int]
    overall_score: Optional[float]
    key_risk: Optional[str]
    next_steps: Optional[str]
    death_reason: Optional[str]
    evaluation_text: Optional[str]


@strawberry.type
class Idea:
    id: str
    title: str
    status: Optional[str]
    generated_date: Optional[str]
    heuristic: Optional[str]
    source_papers: list[str]
    content: Optional[str]
    novelty: Optional[int]
    feasibility: Optional[int]
    impact: Optional[int]
    composite: Optional[float]

    @strawberry.field
    async def evaluation(self) -> Optional[IdeaEvaluation]:
        data = await resolvers.get_idea_evaluation(self.id)
        if data is None:
            return None
        return IdeaEvaluation(
            idea_id=data["idea_id"],
            verdict=data.get("verdict"),
            novelty_score=data.get("novelty_score"),
            identification_score=data.get("identification_score"),
            data_score=data.get("data_score"),
            contribution_score=data.get("contribution_score"),
            feasibility_score=data.get("feasibility_score"),
            overall_score=data.get("overall_score"),
            key_risk=data.get("key_risk"),
            next_steps=data.get("next_steps"),
            death_reason=data.get("death_reason"),
            evaluation_text=data.get("evaluation_text"),
        )


@strawberry.type
class MethodFieldMatrix:
    methods: list[str]
    fields: list[str]
    matrix: list[list[int]]


@strawberry.type
class Digest:
    date: str
    content: str


@strawberry.type
class BacklinkNote:
    entity_type: str
    entity_id: str
    note_preview: str


@strawberry.type
class SearchHit:
    entity_type: str
    entity_id: str
    title: str
    snippet: str
    rank: float


@strawberry.type
class SearchResult:
    hits: list[SearchHit]
    total: int


@strawberry.type
class SimilarItem:
    entity_type: str
    entity_id: str
    title: str
    score: float


@strawberry.type
class WhatsNew:
    latest_papers: list[Paper]
    latest_papers_count: int
    recent_ideas_count: int
    total_papers: int


@strawberry.type
class PaperConnection:
    items: list[Paper]
    total: int


@strawberry.type
class AtomConnection:
    items: list[Atom]
    total: int


@strawberry.type
class NoteItem:
    entity_type: str
    entity_id: str
    note: str
    updated_at: str


@strawberry.type
class NoteConnection:
    items: list[NoteItem]
    total: int


@strawberry.type
class GraphNode:
    id: str
    label: str
    type: str
    size: Optional[float] = None
    year: Optional[int] = None
    fields: list[str]
    theme: Optional[str] = None
    paper_count: Optional[int] = None
    is_seed: bool = False


@strawberry.type
class GraphEdge:
    source: str
    target: str
    relation: str
    weight: float = 1.0


@strawberry.type
class NetworkGraph:
    nodes: list[GraphNode]
    edges: list[GraphEdge]
    mode: str
    source_paper_count: Optional[int] = None
    seed_count: int = 0
    total_paper_nodes: int = 0
    truncated: bool = False


@strawberry.type
class Collection:
    id: int
    name: str
    description: str
    paper_count: int
    created_at: str


@strawberry.type
class Project:
    slug: str
    title: str
    description: str
    status: str
    scope_type: str
    selection_rule: str
    paper_count: int
    paper_ids: list[str]
    updated_at: str
    overview_content: Optional[str] = None
    origin_type: Optional[str] = None
    origin_query: Optional[str] = None
    origin_filters_summary: Optional[str] = None
    source_paper_count: Optional[int] = None

    @strawberry.field
    async def papers(self) -> list[Paper]:
        rows = await resolvers.get_papers_by_ids(self.paper_ids)
        return [_dict_to_paper(r) for r in rows]

    @strawberry.field
    async def landscape(self) -> ResearchLandscapeResult:
        data = await resolvers.research_landscape(self.paper_ids)
        return _dict_to_research_landscape_result(data)


@strawberry.type
class RelatedPaper:
    paper_id: str
    title: Optional[str]
    year: Optional[int]
    average_score: Optional[float]
    fields: list[str]
    shared_atom_count: int
    shared_atoms: list[str]
    similarity_score: Optional[float] = None  # set when axis='topic'


@strawberry.type
class SimilarPaper:
    paper_id: str
    title: Optional[str]
    year: Optional[int]
    average_score: Optional[float]
    fields: list[str]
    similarity_score: float


@strawberry.type
class SimilarAtom:
    slug: str
    type: str
    title: str
    description: Optional[str]
    similarity_score: float


@strawberry.type
class CooccurringAtom:
    slug: str
    type: str
    title: str
    description: Optional[str]
    co_count: int


@strawberry.type
class MethodAdvice:
    slug: str
    title: str
    description: Optional[str]
    when_to_use: Optional[str]
    evidence_strength: Optional[str]
    paper_count: int
    relevance_score: float


@strawberry.type
class ClusterAtom:
    slug: str
    title: str
    type: str
    paper_count: int


@strawberry.type
class PaperCluster:
    cluster_id: int
    label: str
    paper_count: int
    papers: list[Paper]
    top_atoms: list[ClusterAtom]


@strawberry.type
class ConsensusItem:
    paper_id: str
    title: Optional[str]
    stance: str  # SUPPORTS / CONTRADICTS / NEUTRAL
    reason: str


@strawberry.type
class ConsensusResult:
    supports_count: int
    contradicts_count: int
    neutral_count: int
    items: list[ConsensusItem]
    error: Optional[str] = None


@strawberry.type
class BridgeAtom:
    slug: str
    title: str
    type: str
    connected_fields: list[str]
    field_count: int
    paper_count: int


@strawberry.type
class WeakConnection:
    field_a: str
    field_b: str
    shared_atom_count: int


@strawberry.type
class GapAnalysis:
    bridge_atoms: list[BridgeAtom]
    weak_connections: list[WeakConnection]
    total_orphan_atoms: int


@strawberry.type
class FieldSummary:
    field: str
    paper_count: int
    atom_count: int
    avg_score: Optional[float]


@strawberry.type
class YearCount:
    year: int
    count: int


@strawberry.type
class FieldTaxonomyItem:
    field: str
    paper_count: int
    top_methods: list[LandscapeAtom]
    top_mechanisms: list[LandscapeAtom]
    top_datasets: list[LandscapeAtom]


@strawberry.type
class JelCodeCount:
    code: str
    count: int


@strawberry.type
class FieldDetail:
    field: str
    paper_count: int
    papers: PaperConnection
    methods: list[LandscapeAtom]
    mechanisms: list[LandscapeAtom]
    datasets: list[LandscapeAtom]
    puzzles: list[LandscapeAtom]
    year_distribution: list[YearCount]
    jel_codes: list[JelCodeCount]


# ---------------------------------------------------------------------------
# JEL Code types
# ---------------------------------------------------------------------------

@strawberry.type
class JelSubcode:
    code: str
    count: int


@strawberry.type
class JelCategory:
    code: str
    label: str
    count: int
    subcodes: list[JelSubcode]


# ---------------------------------------------------------------------------
# Frontier Gap types
# ---------------------------------------------------------------------------

@strawberry.type
class PaperIdTitle:
    paper_id: str
    title: str


@strawberry.type
class FrontierGap:
    title: str
    description: str
    why_it_matters: str
    what_is_needed: str
    closest_paper_ids: list[str]
    closest_paper_titles: list[PaperIdTitle]
    feasibility: str


@strawberry.type
class Stats:
    total_papers: int
    total_cards: int
    total_atoms: int
    total_mechanisms: int
    total_methods: int
    total_datasets: int
    total_puzzles: int
    total_ideas: int


@strawberry.type
class TrendingTopic:
    name: str
    category: str        # "field" or "method"
    recent_count: int
    historical_avg: float
    growth_rate: float   # percentage change
    trend: str           # rising / stable / declining


# ---------------------------------------------------------------------------
# Topic Saturation types
# ---------------------------------------------------------------------------

@strawberry.type
class SaturationIndicator:
    indicator: str
    value: str
    interpretation: str


@strawberry.type
class TopicSaturation:
    topic: str
    total_papers: int
    year_trend: list[YearCount]
    growth_phase: str          # emerging / growing / mature / saturated
    annual_growth_rate: float
    method_diversity: float    # 0-1 scale
    key_indicators: list[SaturationIndicator]
    recommendation: str


# ---------------------------------------------------------------------------
# Paper Debate types
# ---------------------------------------------------------------------------

@strawberry.type
class PaperDebate:
    title: str
    context: str               # the debate description mentioning this paper
    paper_stance: str          # supporting / challenging / discussed
    other_papers: list[str]    # other paper IDs in this debate


# ---------------------------------------------------------------------------
# Research Session types
# ---------------------------------------------------------------------------

@strawberry.type
class ResearchSession:
    id: int
    title: str
    query: str
    filters: str       # JSON string
    sort: str
    paper_ids: list[str]
    notes: str
    created_at: str
    updated_at: str


# ---------------------------------------------------------------------------
# Topic Timeline types
# ---------------------------------------------------------------------------

@strawberry.type
class TimelinePaper:
    paper_id: str
    title: Optional[str]
    has_card: bool
    average_score: Optional[float]
    fields: list[str]


@strawberry.type
class TimelineYear:
    year: int
    count: int
    papers: list[TimelinePaper]


@strawberry.type
class TopicTimeline:
    years: list[TimelineYear]


# ---------------------------------------------------------------------------
# China Dashboard types
# ---------------------------------------------------------------------------

@strawberry.type
class ChinaPaper:
    paper_id: str
    title: Optional[str]
    year: Optional[int]
    fields: list[str]
    average_score: Optional[float]
    applicability_level: str  # high/moderate/low
    applicability_summary: str  # first ~200 chars


@strawberry.type
class ChinaFieldStat:
    field: str
    high_count: int
    moderate_count: int


@strawberry.type
class ChinaDataMention:
    field: str
    count: int
    paper_ids: list[str]
    paper_titles: list[PaperIdTitle]


@strawberry.type
class ChinaDashboard:
    total_high: int
    total_moderate: int
    total_low: int
    high_papers: list[ChinaPaper]
    moderate_papers: list[ChinaPaper]
    low_papers: list[ChinaPaper]
    field_distribution: list[ChinaFieldStat]
    data_mentions: list[ChinaDataMention]


# ---------------------------------------------------------------------------
# User Idea types
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Theme Hierarchy types
# ---------------------------------------------------------------------------

@strawberry.type
class ThemeAtomItem:
    slug: str
    type: str
    title: str
    description: Optional[str]
    evidence_strength: Optional[str]
    paper_count: int


@strawberry.type
class ThemeDetail:
    theme: str
    atoms: list[ThemeAtomItem]
    atom_count: int
    paper_count: int


@strawberry.type
class MetaTheme:
    meta_theme: str
    themes: list[ThemeDetail]
    total_atoms: int
    total_papers: int


@strawberry.type
class UserIdea:
    id: int
    title: str
    description: str
    status: str
    research_question: str
    proposed_method: str
    data_needed: str
    notes: str
    related_paper_ids: list[str]
    related_idea_ids: list[int]
    created_at: str
    updated_at: str


def _dict_to_user_idea(r: dict) -> UserIdea:
    """Convert a resolver dict to a UserIdea strawberry type."""
    return UserIdea(
        id=r["id"],
        title=r["title"],
        description=r["description"],
        status=r["status"],
        research_question=r["research_question"],
        proposed_method=r["proposed_method"],
        data_needed=r["data_needed"],
        notes=r["notes"],
        related_paper_ids=r["related_paper_ids"],
        related_idea_ids=[int(x) for x in r.get("related_idea_ids", []) if str(x).isdigit()],
        created_at=r["created_at"],
        updated_at=r["updated_at"],
    )


@strawberry.type
class NoveltyCheck:
    similar_papers: list[SimilarPaper]
    similar_ideas: list[Idea]
    is_novel: bool


@strawberry.type
class MethodSuggestion:
    slug: str
    title: str
    description: Optional[str]
    when_to_use: Optional[str]
    relevance_score: float


@strawberry.type
class DataSuggestion:
    slug: str
    title: str
    description: Optional[str]
    access: Optional[str]
    relevance_score: float


# ---------------------------------------------------------------------------
# Research Mode types
# ---------------------------------------------------------------------------

@strawberry.input
class ResearchFilter:
    fields: Optional[list[str]] = None
    year_min: Optional[int] = None
    year_max: Optional[int] = None
    score_min: Optional[float] = None
    score_max: Optional[float] = None
    has_card: Optional[bool] = None
    atom_slugs: Optional[list[str]] = None


@strawberry.type
class FieldCount:
    field: str
    count: int


@strawberry.type
class AuthorCoauthor:
    name: str
    shared_papers: int


@strawberry.type
class AuthorSummary:
    name: str
    paper_count: int


@strawberry.type
class AuthorProfile:
    name: str
    paper_count: int
    avg_score: Optional[float]
    papers: list[Paper]
    coauthors: list[AuthorCoauthor]
    fields: list[FieldCount]
    methods: list[FieldCount]


@strawberry.type
class RecommendedPaper:
    paper_id: str
    title: Optional[str]
    year: Optional[int]
    average_score: Optional[float]
    fields: list[str]
    relevance_score: float
    has_card: bool


@strawberry.type
class LandscapeAtom:
    slug: str
    title: str
    type: str
    description: Optional[str]
    evidence_strength: Optional[str]
    access: Optional[str]
    paper_count: int
    paper_ids: list[str]
    theme: Optional[str] = None


@strawberry.type
class AtomTheme:
    theme: str
    atom_type: str
    count: int
    top_atoms: list[LandscapeAtom]


@strawberry.type
class ChinaHighlight:
    paper_id: str
    paper_title: str
    applicability_level: str
    summary: str


@strawberry.type
class ChinaApplicabilitySummary:
    high_count: int
    moderate_count: int
    low_count: int
    highlights: list[ChinaHighlight]


@strawberry.type
class GapItem:
    text: str
    paper_id: str
    paper_title: str


@strawberry.type
class ResearchGaps:
    limitations: list[GapItem]
    unused_methods: list[LandscapeAtom]
    unused_datasets: list[LandscapeAtom]
    open_questions: list[GapItem]


@strawberry.type
class ResearchLandscapeResult:
    methods: list[LandscapeAtom]
    datasets: list[LandscapeAtom]
    mechanisms: list[LandscapeAtom]
    puzzles: list[LandscapeAtom]
    china_applicability: ChinaApplicabilitySummary
    field_distribution: list[FieldCount]
    year_distribution: list[YearCount]
    gaps: ResearchGaps


@strawberry.type
class ResearchPapersResult:
    papers: PaperConnection
    all_paper_ids: list[str]


# ---------------------------------------------------------------------------
# Helpers to convert resolver dicts -> Strawberry types
# ---------------------------------------------------------------------------

def _dict_to_paper(d: dict) -> Paper:
    return Paper(
        paper_id=d["paper_id"],
        title=d.get("title"),
        authors=d.get("authors", []),
        year=d.get("year"),
        fields=d.get("fields", []),
        jel=d.get("jel", []),
        triage_decision=d.get("triage_decision"),
        average_score=d.get("average_score"),
        has_card=d.get("has_card", False),
        abstract=d.get("abstract"),
        nber_url=d.get("nber_url"),
    )


def _dict_to_atom(d: dict) -> Atom:
    return Atom(
        slug=d["slug"],
        type=d["type"],
        title=d["title"],
        description=d.get("description"),
        evidence_strength=d.get("evidence_strength"),
        when_to_use=d.get("when_to_use"),
        access=d.get("access"),
        url=d.get("url"),
        theme=d.get("theme"),
    )


def _dict_to_landscape_atom(d: dict) -> LandscapeAtom:
    return LandscapeAtom(
        slug=d["slug"],
        title=d["title"],
        type=d["type"],
        description=d.get("description"),
        evidence_strength=d.get("evidence_strength"),
        access=d.get("access"),
        paper_count=d.get("paper_count", 0),
        paper_ids=d.get("paper_ids", []),
        theme=d.get("theme"),
    )


def _dict_to_gap_item(d: dict) -> GapItem:
    return GapItem(
        text=d.get("text", ""),
        paper_id=d.get("paper_id", ""),
        paper_title=d.get("paper_title", ""),
    )


def _dict_to_research_landscape_result(data: dict) -> ResearchLandscapeResult:
    gaps_data = data.get("gaps", {})
    gaps = ResearchGaps(
        limitations=[_dict_to_gap_item(g) for g in gaps_data.get("limitations", [])],
        unused_methods=[_dict_to_landscape_atom(a) for a in gaps_data.get("unused_methods", [])],
        unused_datasets=[_dict_to_landscape_atom(a) for a in gaps_data.get("unused_datasets", [])],
        open_questions=[_dict_to_gap_item(g) for g in gaps_data.get("open_questions", [])],
    )

    china_data = data.get("china_applicability", {})
    china = ChinaApplicabilitySummary(
        high_count=china_data.get("high_count", 0),
        moderate_count=china_data.get("moderate_count", 0),
        low_count=china_data.get("low_count", 0),
        highlights=[
            ChinaHighlight(
                paper_id=h["paper_id"],
                paper_title=h["paper_title"],
                applicability_level=h["applicability_level"],
                summary=h["summary"],
            )
            for h in china_data.get("highlights", [])
        ],
    )

    return ResearchLandscapeResult(
        methods=[_dict_to_landscape_atom(a) for a in data.get("methods", [])],
        datasets=[_dict_to_landscape_atom(a) for a in data.get("datasets", [])],
        mechanisms=[_dict_to_landscape_atom(a) for a in data.get("mechanisms", [])],
        puzzles=[_dict_to_landscape_atom(a) for a in data.get("puzzles", [])],
        china_applicability=china,
        field_distribution=[
            FieldCount(field=fc["field"], count=fc["count"])
            for fc in data.get("field_distribution", [])
        ],
        year_distribution=[
            YearCount(year=yc["year"], count=yc["count"])
            for yc in data.get("year_distribution", [])
        ],
        gaps=gaps,
    )


def _dict_to_project(d: dict) -> Project:
    return Project(
        slug=d["slug"],
        title=d.get("title", d["slug"]),
        description=d.get("description", ""),
        status=d.get("status", "draft"),
        scope_type=d.get("scope_type", "curated_paper_set"),
        selection_rule=d.get("selection_rule", "manual"),
        paper_count=len(d.get("paper_ids", [])),
        paper_ids=d.get("paper_ids", []),
        updated_at=d.get("updated_at", ""),
        overview_content=d.get("overview_content"),
        origin_type=d.get("origin_type"),
        origin_query=d.get("origin_query"),
        origin_filters_summary=d.get("origin_filters_summary"),
        source_paper_count=d.get("source_paper_count"),
    )


# ---------------------------------------------------------------------------
# Root Query
# ---------------------------------------------------------------------------

@strawberry.type
class Query:
    # ---- Single lookups ----

    @strawberry.field
    async def paper(self, id: str) -> Optional[Paper]:
        data = await resolvers.get_paper(id)
        return _dict_to_paper(data) if data else None

    @strawberry.field
    async def atom(self, slug: str) -> Optional[Atom]:
        data = await resolvers.get_atom(slug)
        return _dict_to_atom(data) if data else None

    @strawberry.field
    async def field_map(self, slug: str) -> Optional[FieldMap]:
        data = await resolvers.get_field_map(slug)
        if data is None:
            return None
        return FieldMap(slug=data["slug"], title=data["title"], content=data["content"])

    # ---- Lists with filtering ----

    @strawberry.field
    async def papers(
        self,
        filter: Optional[PaperFilter] = None,
        sort: Optional[PaperSort] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> PaperConnection:
        filter_dict = None
        if filter is not None:
            filter_dict = {
                "search": filter.search,
                "fields": filter.fields,
                "year_min": filter.year_min,
                "year_max": filter.year_max,
                "score_min": filter.score_min,
                "score_max": filter.score_max,
                "triage_decision": filter.triage_decision,
                "has_card": filter.has_card,
                "authors": filter.authors,
                "methods": filter.methods,
                "score_dimensions": (
                    [{"dimension": sd.dimension, "min_score": sd.min_score}
                     for sd in filter.score_dimensions]
                    if filter.score_dimensions
                    else None
                ),
                "atom_slugs": filter.atom_slugs,
            }

        result = await resolvers.get_papers(
            filter_=filter_dict,
            sort=sort.value if sort else None,
            limit=max(1, min(limit, 200)),
            offset=max(offset, 0),
        )
        return PaperConnection(
            items=[_dict_to_paper(d) for d in result["items"]],
            total=result["total"],
        )

    @strawberry.field
    async def atoms(
        self,
        filter: Optional[AtomFilter] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> AtomConnection:
        filter_dict = None
        if filter is not None:
            filter_dict = {
                "search": filter.search,
                "type": filter.type,
                "evidence_strength": filter.evidence_strength,
                "access": filter.access,
                "theme": filter.theme,
            }

        result = await resolvers.get_atoms(
            filter_=filter_dict,
            limit=max(1, min(limit, 200)),
            offset=max(offset, 0),
        )
        return AtomConnection(
            items=[_dict_to_atom(d) for d in result["items"]],
            total=result["total"],
        )

    @strawberry.field
    async def atom_themes(
        self,
        atom_type: Optional[str] = None,
    ) -> list[AtomTheme]:
        rows = await resolvers.get_atom_themes(atom_type=atom_type)
        return [
            AtomTheme(
                theme=r["theme"],
                atom_type=r["atom_type"],
                count=r["count"],
                top_atoms=[_dict_to_landscape_atom(a) for a in r["top_atoms"]],
            )
            for r in rows
        ]

    @strawberry.field
    async def available_themes(
        self,
        atom_type: Optional[str] = None,
    ) -> list[str]:
        return await resolvers.get_available_themes(atom_type=atom_type)

    @strawberry.field
    async def atom_theme_hierarchy(self) -> list[MetaTheme]:
        rows = await resolvers.get_atom_theme_hierarchy()
        return [
            MetaTheme(
                meta_theme=r["meta_theme"],
                themes=[
                    ThemeDetail(
                        theme=t["theme"],
                        atoms=[
                            ThemeAtomItem(
                                slug=a["slug"],
                                type=a["type"],
                                title=a["title"],
                                description=a.get("description"),
                                evidence_strength=a.get("evidence_strength"),
                                paper_count=a["paper_count"],
                            )
                            for a in t["atoms"]
                        ],
                        atom_count=t["atom_count"],
                        paper_count=t["paper_count"],
                    )
                    for t in r["themes"]
                ],
                total_atoms=r["total_atoms"],
                total_papers=r["total_papers"],
            )
            for r in rows
        ]

    @strawberry.field
    async def field_maps(self) -> list[FieldMap]:
        rows = await resolvers.get_field_maps()
        return [FieldMap(slug=r["slug"], title=r["title"], content=r["content"]) for r in rows]

    @strawberry.field
    async def ideas(self, status: Optional[str] = None) -> list[Idea]:
        rows = await resolvers.get_ideas(status=status)
        return [
            Idea(
                id=r["id"],
                title=r["title"],
                status=r.get("status"),
                generated_date=r.get("generated_date"),
                heuristic=r.get("heuristic"),
                source_papers=r.get("source_papers", []),
                content=r.get("content"),
                novelty=r.get("novelty"),
                feasibility=r.get("feasibility"),
                impact=r.get("impact"),
                composite=r.get("composite"),
            )
            for r in rows
        ]

    # ---- Digests ----

    @strawberry.field
    async def digests(self, limit: int = 30) -> list[Digest]:
        rows = await resolvers.get_digests(limit=limit)
        return [Digest(date=r["date"], content=r["content"]) for r in rows]

    @strawberry.field
    async def digest(self, date: str) -> Optional[Digest]:
        data = await resolvers.get_digest(date)
        if data is None:
            return None
        return Digest(date=data["date"], content=data["content"])

    # ---- Search ----

    @strawberry.field
    async def search(
        self,
        query: str,
        entity_type: Optional[str] = None,
        limit: int = 20,
    ) -> SearchResult:
        try:
            data = await resolvers.hybrid_search_resolver(
                query, entity_type=entity_type, limit=limit
            )
        except Exception:
            # Fallback to FTS-only search
            data = await resolvers.search(
                query, entity_type=entity_type, limit=limit
            )
        return SearchResult(
            hits=[
                SearchHit(
                    entity_type=h["entity_type"],
                    entity_id=h["entity_id"],
                    title=h.get("title", ""),
                    snippet=h.get("snippet", ""),
                    rank=h.get("rrf_score", h.get("rank", 0.0)),
                )
                for h in data["hits"]
            ],
            total=data["total"],
        )

    @strawberry.field
    async def semantic_search(
        self,
        query: str,
        entity_type: Optional[str] = None,
        limit: int = 20,
    ) -> list[SimilarItem]:
        from hybrid_search import semantic_search_resolver
        results = await semantic_search_resolver(
            query, entity_type=entity_type, limit=limit
        )
        return [
            SimilarItem(
                entity_type=r["entity_type"],
                entity_id=r["entity_id"],
                title=r["title"],
                score=r["score"],
            )
            for r in results
        ]

    # ---- Method Advisor ----

    @strawberry.field
    async def advise_methods(
        self,
        description: str,
        limit: int = 10,
    ) -> list[MethodAdvice]:
        rows = await resolvers.advise_methods(description, limit=max(1, min(limit, 50)))
        return [
            MethodAdvice(
                slug=r["slug"],
                title=r["title"],
                description=r.get("description"),
                when_to_use=r.get("when_to_use"),
                evidence_strength=r.get("evidence_strength"),
                paper_count=r.get("paper_count", 0),
                relevance_score=r.get("relevance_score", 0.0),
            )
            for r in rows
        ]

    # ---- Thematic Clustering ----

    @strawberry.field
    async def cluster_papers(
        self,
        paper_ids: list[str],
        n_clusters: int = 0,
    ) -> list[PaperCluster]:
        rows = await resolvers.cluster_papers(paper_ids, n_clusters=n_clusters)
        return [
            PaperCluster(
                cluster_id=r["cluster_id"],
                label=r["label"],
                paper_count=r["paper_count"],
                papers=[_dict_to_paper(p) for p in r["papers"]],
                top_atoms=[
                    ClusterAtom(
                        slug=a["slug"],
                        title=a["title"],
                        type=a["type"],
                        paper_count=a.get("paper_count", 0),
                    )
                    for a in r.get("top_atoms", [])
                ],
            )
            for r in rows
        ]

    # ---- Graph ----

    @strawberry.field
    async def paper_network(self, paper_id: str, depth: int = 1) -> NetworkGraph:
        data = await resolvers.paper_network(paper_id, depth=min(depth, 3))
        return NetworkGraph(
            nodes=[
                GraphNode(
                    id=n["id"],
                    label=n["label"],
                    type=n["type"],
                    size=n.get("size"),
                    year=n.get("year"),
                    fields=n.get("fields", []),
                    theme=n.get("theme"),
                    paper_count=n.get("paper_count"),
                    is_seed=n.get("is_seed", False),
                )
                for n in data["nodes"]
            ],
            edges=[
                GraphEdge(
                    source=e["source"],
                    target=e["target"],
                    relation=e.get("relation", "references_atom"),
                    weight=e.get("weight", 1.0),
                )
                for e in data["edges"]
            ],
            mode=data.get("mode", "paper"),
            source_paper_count=data.get("source_paper_count"),
            seed_count=data.get("seed_count", 0),
            total_paper_nodes=data.get("total_paper_nodes", 0),
            truncated=data.get("truncated", False),
        )

    @strawberry.field
    async def atom_neighborhood(self, slug: str, depth: int = 1) -> NetworkGraph:
        data = await resolvers.atom_neighborhood(slug, depth=min(depth, 3))
        return NetworkGraph(
            nodes=[
                GraphNode(
                    id=n["id"],
                    label=n["label"],
                    type=n["type"],
                    size=n.get("size"),
                    year=n.get("year"),
                    fields=n.get("fields", []),
                    theme=n.get("theme"),
                    paper_count=n.get("paper_count"),
                    is_seed=n.get("is_seed", False),
                )
                for n in data["nodes"]
            ],
            edges=[
                GraphEdge(
                    source=e["source"],
                    target=e["target"],
                    relation=e.get("relation", "references_atom"),
                    weight=e.get("weight", 1.0),
                )
                for e in data["edges"]
            ],
            mode=data.get("mode", "atom"),
            source_paper_count=data.get("source_paper_count"),
            seed_count=data.get("seed_count", 0),
            total_paper_nodes=data.get("total_paper_nodes", 0),
            truncated=data.get("truncated", False),
        )

    @strawberry.field
    async def paper_set_network(self, paper_ids: list[str], depth: int = 1) -> NetworkGraph:
        data = await resolvers.paper_set_network(paper_ids, depth=min(depth, 3))
        return NetworkGraph(
            nodes=[
                GraphNode(
                    id=n["id"],
                    label=n["label"],
                    type=n["type"],
                    size=n.get("size"),
                    year=n.get("year"),
                    fields=n.get("fields", []),
                    theme=n.get("theme"),
                    paper_count=n.get("paper_count"),
                    is_seed=n.get("is_seed", False),
                )
                for n in data["nodes"]
            ],
            edges=[
                GraphEdge(
                    source=e["source"],
                    target=e["target"],
                    relation=e.get("relation", "references_atom"),
                    weight=e.get("weight", 1.0),
                )
                for e in data["edges"]
            ],
            mode=data.get("mode", "paper_set"),
            source_paper_count=data.get("source_paper_count"),
            seed_count=data.get("seed_count", 0),
            total_paper_nodes=data.get("total_paper_nodes", 0),
            truncated=data.get("truncated", False),
        )

    # ---- Dashboard aggregations ----

    @strawberry.field
    async def gap_analysis(self, limit: int = 20) -> GapAnalysis:
        data = await resolvers.detect_gaps(limit=min(limit, 100))
        return GapAnalysis(
            bridge_atoms=[
                BridgeAtom(
                    slug=a["slug"],
                    title=a["title"],
                    type=a["type"],
                    connected_fields=a["connected_fields"],
                    field_count=a["field_count"],
                    paper_count=a["paper_count"],
                )
                for a in data["bridge_atoms"]
            ],
            weak_connections=[
                WeakConnection(
                    field_a=wc["field_a"],
                    field_b=wc["field_b"],
                    shared_atom_count=wc["shared_atom_count"],
                )
                for wc in data["weak_connections"]
            ],
            total_orphan_atoms=data["total_orphan_atoms"],
        )

    @strawberry.field
    async def field_overview(self) -> list[FieldSummary]:
        rows = await resolvers.field_overview()
        return [
            FieldSummary(
                field=r["field"],
                paper_count=r["paper_count"],
                atom_count=r["atom_count"],
                avg_score=r.get("avg_score"),
            )
            for r in rows
        ]

    @strawberry.field
    async def year_distribution(self) -> list[YearCount]:
        rows = await resolvers.year_distribution()
        return [YearCount(year=r["year"], count=r["count"]) for r in rows]

    # ---- Field Taxonomy & Detail ----

    @strawberry.field
    async def field_taxonomy(self) -> list[FieldTaxonomyItem]:
        rows = await resolvers.get_field_taxonomy()
        return [
            FieldTaxonomyItem(
                field=r["field"],
                paper_count=r["paper_count"],
                top_methods=[_dict_to_landscape_atom(a) for a in r["top_methods"]],
                top_mechanisms=[_dict_to_landscape_atom(a) for a in r["top_mechanisms"]],
                top_datasets=[_dict_to_landscape_atom(a) for a in r["top_datasets"]],
            )
            for r in rows
        ]

    @strawberry.field
    async def field_detail(
        self,
        field: str,
        limit: int = 50,
        offset: int = 0,
        sort: Optional[PaperSort] = None,
        jel_filter: Optional[str] = None,
    ) -> FieldDetail:
        data = await resolvers.get_field_detail(
            field,
            limit=max(1, min(limit, 200)),
            offset=max(offset, 0),
            sort=sort.value if sort else None,
            jel_filter=jel_filter,
        )
        return FieldDetail(
            field=data["field"],
            paper_count=data["paper_count"],
            papers=PaperConnection(
                items=[_dict_to_paper(d) for d in data["papers"]["items"]],
                total=data["papers"]["total"],
            ),
            methods=[_dict_to_landscape_atom(a) for a in data["methods"]],
            mechanisms=[_dict_to_landscape_atom(a) for a in data["mechanisms"]],
            datasets=[_dict_to_landscape_atom(a) for a in data["datasets"]],
            puzzles=[_dict_to_landscape_atom(a) for a in data["puzzles"]],
            year_distribution=[
                YearCount(year=yc["year"], count=yc["count"])
                for yc in data["year_distribution"]
            ],
            jel_codes=[
                JelCodeCount(code=jc["code"], count=jc["count"])
                for jc in data.get("jel_codes", [])
            ],
        )

    @strawberry.field
    async def available_fields(self) -> list[str]:
        """Get all distinct field names from the papers table, sorted by frequency."""
        return await resolvers.get_available_fields()

    # ---- JEL Code Browser ----

    @strawberry.field
    async def jel_taxonomy(self) -> list[JelCategory]:
        rows = await resolvers.get_jel_taxonomy()
        return [
            JelCategory(
                code=r["code"],
                label=r["label"],
                count=r["count"],
                subcodes=[
                    JelSubcode(code=sc["code"], count=sc["count"])
                    for sc in r["subcodes"]
                ],
            )
            for r in rows
        ]

    @strawberry.field
    async def papers_by_jel(
        self,
        code: str,
        limit: int = 20,
        offset: int = 0,
    ) -> PaperConnection:
        result = await resolvers.get_papers_by_jel(
            code,
            limit=max(1, min(limit, 200)),
            offset=max(offset, 0),
        )
        return PaperConnection(
            items=[_dict_to_paper(d) for d in result["items"]],
            total=result["total"],
        )

    # ---- Frontier Gaps ----

    @strawberry.field
    async def frontier_gaps(self) -> list[FrontierGap]:
        rows = await resolvers.get_frontier_gaps()
        return [
            FrontierGap(
                title=r["title"],
                description=r["description"],
                why_it_matters=r["why_it_matters"],
                what_is_needed=r["what_is_needed"],
                closest_paper_ids=r["closest_paper_ids"],
                closest_paper_titles=[
                    PaperIdTitle(paper_id=pid, title=title)
                    for pid, title in r.get("closest_paper_titles", {}).items()
                ],
                feasibility=r["feasibility"],
            )
            for r in rows
        ]

    @strawberry.field
    async def stats(self) -> Stats:
        data = await resolvers.get_stats()
        return Stats(**data)

    @strawberry.field
    async def whats_new(self, limit: int = 10) -> WhatsNew:
        data = await resolvers.get_whats_new(limit=max(1, min(limit, 50)))
        return WhatsNew(
            latest_papers=[_dict_to_paper(d) for d in data["latest_papers"]],
            latest_papers_count=data["latest_papers_count"],
            recent_ideas_count=data["recent_ideas_count"],
            total_papers=data["total_papers"],
        )

    @strawberry.field
    async def trending_topics(self, window: int = 3, limit: int = 20) -> list[TrendingTopic]:
        rows = await resolvers.get_trending_topics(
            window=max(1, min(window, 10)),
            limit=max(1, min(limit, 100)),
        )
        return [
            TrendingTopic(
                name=r["name"],
                category=r["category"],
                recent_count=r["recent_count"],
                historical_avg=r["historical_avg"],
                growth_rate=r["growth_rate"],
                trend=r["trend"],
            )
            for r in rows
        ]

    # ---- Topic Saturation ----

    @strawberry.field
    async def topic_saturation(
        self, query: str, paper_ids: Optional[list[str]] = None
    ) -> TopicSaturation:
        data = await resolvers.analyze_topic_saturation(query, paper_ids)
        return TopicSaturation(
            topic=data["topic"],
            total_papers=data["total_papers"],
            year_trend=[
                YearCount(year=yc["year"], count=yc["count"])
                for yc in data.get("year_trend", [])
            ],
            growth_phase=data["growth_phase"],
            annual_growth_rate=data["annual_growth_rate"],
            method_diversity=data["method_diversity"],
            key_indicators=[
                SaturationIndicator(
                    indicator=ki["indicator"],
                    value=ki["value"],
                    interpretation=ki["interpretation"],
                )
                for ki in data.get("key_indicators", [])
            ],
            recommendation=data["recommendation"],
        )

    @strawberry.field
    async def method_field_matrix(
        self, top_methods: int = 15, top_fields: int = 10
    ) -> MethodFieldMatrix:
        data = await resolvers.get_method_field_matrix(
            top_methods=max(1, min(top_methods, 50)),
            top_fields=max(1, min(top_fields, 50)),
        )
        return MethodFieldMatrix(
            methods=data["methods"],
            fields=data["fields"],
            matrix=data["matrix"],
        )

    # ---- Author & Method lookups ----

    @strawberry.field
    async def author_suggestions(self, query: str, limit: int = 20) -> list[str]:
        """Search for author names matching a partial query."""
        return await resolvers.get_author_suggestions(query=query, limit=limit)

    @strawberry.field
    async def available_methods(self) -> list[str]:
        """Get all unique method tags from triage cards, ordered by frequency."""
        return await resolvers.get_available_methods()

    # ---- Author profiles ----

    @strawberry.field
    async def author(self, name: str) -> Optional[AuthorProfile]:
        data = await resolvers.get_author_profile(name)
        if data is None:
            return None
        return AuthorProfile(
            name=data["name"],
            paper_count=data["paper_count"],
            avg_score=data["avg_score"],
            papers=[_dict_to_paper(p) for p in data["papers"]],
            coauthors=[
                AuthorCoauthor(name=c["name"], shared_papers=c["shared_papers"])
                for c in data["coauthors"]
            ],
            fields=[
                FieldCount(field=f["field"], count=f["count"])
                for f in data["fields"]
            ],
            methods=[
                FieldCount(field=m["field"], count=m["count"])
                for m in data["methods"]
            ],
        )

    @strawberry.field
    async def top_authors(self, limit: int = 20) -> list[AuthorSummary]:
        rows = await resolvers.get_top_authors(limit=max(1, min(limit, 100)))
        return [
            AuthorSummary(name=r["name"], paper_count=r["paper_count"])
            for r in rows
        ]

    # ---- Personalized feed ----

    @strawberry.field
    async def personalized_feed(self, limit: int = 10) -> list[RecommendedPaper]:
        rows = await resolvers.get_personalized_feed(
            limit=max(1, min(limit, 50))
        )
        return [
            RecommendedPaper(
                paper_id=r["paper_id"],
                title=r.get("title"),
                year=r.get("year"),
                average_score=r.get("average_score"),
                fields=r.get("fields", []),
                relevance_score=r.get("relevance_score", 0.0),
                has_card=r.get("has_card", False),
            )
            for r in rows
        ]

    # ---- Research Mode ----

    @strawberry.field
    async def research_papers(
        self,
        query: str,
        filters: Optional[ResearchFilter] = None,
        sort: Optional[PaperSort] = None,
        limit: int = 20,
        offset: int = 0,
    ) -> ResearchPapersResult:
        filter_dict = None
        if filters is not None:
            filter_dict = {
                "fields": filters.fields,
                "year_min": filters.year_min,
                "year_max": filters.year_max,
                "score_min": filters.score_min,
                "score_max": filters.score_max,
                "has_card": filters.has_card,
                "atom_slugs": filters.atom_slugs,
            }

        result = await resolvers.research_search_papers(
            query=query,
            filters=filter_dict,
            sort=sort.value if sort else None,
            limit=max(1, min(limit, 200)),
            offset=max(offset, 0),
        )
        return ResearchPapersResult(
            papers=PaperConnection(
                items=[_dict_to_paper(d) for d in result["papers"]["items"]],
                total=result["papers"]["total"],
            ),
            all_paper_ids=result["all_paper_ids"],
        )

    @strawberry.field
    async def research_landscape(
        self, paper_ids: list[str]
    ) -> ResearchLandscapeResult:
        data = await resolvers.research_landscape(paper_ids)
        return _dict_to_research_landscape_result(data)

    @strawberry.field
    async def research_suggested_questions(
        self, query: str, paper_ids: list[str]
    ) -> list[str]:
        return await resolvers.research_suggested_questions(query, paper_ids)

    # ---- Research Sessions ----

    @strawberry.field
    async def research_sessions(self) -> list[ResearchSession]:
        rows = await resolvers.get_research_sessions()
        return [
            ResearchSession(
                id=r["id"],
                title=r["title"],
                query=r["query"],
                filters=r["filters"],
                sort=r["sort"],
                paper_ids=r["paper_ids"],
                notes=r["notes"],
                created_at=r["created_at"],
                updated_at=r["updated_at"],
            )
            for r in rows
        ]

    @strawberry.field
    async def research_session(self, id: int) -> Optional[ResearchSession]:
        r = await resolvers.get_research_session(id)
        if r is None:
            return None
        return ResearchSession(
            id=r["id"],
            title=r["title"],
            query=r["query"],
            filters=r["filters"],
            sort=r["sort"],
            paper_ids=r["paper_ids"],
            notes=r["notes"],
            created_at=r["created_at"],
            updated_at=r["updated_at"],
        )

    # ---- Topic Timeline ----

    @strawberry.field
    async def topic_timeline(
        self, query: str, limit_per_year: int = 5
    ) -> TopicTimeline:
        data = await resolvers.topic_timeline(query, limit_per_year=max(1, min(limit_per_year, 20)))
        return TopicTimeline(
            years=[
                TimelineYear(
                    year=y["year"],
                    count=y["count"],
                    papers=[
                        TimelinePaper(
                            paper_id=p["paper_id"],
                            title=p.get("title"),
                            has_card=p.get("has_card", False),
                            average_score=p.get("average_score"),
                            fields=p.get("fields", []),
                        )
                        for p in y.get("papers", [])
                    ],
                )
                for y in data.get("years", [])
            ]
        )

    # ---- User personalization ----

    @strawberry.field
    async def bookmarks(self, limit: int = 50, offset: int = 0) -> PaperConnection:
        result = await resolvers.get_bookmarks(
            limit=max(1, min(limit, 200)),
            offset=max(offset, 0),
        )
        return PaperConnection(
            items=[_dict_to_paper(d) for d in result["items"]],
            total=result["total"],
        )

    @strawberry.field
    async def reading_list(
        self,
        status: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> PaperConnection:
        result = await resolvers.get_papers_by_reading_status(
            status=status,
            limit=max(1, min(limit, 200)),
            offset=max(offset, 0),
        )
        return PaperConnection(
            items=[_dict_to_paper(d) for d in result["items"]],
            total=result["total"],
        )

    @strawberry.field
    async def all_notes(self, limit: int = 50, offset: int = 0) -> NoteConnection:
        result = await resolvers.get_all_notes(
            limit=max(1, min(limit, 200)),
            offset=max(offset, 0),
        )
        return NoteConnection(
            items=[
                NoteItem(
                    entity_type=n["entity_type"],
                    entity_id=n["entity_id"],
                    note=n["note"],
                    updated_at=n.get("updated_at", ""),
                )
                for n in result["items"]
            ],
            total=result["total"],
        )

    # ---- Collections ----

    @strawberry.field
    async def collections(self) -> list[Collection]:
        rows = await resolvers.get_collections()
        return [
            Collection(
                id=r["id"],
                name=r["name"],
                description=r["description"],
                paper_count=r["paper_count"],
                created_at=r.get("created_at", ""),
            )
            for r in rows
        ]

    @strawberry.field
    async def collection(self, id: int) -> Optional[Collection]:
        data = await resolvers.get_collection(id)
        if data is None:
            return None
        return Collection(
            id=data["id"],
            name=data["name"],
            description=data["description"],
            paper_count=data["paper_count"],
            created_at=data.get("created_at", ""),
        )

    @strawberry.field
    async def collection_papers(
        self, collection_id: int, limit: int = 100, offset: int = 0
    ) -> PaperConnection:
        result = await resolvers.get_collection_papers(
            collection_id,
            limit=max(1, min(limit, 200)),
            offset=max(offset, 0),
        )
        return PaperConnection(
            items=[_dict_to_paper(d) for d in result["items"]],
            total=result["total"],
        )

    @strawberry.field
    async def paper_collections(self, paper_id: str) -> list[Collection]:
        rows = await resolvers.get_paper_collections(paper_id)
        return [
            Collection(
                id=r["id"],
                name=r["name"],
                description=r["description"],
                paper_count=r["paper_count"],
                created_at=r.get("created_at", ""),
            )
            for r in rows
        ]

    # ---- Curated Projects ----

    @strawberry.field
    async def projects(self) -> list[Project]:
        rows = await resolvers.get_projects()
        return [_dict_to_project(r) for r in rows]

    @strawberry.field
    async def project(self, slug: str) -> Optional[Project]:
        data = await resolvers.get_project(slug)
        return _dict_to_project(data) if data else None

    # ---- China Dashboard ----

    @strawberry.field
    async def china_dashboard(self) -> ChinaDashboard:
        data = await resolvers.get_china_dashboard()

        def _build_china_papers(papers: list) -> list[ChinaPaper]:
            return [
                ChinaPaper(
                    paper_id=p["paper_id"],
                    title=p.get("title"),
                    year=p.get("year"),
                    fields=p.get("fields", []),
                    average_score=p.get("average_score"),
                    applicability_level=p["applicability_level"],
                    applicability_summary=p["applicability_summary"],
                )
                for p in papers
            ]

        return ChinaDashboard(
            total_high=data["total_high"],
            total_moderate=data["total_moderate"],
            total_low=data["total_low"],
            high_papers=_build_china_papers(data["high_papers"]),
            moderate_papers=_build_china_papers(data["moderate_papers"]),
            low_papers=_build_china_papers(data.get("low_papers", [])),
            field_distribution=[
                ChinaFieldStat(field=f["field"], high_count=f["high_count"], moderate_count=f["moderate_count"])
                for f in data["field_distribution"]
            ],
            data_mentions=[
                ChinaDataMention(
                    field=d["field"],
                    count=d["count"],
                    paper_ids=d.get("paper_ids", []),
                    paper_titles=[
                        PaperIdTitle(paper_id=pt["paper_id"], title=pt["title"])
                        for pt in d.get("paper_titles", [])
                    ],
                )
                for d in data["data_mentions"]
            ],
        )

    # ---- User Ideas ----

    @strawberry.field
    async def user_ideas(self, status: Optional[str] = None) -> list[UserIdea]:
        rows = await resolvers.get_user_ideas(status=status)
        return [_dict_to_user_idea(r) for r in rows]

    @strawberry.field
    async def user_idea(self, id: int) -> Optional[UserIdea]:
        r = await resolvers.get_user_idea(id)
        if not r:
            return None
        return _dict_to_user_idea(r)

    @strawberry.field
    async def check_novelty(self, text: str) -> NoveltyCheck:
        data = await resolvers.check_idea_novelty(text)
        return NoveltyCheck(
            similar_papers=[
                SimilarPaper(
                    paper_id=p["paper_id"],
                    title=p.get("title"),
                    year=p.get("year"),
                    average_score=p.get("average_score"),
                    fields=p.get("fields", []),
                    similarity_score=p.get("similarity_score", 0),
                )
                for p in data["similar_papers"]
            ],
            similar_ideas=[
                Idea(
                    id=i["id"],
                    title=i["title"],
                    status=i.get("status"),
                    generated_date=i.get("generated_date"),
                    heuristic=i.get("heuristic"),
                    source_papers=i.get("source_papers", []),
                    content=i.get("content"),
                    novelty=i.get("novelty"),
                    feasibility=i.get("feasibility"),
                    impact=i.get("impact"),
                    composite=i.get("composite"),
                )
                for i in data["similar_ideas"]
            ],
            is_novel=data["is_novel"],
        )

    @strawberry.field
    async def suggest_methods(self, text: str, limit: int = 10) -> list[MethodSuggestion]:
        rows = await resolvers.suggest_methodology(text, limit=min(limit, 20))
        return [
            MethodSuggestion(
                slug=r["slug"],
                title=r["title"],
                description=r.get("description"),
                when_to_use=r.get("when_to_use"),
                relevance_score=r["relevance_score"],
            )
            for r in rows
        ]

    @strawberry.field
    async def suggest_data(self, text: str, limit: int = 10) -> list[DataSuggestion]:
        rows = await resolvers.check_data_availability(text, limit=min(limit, 20))
        return [
            DataSuggestion(
                slug=r["slug"],
                title=r["title"],
                description=r.get("description"),
                access=r.get("access"),
                relevance_score=r["relevance_score"],
            )
            for r in rows
        ]


# ---------------------------------------------------------------------------
# Mutation
# ---------------------------------------------------------------------------

@strawberry.type
class Mutation:
    @strawberry.mutation
    async def toggle_bookmark(self, paper_id: str) -> bool:
        """Add bookmark if not bookmarked, remove if already bookmarked. Returns new bookmarked state."""
        currently = await resolvers.is_bookmarked(paper_id)
        if currently:
            await resolvers.remove_bookmark(paper_id)
            return False
        else:
            await resolvers.add_bookmark(paper_id)
            return True

    @strawberry.mutation
    async def set_reading_status(self, paper_id: str, status: str) -> bool:
        return await resolvers.set_reading_status(paper_id, status)

    @strawberry.mutation
    async def save_note(self, entity_type: str, entity_id: str, note: str) -> bool:
        await resolvers.set_note(entity_type, entity_id, note)
        return True

    @strawberry.mutation
    async def delete_note(self, entity_type: str, entity_id: str) -> bool:
        return await resolvers.delete_note(entity_type, entity_id)

    # ---- Research Session mutations ----

    @strawberry.mutation
    async def save_research_session(
        self,
        title: str,
        query: str,
        filters: str = "{}",
        sort: str = "",
        paper_ids: Optional[list[str]] = None,
        notes: str = "",
    ) -> Optional[ResearchSession]:
        r = await resolvers.save_research_session(
            title=title,
            query=query,
            filters=filters,
            sort=sort,
            paper_ids=paper_ids,
            notes=notes,
        )
        if r is None:
            return None
        return ResearchSession(
            id=r["id"],
            title=r["title"],
            query=r["query"],
            filters=r["filters"],
            sort=r["sort"],
            paper_ids=r["paper_ids"],
            notes=r["notes"],
            created_at=r["created_at"],
            updated_at=r["updated_at"],
        )

    @strawberry.mutation
    async def delete_research_session(self, id: int) -> bool:
        return await resolvers.delete_research_session(id)

    @strawberry.mutation
    async def update_research_session_notes(self, id: int, notes: str) -> bool:
        return await resolvers.update_research_session_notes(id, notes)

    # ---- Collection mutations ----

    @strawberry.mutation
    async def create_collection(self, name: str, description: str = "") -> Optional[Collection]:
        data = await resolvers.create_collection(name, description)
        if not data:
            return None
        return Collection(
            id=data["id"],
            name=data["name"],
            description=data["description"],
            paper_count=data["paper_count"],
            created_at=data.get("created_at", ""),
        )

    @strawberry.mutation
    async def delete_collection(self, id: int) -> bool:
        return await resolvers.delete_collection(id)

    @strawberry.mutation
    async def rename_collection(self, id: int, name: str) -> bool:
        return await resolvers.rename_collection(id, name)

    @strawberry.mutation
    async def add_to_collection(self, collection_id: int, paper_id: str) -> bool:
        return await resolvers.add_to_collection(collection_id, paper_id)

    @strawberry.mutation
    async def remove_from_collection(self, collection_id: int, paper_id: str) -> bool:
        return await resolvers.remove_from_collection(collection_id, paper_id)

    # ---- System Idea mutations ----

    @strawberry.mutation
    async def set_idea_status(self, idea_id: str, status: str) -> bool:
        """Update a system-generated idea's status."""
        return await resolvers.set_idea_status(idea_id, status)

    # ---- User Idea mutations ----

    @strawberry.mutation
    async def create_user_idea(self, title: str, description: str = "") -> Optional[UserIdea]:
        r = await resolvers.create_user_idea(title, description)
        if not r:
            return None
        return _dict_to_user_idea(r)

    @strawberry.mutation
    async def update_user_idea(
        self,
        id: int,
        title: Optional[str] = None,
        description: Optional[str] = None,
        status: Optional[str] = None,
        research_question: Optional[str] = None,
        proposed_method: Optional[str] = None,
        data_needed: Optional[str] = None,
        notes: Optional[str] = None,
    ) -> bool:
        fields = {}
        if title is not None:
            fields["title"] = title
        if description is not None:
            fields["description"] = description
        if status is not None:
            fields["status"] = status
        if research_question is not None:
            fields["research_question"] = research_question
        if proposed_method is not None:
            fields["proposed_method"] = proposed_method
        if data_needed is not None:
            fields["data_needed"] = data_needed
        if notes is not None:
            fields["notes"] = notes
        return await resolvers.update_user_idea(id, fields)

    @strawberry.mutation
    async def delete_user_idea(self, id: int) -> bool:
        return await resolvers.delete_user_idea(id)

    @strawberry.mutation
    async def add_paper_to_idea(self, idea_id: int, paper_id: str) -> bool:
        return await resolvers.add_paper_to_user_idea(idea_id, paper_id)

    @strawberry.mutation
    async def remove_paper_from_idea(self, idea_id: int, paper_id: str) -> bool:
        return await resolvers.remove_paper_from_user_idea(idea_id, paper_id)

    @strawberry.mutation
    async def link_ideas(self, idea_id: int, linked_idea_id: int) -> bool:
        return await resolvers.link_ideas(idea_id, linked_idea_id)

    @strawberry.mutation
    async def unlink_ideas(self, idea_id: int, linked_idea_id: int) -> bool:
        return await resolvers.unlink_ideas(idea_id, linked_idea_id)


# ---------------------------------------------------------------------------
# Build the schema
# ---------------------------------------------------------------------------

schema = strawberry.Schema(query=Query, mutation=Mutation)
