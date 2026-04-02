export interface RelatedPaper {
  paperId: string;
  title: string | null;
  year: number | null;
  averageScore: number | null;
  fields: string[];
  sharedAtomCount: number;
  sharedAtoms: string[];
  similarityScore?: number | null;
}

export interface Paper {
  paperId: string;
  title: string | null;
  authors: string[];
  year: number | null;
  fields: string[];
  jel: string[];
  triageDecision: string | null;
  averageScore: number | null;
  hasCard: boolean;
  abstract: string | null;
  nberUrl: string | null;
  tldr?: string | null;
  ideaCount?: number;
  isBookmarked?: boolean;
  readingStatus?: string | null;
  userNote?: string | null;
  scores?: PaperScore[];
  sections?: CardSection[];
  atoms?: Atom[];
  debates?: PaperDebate[];
  relatedPapers?: RelatedPaper[];
  similarPapers?: SimilarPaper[];
  backlinkNotes?: BacklinkNote[];
}

export interface PaperScore {
  dimension: string;
  score: number;
}

export interface CardSection {
  section: string;
  content: string;
}

export interface Atom {
  slug: string;
  type: "mechanism" | "method" | "dataset" | "puzzle";
  title: string;
  description: string | null;
  evidenceStrength: string | null;
  whenToUse: string | null;
  access: string | null;
  url: string | null;
  paperCount: number;
  theme: string | null;
}

export interface AtomPaper {
  paperId: string;
  title: string | null;
  year: number | null;
  averageScore: number | null;
  fields: string[];
}

export interface AtomDetail extends Atom {
  papers: AtomPaper[];
  similarAtoms?: SimilarAtom[];
  cooccurringAtoms?: CooccurringAtom[];
  backlinkNotes?: BacklinkNote[];
}

export interface SearchResult {
  hits: SearchHit[];
  total: number;
}

export interface FieldMap {
  slug: string;
  title: string;
  content: string;
}

export interface IdeaEvaluation {
  ideaId: string;
  verdict: string | null;
  noveltyScore: number | null;
  identificationScore: number | null;
  dataScore: number | null;
  contributionScore: number | null;
  feasibilityScore: number | null;
  overallScore: number | null;
  keyRisk: string | null;
  nextSteps: string | null;
  deathReason: string | null;
  evaluationText: string | null;
}

export interface Idea {
  id: string;
  title: string;
  status: string | null;
  generatedDate: string | null;
  heuristic: string | null;
  sourcePapers: string[];
  content: string | null;
  novelty: number | null;
  feasibility: number | null;
  impact: number | null;
  composite: number | null;
  evaluation?: IdeaEvaluation | null;
}

export interface MethodFieldMatrix {
  methods: string[];
  fields: string[];
  matrix: number[][];
}

export interface BridgeAtom {
  slug: string;
  title: string;
  type: string;
  connectedFields: string[];
  fieldCount: number;
  paperCount: number;
}

export interface WeakConnection {
  fieldA: string;
  fieldB: string;
  sharedAtomCount: number;
}

export interface GapAnalysis {
  bridgeAtoms: BridgeAtom[];
  weakConnections: WeakConnection[];
  totalOrphanAtoms: number;
}

export interface SearchHit {
  entityType: string;
  entityId: string;
  title: string;
  snippet: string;
  rank: number;
}

export interface GraphNode {
  id: string;
  label: string;
  type: string;
  size: number | null;
  year?: number | null;
  fields?: string[];
  theme?: string | null;
  paperCount?: number | null;
  isSeed?: boolean;
}

export interface GraphEdge {
  source: string;
  target: string;
  relation: string;
  weight: number;
}

export interface NetworkGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  mode: string;
  sourcePaperCount?: number | null;
  seedCount: number;
  totalPaperNodes: number;
  truncated: boolean;
}

export interface Stats {
  totalPapers: number;
  totalCards: number;
  totalAtoms: number;
  totalMechanisms: number;
  totalMethods: number;
  totalDatasets: number;
  totalPuzzles: number;
  totalIdeas: number;
}

export interface WhatsNewPaper {
  paperId: string;
  title: string | null;
  year: number | null;
  fields: string[];
  averageScore: number | null;
  hasCard: boolean;
}

export interface WhatsNew {
  latestPapers: WhatsNewPaper[];
  latestPapersCount: number;
  recentIdeasCount: number;
  totalPapers: number;
}

export interface TrendingTopic {
  name: string;
  category: string;
  recentCount: number;
  historicalAvg: number;
  growthRate: number;
  trend: string;
}

export interface SimilarPaper {
  paperId: string;
  title: string | null;
  year: number | null;
  averageScore: number | null;
  fields: string[];
  similarityScore: number;
}

export interface SimilarAtom {
  slug: string;
  type: string;
  title: string;
  description: string | null;
  similarityScore: number;
}

export interface CooccurringAtom {
  slug: string;
  type: string;
  title: string;
  description: string | null;
  coCount: number;
}

export interface NoteItem {
  entityType: string;
  entityId: string;
  note: string;
  updatedAt: string;
}

export interface BacklinkNote {
  entityType: string;
  entityId: string;
  notePreview: string;
}

// ---------------------------------------------------------------------------
// Collection types
// ---------------------------------------------------------------------------

export interface Collection {
  id: number;
  name: string;
  description: string;
  paperCount: number;
  createdAt: string;
}

export interface Project {
  slug: string;
  title: string;
  description: string;
  status: string;
  scopeType: string;
  selectionRule: string;
  paperCount: number;
  paperIds: string[];
  updatedAt: string;
  overviewContent?: string | null;
  originType?: string | null;
  originQuery?: string | null;
  originFiltersSummary?: string | null;
  sourcePaperCount?: number | null;
  landscape?: ResearchLandscape | null;
  papers?: Paper[];
}

// ---------------------------------------------------------------------------
// Research Mode types
// ---------------------------------------------------------------------------

export interface ResearchPaperItem {
  paperId: string;
  title: string | null;
  authors: string[];
  year: number | null;
  fields: string[];
  averageScore: number | null;
  hasCard: boolean;
  tldr?: string | null;
}

export interface LandscapeAtom {
  slug: string;
  title: string;
  type: string;
  description: string | null;
  evidenceStrength: string | null;
  access: string | null;
  paperCount: number;
  paperIds: string[];
  theme: string | null;
}

export interface AtomTheme {
  theme: string;
  atomType: string;
  count: number;
  topAtoms: LandscapeAtom[];
}

// ---------------------------------------------------------------------------
// Topic Saturation types
// ---------------------------------------------------------------------------

export interface SaturationIndicator {
  indicator: string;
  value: string;
  interpretation: string;
}

export interface TopicSaturation {
  topic: string;
  totalPapers: number;
  yearTrend: { year: number; count: number }[];
  growthPhase: string;
  annualGrowthRate: number;
  methodDiversity: number;
  keyIndicators: SaturationIndicator[];
  recommendation: string;
}

// ---------------------------------------------------------------------------
// Paper Debate types
// ---------------------------------------------------------------------------

export interface PaperDebate {
  title: string;
  context: string;
  paperStance: string;
  otherPapers: string[];
}

export interface ChinaHighlight {
  paperId: string;
  paperTitle: string;
  applicabilityLevel: string;
  summary: string;
}

export interface GapItem {
  text: string;
  paperId: string;
  paperTitle: string;
}

export interface ResearchGaps {
  limitations: GapItem[];
  unusedMethods: LandscapeAtom[];
  unusedDatasets: LandscapeAtom[];
  openQuestions: GapItem[];
}

export interface ResearchLandscape {
  methods: LandscapeAtom[];
  datasets: LandscapeAtom[];
  mechanisms: LandscapeAtom[];
  puzzles: LandscapeAtom[];
  chinaApplicability: {
    highCount: number;
    moderateCount: number;
    lowCount: number;
    highlights: ChinaHighlight[];
  };
  fieldDistribution: { field: string; count: number }[];
  yearDistribution: { year: number; count: number }[];
  gaps: ResearchGaps;
}

export interface ResearchFilter {
  fields?: string[];
  yearMin?: number;
  yearMax?: number;
  scoreMin?: number;
  scoreMax?: number;
  hasCard?: boolean;
  atomSlugs?: string[];
}

// ---------------------------------------------------------------------------
// Method Advisor types
// ---------------------------------------------------------------------------

export interface MethodAdvice {
  slug: string;
  title: string;
  description: string | null;
  whenToUse: string | null;
  evidenceStrength: string | null;
  paperCount: number;
  relevanceScore: number;
}

// ---------------------------------------------------------------------------
// Thematic Clustering types
// ---------------------------------------------------------------------------

export interface ClusterAtom {
  slug: string;
  title: string;
  type: string;
  paperCount: number;
}

export interface PaperCluster {
  clusterId: number;
  label: string;
  paperCount: number;
  papers: ResearchPaperItem[];
  topAtoms: ClusterAtom[];
}

// ---------------------------------------------------------------------------
// Author profile types
// ---------------------------------------------------------------------------

export interface AuthorCoauthor {
  name: string;
  sharedPapers: number;
}

export interface AuthorFieldCount {
  field: string;
  count: number;
}

export interface AuthorProfile {
  name: string;
  paperCount: number;
  avgScore: number | null;
  papers: {
    paperId: string;
    title: string | null;
    year: number | null;
    averageScore: number | null;
    fields: string[];
    hasCard: boolean;
  }[];
  coauthors: AuthorCoauthor[];
  fields: AuthorFieldCount[];
  methods: AuthorFieldCount[];
}

export interface AuthorSummary {
  name: string;
  paperCount: number;
}

// ---------------------------------------------------------------------------
// Personalized feed types
// ---------------------------------------------------------------------------

export interface RecommendedPaper {
  paperId: string;
  title: string | null;
  year: number | null;
  averageScore: number | null;
  fields: string[];
  relevanceScore: number;
  hasCard: boolean;
}

// Score dimension filter for Explorer
export interface ScoreDimensionFilter {
  dimension: string;
  minScore: number;
}

// Consensus analysis (Research Mode)
export interface ConsensusItem {
  paper_id: string;
  title: string | null;
  stance: "SUPPORTS" | "CONTRADICTS" | "NEUTRAL";
  reason: string;
}

export interface ConsensusResult {
  supports_count: number;
  contradicts_count: number;
  neutral_count: number;
  items: ConsensusItem[];
  error?: string;
}

// ---------------------------------------------------------------------------
// Cross-paper comparison types
// ---------------------------------------------------------------------------

export interface ComparisonPaper {
  paper_id: string;
  title: string | null;
  year: number | null;
  authors: string[];
  cells: Record<string, string>;
}

export interface ComparisonResult {
  columns: string[];
  papers: ComparisonPaper[];
  error?: string;
}

// ---------------------------------------------------------------------------
// China Dashboard types
// ---------------------------------------------------------------------------

export interface ChinaPaper {
  paperId: string;
  title: string | null;
  year: number | null;
  fields: string[];
  averageScore: number | null;
  applicabilityLevel: string;
  applicabilitySummary: string;
}

export interface ChinaFieldStat {
  field: string;
  highCount: number;
  moderateCount: number;
}

export interface PaperIdTitle {
  paperId: string;
  title: string;
}

export interface ChinaDashboard {
  totalHigh: number;
  totalModerate: number;
  totalLow: number;
  highPapers: ChinaPaper[];
  moderatePapers: ChinaPaper[];
  lowPapers: ChinaPaper[];
  fieldDistribution: ChinaFieldStat[];
  dataMentions: { field: string; count: number; paperIds: string[]; paperTitles: PaperIdTitle[] }[];
}

// ---------------------------------------------------------------------------
// User Idea types
// ---------------------------------------------------------------------------

export interface UserIdea {
  id: number;
  title: string;
  description: string;
  status: string;
  researchQuestion: string;
  proposedMethod: string;
  dataNeeded: string;
  notes: string;
  relatedPaperIds: string[];
  relatedIdeaIds: number[];
  createdAt: string;
  updatedAt: string;
}

export interface NoveltyCheck {
  similarPapers: SimilarPaper[];
  similarIdeas: Idea[];
  isNovel: boolean;
}

export interface MethodSuggestion {
  slug: string;
  title: string;
  description: string | null;
  whenToUse: string | null;
  relevanceScore: number;
}

export interface DataSuggestion {
  slug: string;
  title: string;
  description: string | null;
  access: string | null;
  relevanceScore: number;
}

// ---------------------------------------------------------------------------
// Research Debate types
// ---------------------------------------------------------------------------

export type AgentRole = "advocate" | "skeptic" | "methodologist" | "moderator";

export interface DebateAgentMessage {
  role: AgentRole;
  label: string;
  round: number;
  text: string;
  isStreaming?: boolean;
}

export interface DebateVerdict {
  overallStrength: number;
  novelty: number;
  feasibility: number;
  recommendation: "pursue" | "modify" | "abandon";
  summary: string;
  nextSteps: string[];
}

// ---------------------------------------------------------------------------
// Research Session types
// ---------------------------------------------------------------------------

export interface ResearchSessionItem {
  id: number;
  title: string;
  query: string;
  filters: string;
  sort: string;
  paperIds: string[];
  notes: string;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Topic Timeline types
// ---------------------------------------------------------------------------

export interface TimelinePaper {
  paperId: string;
  title: string | null;
  hasCard: boolean;
  averageScore: number | null;
  fields: string[];
}

export interface TimelineYear {
  year: number;
  count: number;
  papers: TimelinePaper[];
}

export interface TopicTimelineData {
  years: TimelineYear[];
}

// ---------------------------------------------------------------------------
// Field Taxonomy & Detail types
// ---------------------------------------------------------------------------

export interface FieldTaxonomyAtom {
  slug: string;
  title: string;
  type: string;
  paperCount: number;
  theme?: string | null;
}

export interface FieldTaxonomyItem {
  field: string;
  paperCount: number;
  topMethods: FieldTaxonomyAtom[];
  topMechanisms: FieldTaxonomyAtom[];
  topDatasets: FieldTaxonomyAtom[];
}

export interface JelCodeCount {
  code: string;
  count: number;
}

export interface FieldDetailData {
  field: string;
  paperCount: number;
  papers: {
    items: Paper[];
    total: number;
  };
  methods: FieldTaxonomyAtom[];
  mechanisms: FieldTaxonomyAtom[];
  datasets: FieldTaxonomyAtom[];
  puzzles: FieldTaxonomyAtom[];
  yearDistribution: { year: number; count: number }[];
  jelCodes: JelCodeCount[];
}

// ---------------------------------------------------------------------------
// JEL Code Browser types
// ---------------------------------------------------------------------------

export interface JelSubcode {
  code: string;
  count: number;
}

export interface JelCategory {
  code: string;
  label: string;
  count: number;
  subcodes: JelSubcode[];
}

// ---------------------------------------------------------------------------
// Frontier Gap types
// ---------------------------------------------------------------------------

export interface FrontierGap {
  title: string;
  description: string;
  whyItMatters: string;
  whatIsNeeded: string;
  closestPaperIds: string[];
  closestPaperTitles: PaperIdTitle[];
  feasibility: string;
}

// ---------------------------------------------------------------------------
// Theme Hierarchy types
// ---------------------------------------------------------------------------

export interface ThemeAtomItem {
  slug: string;
  type: string;
  title: string;
  description: string | null;
  evidenceStrength: string | null;
  paperCount: number;
}

export interface ThemeDetail {
  theme: string;
  atoms: ThemeAtomItem[];
  atomCount: number;
  paperCount: number;
}

export interface MetaTheme {
  metaTheme: string;
  themes: ThemeDetail[];
  totalAtoms: number;
  totalPapers: number;
}
