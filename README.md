# Lit Panel

Lit Panel is a local research workbench for reading, structuring, and connecting
academic papers. It turns PDFs into reusable paper cards and research atoms,
builds an interactive literature graph, and supports cited search, comparison,
idea development, and AI-assisted synthesis.

The interface is bilingual (English and Chinese), while paper titles and source
metadata remain in their original language.

## Download

The first public desktop release is available from
[GitHub Releases](https://github.com/xtao-sh/litpanel/releases/latest).

- **macOS Apple Silicon:** download `Lit-Panel-0.1.0-arm64.dmg`
- The packaged app includes its own Node.js-compatible Electron runtime,
  portable Python runtime, backend dependencies, and a synthetic demo library.
- The current build is ad-hoc signed but not Apple-notarized. macOS may require
  opening it once through Finder's **Open** context menu.

The desktop release does not require a system Python or Node.js installation.

## What It Does

- Imports local PDFs, NBER working-paper IDs, and DOI metadata.
- Runs configurable AI reading across research question, methods, data,
  identification, findings, mechanisms, limitations, and other dimensions.
- Lets the user independently enable or disable automatic **Graph** and
  **Ideas** updates for each reading run.
- Extracts reusable atoms such as methods, datasets, mechanisms, and puzzles.
- Provides FTS5 keyword search plus optional sentence-transformer semantic
  search, scoped to the active library.
- Builds formal paper, atom, and topic graphs without mixing unrelated search
  results into the selected topic.
- Supports paper scoring, notes, collections, comparison, cited Q&A, research
  maps, projects, and idea workspaces.
- Stores multiple local libraries with strict API-level library isolation.

## Privacy Model

Lit Panel is a single-user local application. Its SQLite database, PDFs, notes,
generated cards, graphs, and ideas stay in local storage unless the user exports
them.

AI features are not fully offline: when the user starts an AI read, asks a
question, or requests synthesis, the selected paper text and prompt are sent to
the AI provider configured by the user. API keys are stored in the macOS
Keychain when configured through the app and are used only to authenticate with
that provider.

The public repository and packaged demo release exclude private databases,
papers, `.env` files, API keys, local paths, and build-machine bytecode caches.

## Run From Source

### Requirements

- macOS
- Python 3.10+ (3.11 recommended)
- Node.js 18.18+ (20+ recommended)
- An API key for Kimi, OpenAI, Anthropic, DeepSeek, Gemini, or MiniMax when using
  AI features

### Start

```bash
git clone https://github.com/xtao-sh/litpanel.git
cd litpanel
./scripts/dev.sh start
```

Open [http://127.0.0.1:3050](http://127.0.0.1:3050). The backend runs at
`http://127.0.0.1:8050`.

| Command | Action |
|---|---|
| `./scripts/dev.sh start` | Install missing dependencies and start both services |
| `./scripts/dev.sh stop` | Stop both services |
| `./scripts/dev.sh restart` | Restart both services |
| `./scripts/dev.sh status` | Show service status |

The first source run can take several minutes while Python dependencies and the
embedding model are prepared.

## First Run

1. Open **Setup**, choose an AI provider, add an API key, and enable it.
2. Open **Pipeline** and upload a PDF or enter an NBER ID / DOI.
3. Choose the reading dimensions and decide whether this run should update
   Graph, Ideas, both, or neither.
4. Select **Start reading**. The paper card and selected derived artifacts are
   written to the active library.

The downloadable desktop build starts with eight synthetic demo papers, twelve
atoms, three ideas, and a small connected graph. To replace a source checkout's
working database with the same synthetic seed:

```bash
backend/.venv/bin/python scripts/create_demo_db.py --force --replace-files
```

Back up a working database before using `--force`.

## Configuration

The recommended configuration path is the in-app **Setup** page. For local
development, an optional environment file is also supported:

```bash
cp backend/.env.example backend/.env
```

Data paths default to `./Data` and `./backend/kb.db`. Private data and local
configuration are ignored by Git. See `backend/.env.example` for provider and
path variables.

## Architecture

- **Backend:** FastAPI, Strawberry GraphQL, SQLite/FTS5, optional semantic
  embeddings, and the multi-step reader/linker pipeline under `agents/`.
- **Frontend:** Next.js App Router with the Lit Panel design framework, library,
  paper, pipeline, graph, atlas, ideas, maps, projects, and setup views.
- **Desktop:** Electron starts the packaged FastAPI and standalone Next.js
  services on loopback ports `38000` and `38001`, then opens the local UI.

See [INTRODUCTION.md](INTRODUCTION.md) for additional architecture notes and
[desktop-mvp/README.md](desktop-mvp/README.md) for desktop build details.

## Validation

```bash
cd frontend && npm run lint && npm run build
cd ../backend && ./.venv/bin/python -m unittest discover -s tests -v
cd ../desktop-mvp && npm audit && npm run smoke
```

Release builds are additionally checked for clean demo data, absent API keys and
private paths, process shutdown, code-signature integrity, and DMG checksums.

## Limits

- The downloadable release currently targets macOS Apple Silicon (`arm64`).
- Public multi-user deployment is not supported; the API is designed for a
  local single-user workspace.
- Semantic search needs the embedding model. Keyword search remains available
  without it.
- Public distribution without Gatekeeper warnings requires an Apple Developer
  certificate and notarization.

## License

[MIT](LICENSE) - xtao-sh
