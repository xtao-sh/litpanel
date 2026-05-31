# Lit Panel

An AI-powered desktop workbench for reading and organizing economics working
papers (NBER and beyond). It deep-reads PDFs into structured "cards" (research
question, identification, findings, mechanisms, scores…), extracts reusable
atoms (methods, datasets, mechanisms, puzzles), builds a searchable knowledge
base, and answers questions over your library with citations.

Lit Panel runs **locally on your own Mac** with **your own LLM API key** — your
papers, notes, and key never leave your machine.

> **Platform:** macOS only. Single user, local install.

---

## Requirements

- **macOS**
- **Python 3.10+** (3.11 recommended)
- **Node.js 18.18+** (20+ recommended) — for the web UI
- An **LLM API key** (Kimi, OpenAI, Anthropic, DeepSeek, Gemini, or MiniMax)

---

## Quick start

```bash
git clone https://github.com/<you>/litpanel.git
cd litpanel

# Installs backend (Python venv) + frontend (npm) deps, then starts both.
# First run downloads dependencies and a small embedding model (~90 MB),
# so it needs internet and may take a few minutes.
./scripts/dev.sh start
```

Then open **http://127.0.0.1:3050** in your browser.

| Command | What it does |
|---|---|
| `./scripts/dev.sh start` | Install missing deps and start backend + frontend |
| `./scripts/dev.sh stop` | Stop both |
| `./scripts/dev.sh restart` | Restart both |
| `./scripts/dev.sh status` | Show running processes |

Backend runs on `http://127.0.0.1:8050`, frontend on `http://127.0.0.1:3050`.

---

## First run: 3 steps

A fresh install starts empty. To get going:

1. **Add your API key.** Open **Setup** in the app, pick a provider (e.g. Kimi or
   OpenAI), paste your key, and enable it. The key is stored in your macOS
   Keychain — never in plain text, never sent anywhere except the provider.
   *(Alternatively, put it in `backend/.env`; see below.)*

2. **Add a paper.** Go to **Pipeline** and either upload a PDF, or enter an NBER
   id (e.g. `w35197`) / DOI to fetch it.

3. **Read it.** Pick the analysis dimensions you want and start the AI read. The
   paper card, 15-dimension scores, and atoms appear in the knowledge base, and
   you can search, compare, chat with citations, and generate research ideas.

Want some sample data to explore first? Seed a synthetic demo library:

```bash
backend/.venv/bin/python scripts/create_demo_db.py
```

---

## Configuration

You usually don't need to configure anything: all data paths default to folders
inside the project (`./Data`, `./backend/kb.db`, …) and are created on first run.

The only thing you must provide is an **LLM API key**, via the in-app Setup page
(recommended) **or** an optional `backend/.env` file:

```bash
cp backend/.env.example backend/.env
# then set, at minimum:
#   LLM_API_KEY=sk-...            (or KIMI_API_KEY=sk-...)
#   LLM_API_BASE_URL=...          (defaults to Kimi)
#   LLM_API_MODEL=...             (defaults to kimi-for-coding)
```

`backend/.env`, `kb.db`, and everything under `Data/` are git-ignored — your
keys and papers are never committed.

---

## What's inside

- **Backend** — FastAPI + Strawberry GraphQL, SQLite (FTS5 keyword search +
  sentence-transformer semantic search), a multi-agent reading pipeline under
  `agents/`, and a RAG Q&A endpoint.
- **Frontend** — Next.js (App Router) + Tailwind: Pipeline, Explorer, Research,
  Fields, China dashboard, Q&A, Ideas, Graph, and more.

See [`INTRODUCTION.md`](INTRODUCTION.md) for the full architecture.

---

## Notes & limits

- **macOS only.** In-app key storage uses the macOS Keychain. Linux/Windows are
  not supported for the Setup-page key flow.
- **First run needs internet** to install deps and download the embedding model.
  Keyword search works offline; semantic search needs the model.
- This is a **single-user, local** tool — there are no user accounts and it is
  not meant to be exposed as a public multi-user server.
