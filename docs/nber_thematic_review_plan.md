# NBER Thematic Review Implementation Plan

## Goal

Add a project-level review layer on top of the existing NBER knowledge-base site so a curated paper set can be presented in a structured, auditable, and visual way.

The new layer must support four user-facing outcomes:

1. Show the main research content covered by a curated paper set.
2. Organize the literature into clear themes and research directions.
3. Compare viewpoints, methods, data, identification strategies, and findings across papers.
4. Surface credible literature gaps and future research directions.

## Current System

The current repository is a full NBER knowledge-base platform:

- `Data/knowledge_base/` stores markdown knowledge assets.
- `backend/` ingests those assets into SQLite and exposes GraphQL + REST APIs.
- `frontend/` renders dashboard, research, explorer, maps, paper detail, graph, and idea workflows.

This is a strong base, but it is optimized for the whole corpus, not for a curated review project.

## Main Problems

### 1. No project-level data object

The codebase has papers, atoms, maps, ideas, and personal collections, but no durable concept of a publishable review project.

Impact:

- A curated paper set cannot carry its own taxonomy, annotations, summaries, or gap logic.
- Personal collections are too lightweight to act as a public review artifact.

### 2. Mixed analytical sources create inconsistent counts

The current site draws counts and summaries from different sources:

- `triage_cards.methods`
- atom links in `atom_paper_refs`
- hand-written markdown maps
- heuristic parsers over card sections

Impact:

- The same metric can change depending on which page is used.
- Statements such as "method X appears in N papers" are not reliably auditable.

### 3. Themes are not review-grade yet

Atom themes are currently assigned with keyword heuristics and catch-all buckets.

Impact:

- Theme labels are useful for browsing, but not reliable enough for a curated literature review.
- Small curated paper sets need precise, human-readable topic labels.

### 4. Key comparisons are trapped in prose

Paper cards contain rich narrative sections, but many cross-paper dimensions are not stored as normalized fields.

Examples:

- main claim
- research question type
- identification family
- specific method
- dataset family
- empirical setting
- contribution type
- limitation type
- future direction type

Impact:

- The site cannot build robust comparison tables or summary statistics from those dimensions.

### 5. Gap logic is fragmented

There are several "gap" systems in the current project:

- dashboard gap analysis
- search-result landscape gaps
- hand-authored `frontier_gaps.md`

Impact:

- The site can suggest ideas, but it cannot yet produce project-specific, evidence-backed gap summaries with a consistent method.

### 6. Weak provenance for synthesized claims

Many high-level summaries are derived from markdown maps or heuristics, not from a dedicated claim-tracking layer.

Impact:

- Users cannot easily see which paper or which section supports a summary claim.
- "Objective" presentation is weakened.

### 7. Data quality risks remain visible at the review layer

The repository already contains atom deduplication and alias-cleanup utilities, which indicates known duplication risk.

Impact:

- Method and dataset counts can be inflated or split across aliases.
- Project-level visuals can become misleading if they are built directly on raw atoms.

### 8. The frontend information architecture is corpus-first, not project-first

Current routes are optimized for global exploration:

- dashboard
- research
- explorer
- fields
- maps
- graph

Impact:

- A curated review needs its own landing page, theme navigation, matrix view, and gap page.
- Those flows do not map cleanly onto the current route structure.

## Target Architecture

## 1. Add a project data layer

Create a new project directory convention under:

- `Data/knowledge_base/projects/<slug>/`

Each project should own:

- manifest
- curated paper list
- project-specific structured annotations
- project taxonomy
- derived metrics
- narrative summaries

This makes the review layer reproducible and versionable.

## 2. Normalize review annotations

For each curated paper in a project, store structured review fields such as:

- `paper_id`
- `theme`
- `subtheme`
- `research_question`
- `main_claim`
- `claim_direction`
- `identification_family`
- `specific_methods`
- `datasets`
- `mechanisms`
- `findings`
- `limitations`
- `future_directions`
- `evidence_notes`
- `provenance`

This becomes the canonical source for project-level counts and matrices.

## 3. Add backend project resolvers

Add GraphQL resolvers that read project files and return project-specific aggregates.

Suggested queries:

- `projects`
- `project(slug)`
- `projectPapers(slug)`
- `projectThemes(slug)`
- `projectMethodStats(slug)`
- `projectDatasetStats(slug)`
- `projectPaperMatrix(slug)`
- `projectGapAnalysis(slug)`
- `projectClaimMap(slug)`

## 4. Add project routes in the frontend

Suggested route group:

- `frontend/src/app/projects/[slug]/page.tsx`
- `frontend/src/app/projects/[slug]/themes/page.tsx`
- `frontend/src/app/projects/[slug]/methods/page.tsx`
- `frontend/src/app/projects/[slug]/matrix/page.tsx`
- `frontend/src/app/projects/[slug]/gaps/page.tsx`

These routes should present a single coherent review project rather than raw corpus exploration.

## 5. Use one counting contract everywhere

Project visuals must use a single project annotation source.

Examples:

- method count = number of unique papers in the project annotated with that method
- dataset count = number of unique papers in the project annotated with that dataset
- theme count = number of unique papers assigned to that theme

Every metric should be defined once and reused across pages.

## 6. Add provenance to every synthesized statement

Every summary card, gap note, or claim cluster should preserve its source links:

- supporting paper IDs
- source sections
- optional direct note references

This is required for an objective review layer.

## Proposed Directory Additions

### Data layer

- `Data/knowledge_base/projects/`
- `Data/knowledge_base/projects/<slug>/manifest.json`
- `Data/knowledge_base/projects/<slug>/paper_annotations.json`
- `Data/knowledge_base/projects/<slug>/theme_taxonomy.json`
- `Data/knowledge_base/projects/<slug>/gap_notes.md`
- `Data/knowledge_base/projects/<slug>/overview.md`

### Backend

- new project file readers in `backend/resolvers.py`
- new schema types and queries in `backend/schema.py`

### Frontend

- new `projects` route group
- shared project components under `frontend/src/components/projects/`

## Implementation Phases

### Phase 1. Data contract

Deliverables:

- create `projects/` directory
- define project manifest format
- define paper annotation format
- define theme taxonomy format

Exit criteria:

- a new curated project can be represented without changing the global corpus schema

### Phase 2. Backend project API

Deliverables:

- project file loader
- project-level GraphQL queries
- stable count logic for themes, methods, datasets, and findings

Exit criteria:

- frontend can request a whole project and all required aggregates from one API family

### Phase 3. Frontend project review pages

Deliverables:

- project overview page
- theme browser
- methods and datasets page
- paper comparison matrix
- gap and future direction page

Exit criteria:

- a user can understand the curated paper set without using the global explorer

### Phase 4. Quality control

Deliverables:

- alias cleanup for project annotations
- metric definitions documented in UI or docs
- provenance checks for synthesized summaries

Exit criteria:

- all visible project claims are traceable and all counts are reproducible

## Immediate Work Queue

1. Create the project directory template and file contract.
2. Build backend project loaders and GraphQL schema.
3. Scaffold the `projects/[slug]` route group in the frontend.
4. Create the first real curated project from the user's target paper set.
5. Populate structured annotations and then wire up the visual summaries.

## Non-Goals For The First Pass

- Replacing the existing global dashboard.
- Rewriting the whole atom system.
- Solving full-corpus taxonomy quality in one step.
- Generating final project annotations purely from heuristics without human review.
