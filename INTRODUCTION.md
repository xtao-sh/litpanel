# NBER Research Knowledge Base -- System Introduction

An AI-powered platform for ingesting, analyzing, and exploring NBER working papers in empirical economics. The system combines a multi-agent pipeline for automated knowledge extraction with an interactive web interface for research discovery, synthesis, and idea generation.

---

## Architecture Overview

```
 NBER Papers (PDFs)
       |
       v
 +----- Multi-Agent Pipeline -----+
 | Scanner -> Scout -> Reader ->  |
 | Linker -> Thinker -> Critic    |
 +--------------------------------+
       |
       v
   Knowledge Base (Markdown)
   cards/ atoms/ maps/ ideas/
       |
       v
   Ingestion Pipeline (ingest.py)
       |
       v
   SQLite Database (kb.db)
       |
       v
 +---- Backend (FastAPI) ---------+
 | GraphQL API (Strawberry)       |
 | REST API (RAG Q&A, Export)     |
 | Hybrid Search (FTS5+Semantic)  |
 +--------------------------------+
       |
       v
 +---- Frontend (Next.js) --------+
 | Research Mode, Explorer,       |
 | China Dashboard, Ideas,        |
 | Digests, Graph, Fields, ...    |
 +--------------------------------+
```

---

## 1. Data Pipeline

### 1.1 Agent System

Six specialized AI agents run in sequence, orchestrated by `Data/agents/orchestrator.py`:

| Agent | Purpose | Input | Output |
|-------|---------|-------|--------|
| **Scanner** | Discover new papers from arXiv/NBER | Researcher profile, keywords | New paper IDs registered in DB |
| **Scout** | Fast triage of pending papers | First/last pages of PDF | Triage decision: DEEP_READ / SKIM / SKIP |
| **Reader** | Deep-read selected papers | Full PDF text | Structured paper card + extracted atoms |
| **Linker** | Cross-paper synthesis | Recent cards, existing maps | Updated field maps (landscape, methods, debates, gaps) |
| **Thinker** | Generate research ideas | Maps, gaps, profile, digests | New ideas in `idea_bank.md` |
| **Critic** | Evaluate ideas | New ideas, landscape, papers | Verdicts (DEVELOP / PROMOTE / KILL) in `graveyard.md` |

**Trigger logic**: Scanner always runs. Scout runs if pending papers exist. Reader runs if DEEP_READ papers exist. Linker triggers after 10+ new cards. Thinker runs when maps have content. Critic runs when new ideas exist.

### 1.2 Knowledge Base Structure

The agents produce structured markdown files stored in `Data/knowledge_base/`:

```
knowledge_base/
├── cards/          # One .md per paper (~700+ cards)
│                   # Contains: research question, method, findings, scores, China applicability
├── atoms/
│   ├── methods/    # Econometric techniques (DID, IV, RD, etc.)
│   ├── mechanisms/ # Economic mechanisms (moral hazard, adverse selection, etc.)
│   ├── datasets/   # Data resources (CPS, Census, CFPS, etc.)
│   └── puzzles/    # Empirical puzzles (wage inequality, etc.)
├── maps/
│   ├── research_landscape.md   # Key questions, consensus, debates by field
│   ├── method_registry.md      # Methods catalog and usage patterns
│   ├── debate_map.md           # Active research debates
│   └── frontier_gaps.md        # Open problems and understudied areas
├── ideas/
│   ├── idea_bank.md            # System-generated research ideas
│   └── graveyard.md            # Critic evaluations and verdicts
├── digests/        # Daily literature summaries (YYYY-MM-DD.md)
├── triage/         # Scout triage decisions (JSONL)
└── profile.md      # Researcher profile (interests, methods, taste)
```

### 1.3 Ingestion into Database

`backend/ingest.py` parses the markdown knowledge base into a SQLite database (`kb.db`) in 8 stages:

1. **Paper cards** -- Extract metadata, 15-dimension scores, card sections
2. **Atoms** -- Parse atom files with type, theme, evidence strength, access info
3. **Triage cards** -- Import Scout decisions with relevance scores
4. **Field maps** -- Store full markdown for landscape, methods, debates, gaps
5. **Ideas + Evaluations** -- Import idea bank and critic verdicts
6. **Digests** -- Store daily literature summaries
7. **DB merge** -- Integrate legacy agent database metadata
8. **FTS5 index** -- Build full-text search index (porter tokenizer)

---

## 2. Database Schema

Core tables in `backend/kb.db`:

**Papers & Content**
- `papers` -- paper_id, title, authors (JSON), year, fields (JSON), jel (JSON), triage_decision, average_score, has_card, abstract
- `paper_scores` -- (paper_id, dimension) -> score (1-5), across 15 dimensions
- `card_sections` -- (paper_id, section) -> content, sections: Research Question, Identification, Key Findings, Limitations, China Applicability

**Knowledge Graph**
- `atoms` -- slug, type (method/mechanism/dataset/puzzle), title, description, evidence_strength, theme, access, url
- `atom_paper_refs` -- (atom_slug, paper_id), links atoms to the papers that use them
- `field_maps` -- slug (research_landscape, frontier_gaps, etc.), title, content (markdown)

**Ideas**
- `ideas` -- id, title, status (new/developing/promoted/killed), source_papers, novelty/feasibility/impact scores, composite
- `idea_evaluations` -- idea_id, verdict, 6 sub-scores, key_risk, next_steps, death_reason

**User Personalization**
- `user_bookmarks`, `user_reading_status`, `user_notes`, `user_collections`, `collection_papers`, `user_ideas`

**Search & Embeddings**
- `search_index` -- FTS5 virtual table over papers, atoms, maps, ideas
- `embeddings` -- entity_type, entity_id, vector (BLOB, float32 array)

**Other**
- `digests` -- date, content
- `triage_cards` -- paper_id, fields, methods, relevance, decision, summary
- `rag_sessions` -- session_id, role, content, context_items, citations

---

## 3. Backend API

Built with **FastAPI** + **Strawberry GraphQL**, served via uvicorn on port 8001.

### 3.1 GraphQL API (`/graphql`)

**Queries -- Data Retrieval**

| Query | Description |
|-------|-------------|
| `paper(id)` | Single paper with scores, sections, atoms, related/similar papers, debates |
| `papers(filter, sort, limit, offset)` | Paginated paper list with rich filtering (fields, years, score range, authors, methods, atoms) |
| `atom(slug)` | Single atom with papers, similar atoms, co-occurring atoms |
| `atoms(filter, limit, offset)` | Atom list filtered by type, theme, evidence strength |
| `search(query, entityType, limit)` | Full-text + semantic hybrid search |
| `fieldTaxonomy` | All fields with paper counts and top methods/mechanisms/datasets |
| `fieldDetail(field, jelFilter, sort)` | Detailed field view with atoms, year distribution, JEL codes |
| `chinaDashboard` | Applicability stats, paper lists by level, field distribution, data source mentions |
| `frontierGaps` | Parsed gap entries with closest papers and feasibility |
| `gapAnalysis` | Bridge atoms, weak connections between fields, orphan atoms |
| `ideas(status)` | System-generated ideas with evaluations |
| `digests(limit)` | Daily literature digests |
| `researchPapers(query, filters, sort)` | Research mode: query + filter, returns paper IDs for landscape |
| `researchLandscape(paperIds)` | Landscape analysis: top methods, mechanisms, datasets, puzzles, China applicability, gaps |
| `clusterPapers(paperIds, nClusters)` | K-means clustering with auto-labeling |
| `topicTimeline(query)` | Year-over-year publication trend |
| `topicSaturation(query)` | Growth phase analysis (emerging/growing/mature/saturated) |
| `paperNetwork(paperId, depth)` / `atomNeighborhood(slug, depth)` | Network graph (nodes + edges) |
| `methodFieldMatrix` | Methods x fields co-occurrence matrix |
| `jelTaxonomy` / `papersByJel(code)` | JEL classification browser |
| `atomThemes` / `atomThemeHierarchy` | Theme-organized atom browsing |
| `author(name)` / `topAuthors` | Author profiles with co-authors, fields, methods |
| `bookmarks` / `readingList` / `collections` / `allNotes` | User personalization |

**Mutations -- User Actions**

| Mutation | Description |
|----------|-------------|
| `toggleBookmark(paperId)` | Add/remove paper bookmark |
| `setReadingStatus(paperId, status)` | Mark paper as reading/read/skipped |
| `saveNote(entityType, entityId, note)` | Attach note to any entity |
| `createCollection(name)` / `addToCollection(id, paperId)` | Manage paper collections |
| `createUserIdea(title, description)` / `updateUserIdea(...)` | User-authored research ideas |
| `setIdeaStatus(ideaId, status)` | Change system idea status |

### 3.2 REST API

| Endpoint | Description |
|----------|-------------|
| `POST /api/ask` | RAG Q&A with streaming (SSE). Input: question, max_context, session_id |
| `POST /api/ask/contextual` | Research-mode Q&A scoped to specific papers |
| `POST /api/generate/lit-review` | Generate literature review (thematic/chronological/methodological) |
| `GET /api/export/bibtex?paper_ids=...` | Export papers as BibTeX |
| `GET /api/export/csv?entity_type=...` | Export filtered data as CSV |
| `GET /api/health` | Health check |

### 3.3 Search System

Three search modes, ranked via Reciprocal Rank Fusion:

1. **Full-text search** (`search.py`) -- SQLite FTS5 with porter tokenizer over papers, atoms, maps, ideas
2. **Semantic search** (`embeddings.py`) -- Sentence transformer embeddings (BAAI/bge-small-en-v1.5), loaded into memory at startup for fast cosine similarity
3. **Hybrid search** (`hybrid_search.py`) -- Combines FTS5 and semantic results via RRF ranking

---

## 4. Frontend

Built with **Next.js 14** (App Router), **Apollo Client** for GraphQL, **Tailwind CSS** + **shadcn/ui** for styling.

### 4.1 Page Map

| Route | Page | Description |
|-------|------|-------------|
| `/` | Home | Dashboard with stats, latest papers, trending topics |
| `/research` | Research Mode | Query-driven exploration with landscape analysis, clustering, timeline, contextual chat |
| `/explorer` | Explorer | Tabbed browser for papers, atoms, and ideas with filter panel + detail panel |
| `/fields` | Fields & Subtopics | Two-panel layout: field list (left) -> field detail with atoms, year distribution, JEL codes (right) |
| `/china` | China Dashboard | Papers by applicability level (high/moderate/low), field distribution, Chinese data sources |
| `/ask` | Q&A | Multi-turn RAG chatbot with citation tracking |
| `/ideas` | Ideas | System-generated ideas sorted/filtered by status, scores; debate modal |
| `/ideas/workspace` | Idea Workspace | Create and develop user research ideas with method/data suggestions |
| `/digests` | Digests | Daily literature summaries with section navigation and search |
| `/paper/[id]` | Paper Detail | Full card, 15-dimension scores (radar chart), sections, related papers, atoms, bookmarks, notes, collections |
| `/atom/[slug]` | Atom Detail | Description, papers, similar atoms, co-occurring atoms, graph |
| `/author/[name]` | Author Profile | Papers, co-authors, field distribution, method usage |
| `/graph` | Network Graph | Cytoscape.js visualization of paper-atom networks |
| `/maps` | Maps Index | Links to field maps (landscape, methods, debates, gaps) |
| `/maps/[slug]` | Map Detail | Full markdown rendering with TOC sidebar |
| `/maps/frontier_gaps` | Frontier Gaps | Interactive gap cards with feasibility filter, sort, paper tooltips, related gaps |
| `/library` | Library | Personal bookmarks, reading lists, notes, collections |
| `/compare` | Compare | Side-by-side paper comparison (methods, findings, scores) |
| `/jel` | JEL Browser | JEL code taxonomy with paper counts |
| `/methods` | Methods | Method atom browser and comparison |
| `/pipeline` | Pipeline | Paper processing status monitor |

### 4.2 Key Features by Page

**Research Mode** (`/research`)
- Free-text query with field/year/score filters
- Landscape panel: top methods, mechanisms, datasets, puzzles across results
- Paper clustering (K-means with auto-labels)
- Topic timeline (year-over-year trend)
- Topic saturation analysis (growth phase + recommendation)
- Contextual RAG chat scoped to current results
- Save/load research sessions

**China Dashboard** (`/china`)
- Three stat cards (high/moderate/low applicability) with paper previews
- Click card to auto-expand and scroll to paper list
- Field distribution bar chart
- Chinese data source chips (CFPS, CHARLS, CHNS, etc.) with paper titles on expand
- Highlight animation on scroll-to sections

**Fields Page** (`/fields`)
- Left panel: field list sorted by paper count
- Right panel: year distribution chart, top atoms by type (methods/mechanisms/datasets/puzzles), common themes with paper count bars
- JEL code filter: first-level (D, J, L...) -> second-level (D43, J24...) drill-down
- Top themes pills for quick navigation

**Frontier Gaps** (`/maps/frontier_gaps`)
- Gap cards with title, description, why it matters, what's needed (checklist), feasibility badge
- Filter by feasibility level (High/Medium/Low)
- Sort by feasibility or paper count
- Paper ID badges with title tooltips on hover
- Related gaps computed from shared closest papers
- Summary bar with total counts by feasibility

**Paper Detail** (`/paper/[id]`)
- Header: title, authors, year, fields, JEL codes, NBER link
- Score radar chart (15 dimensions) + individual score bars
- Card sections: Research Question, Identification, Key Findings, Limitations, China Applicability
- Atom chips grouped by type
- Related papers (by shared atoms) and similar papers (by embeddings)
- Active debates mentioning this paper
- User actions: bookmark, reading status, notes, add to collection

**Digests** (`/digests`)
- Overview grid of all digests with date, summary preview, paper/section counts
- Search/filter by keyword
- Section navigation tabs parsed from markdown headings
- Paper ID count and linking

### 4.3 User Personalization

| Feature | Storage | UI Location |
|---------|---------|-------------|
| Bookmarks | `user_bookmarks` | Paper detail page, Library |
| Reading status | `user_reading_status` (reading/read/skipped) | Paper detail, Library |
| Notes | `user_notes` (entity_type, entity_id) | Paper detail, Atom detail, Library |
| Collections | `user_collections` + `collection_papers` | Paper detail, Library |
| User ideas | `user_ideas` | Ideas workspace |
| Research sessions | `research_sessions` | Research mode |

---

## 5. Technology Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | Next.js 14 (App Router), React, TypeScript |
| **Styling** | Tailwind CSS, shadcn/ui (Radix primitives) |
| **GraphQL Client** | Apollo Client |
| **Graph Visualization** | Cytoscape.js |
| **Icons** | Lucide React |
| **Backend** | FastAPI (Python 3.10+) |
| **GraphQL Server** | Strawberry |
| **Database** | SQLite (WAL mode) via aiosqlite |
| **Full-text Search** | SQLite FTS5 (porter tokenizer) |
| **Embeddings** | Sentence Transformers (BAAI/bge-small-en-v1.5) |
| **LLM** | Claude (Anthropic SDK) for agents + RAG |
| **PDF Processing** | PyPDF2 / pdfplumber |
| **Server** | Uvicorn (ASGI) |

---

## 6. Running the System

**Development servers:**

```bash
# Start both backend and frontend
./scripts/dev.sh

# Or separately:
cd backend && python3 -m uvicorn app:app --host 127.0.0.1 --port 8001 --reload
cd frontend && npm run dev
```

**Run the agent pipeline:**

```bash
./scripts/pipeline.sh          # Full agent cycle
cd Data/agents && python3 orchestrator.py --mode full-cycle
```

**Ingest knowledge base into database:**

```bash
./scripts/ingest.sh
cd backend && python3 ingest.py
```

**Access points:**
- Frontend: http://localhost:3000
- GraphQL API: http://localhost:8001/graphql (with GraphiQL IDE)
- Health check: http://localhost:8001/api/health

---

## 7. Data Flow Summary

```
1. Papers discovered (Scanner) or uploaded
       |
2. Triaged by Scout (DEEP_READ / SKIM / SKIP)
       |
3. Deep-read by Reader -> produces paper card + atoms
       |
4. Synthesized by Linker -> updates field maps
       |
5. Ideas generated by Thinker from maps + gaps
       |
6. Ideas evaluated by Critic (DEVELOP / PROMOTE / KILL)
       |
7. Ingested into kb.db (ingest.py)
       |
8. Served via GraphQL + REST APIs
       |
9. Rendered in Next.js frontend
       |
10. User interacts: search, explore, bookmark, annotate, generate ideas
```

Each agent cycle accumulates knowledge. The system grows richer as more papers are processed, more atoms are identified, and field maps are updated with cross-paper synthesis.
