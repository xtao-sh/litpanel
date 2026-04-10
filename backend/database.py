"""
Database connection and schema for the NBER research knowledge base.

Creates and manages a SQLite database at backend/kb.db with tables for
papers, atoms, field maps, ideas, triage cards, and a full-text search index.
"""

import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent / "kb.db"


def get_db_path() -> Path:
    """Return the path to the SQLite database file."""
    return DB_PATH


def get_connection() -> sqlite3.Connection:
    """Return a new connection to the database with row_factory set."""
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db() -> None:
    """Create all tables. Safe to call multiple times (uses IF NOT EXISTS)."""
    conn = get_connection()
    cur = conn.cursor()

    cur.executescript("""
        CREATE TABLE IF NOT EXISTS papers (
            paper_id TEXT PRIMARY KEY,
            title TEXT,
            authors TEXT,          -- JSON array
            year INTEGER,
            fields TEXT,           -- JSON array
            jel TEXT,              -- JSON array
            triage_decision TEXT,
            triage_summary TEXT,
            average_score REAL,
            has_card BOOLEAN DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS paper_scores (
            paper_id TEXT NOT NULL,
            dimension TEXT,
            score INTEGER,
            PRIMARY KEY (paper_id, dimension)
        );

        CREATE TABLE IF NOT EXISTS card_sections (
            paper_id TEXT NOT NULL,
            section TEXT,
            content TEXT,
            PRIMARY KEY (paper_id, section)
        );

        CREATE TABLE IF NOT EXISTS atoms (
            slug TEXT PRIMARY KEY,
            type TEXT NOT NULL,        -- mechanism/method/dataset/puzzle
            title TEXT NOT NULL,
            description TEXT,
            evidence_strength TEXT,
            when_to_use TEXT,
            access TEXT,
            url TEXT,
            key_references TEXT
        );

        CREATE TABLE IF NOT EXISTS atom_paper_refs (
            atom_slug TEXT NOT NULL,
            paper_id TEXT NOT NULL,
            PRIMARY KEY (atom_slug, paper_id)
        );

        CREATE TABLE IF NOT EXISTS field_maps (
            slug TEXT PRIMARY KEY,
            title TEXT,
            content TEXT,
            updated_at TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS ideas (
            id TEXT PRIMARY KEY,
            title TEXT,
            status TEXT,
            generated_date TEXT,
            heuristic TEXT,
            source_papers TEXT,
            content TEXT,
            novelty INTEGER,
            feasibility INTEGER,
            impact INTEGER,
            composite REAL
        );

        CREATE TABLE IF NOT EXISTS triage_cards (
            paper_id TEXT PRIMARY KEY,
            title TEXT,
            authors TEXT,
            fields TEXT,
            methods TEXT,
            relevance INTEGER,
            decision TEXT,
            summary TEXT,
            year INTEGER,
            triaged_at TEXT
        );

        -- Idea evaluations from graveyard/critic
        CREATE TABLE IF NOT EXISTS idea_evaluations (
            idea_id TEXT PRIMARY KEY,
            verdict TEXT,
            novelty_score INTEGER,
            identification_score INTEGER,
            data_score INTEGER,
            contribution_score INTEGER,
            feasibility_score INTEGER,
            overall_score REAL,
            key_risk TEXT,
            next_steps TEXT,
            death_reason TEXT,
            evaluation_text TEXT,
            evaluated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- User personalization tables
        CREATE TABLE IF NOT EXISTS user_bookmarks (
            paper_id TEXT PRIMARY KEY,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS user_notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            entity_type TEXT NOT NULL,
            entity_id TEXT NOT NULL,
            note TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS user_reading_status (
            paper_id TEXT PRIMARY KEY,
            status TEXT NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- Daily digests
        CREATE TABLE IF NOT EXISTS digests (
            date TEXT PRIMARY KEY,
            content TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- RAG conversation sessions
        CREATE TABLE IF NOT EXISTS rag_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            context_items TEXT,
            citations TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- Semantic embeddings for similarity search
        CREATE TABLE IF NOT EXISTS embeddings (
            entity_type TEXT NOT NULL,    -- paper / atom
            entity_id TEXT NOT NULL,
            vector BLOB NOT NULL,         -- numpy float32 array as bytes
            PRIMARY KEY (entity_type, entity_id)
        );

        -- Paper collections / projects
        CREATE TABLE IF NOT EXISTS user_collections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS collection_papers (
            collection_id INTEGER NOT NULL,
            paper_id TEXT NOT NULL,
            added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (collection_id, paper_id),
            FOREIGN KEY (collection_id) REFERENCES user_collections(id) ON DELETE CASCADE
        );

        -- User research ideas (separate from system-generated ideas)
        CREATE TABLE IF NOT EXISTS user_ideas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT DEFAULT '',
            status TEXT DEFAULT 'draft',
            research_question TEXT DEFAULT '',
            proposed_method TEXT DEFAULT '',
            data_needed TEXT DEFAULT '',
            notes TEXT DEFAULT '',
            related_paper_ids TEXT DEFAULT '[]',
            related_idea_ids TEXT DEFAULT '[]',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- Debate results persistence
        CREATE TABLE IF NOT EXISTS debate_results (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            idea_id TEXT,
            verdict_json TEXT,
            transcript_json TEXT,
            focus_prompt TEXT DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- Research sessions (saved search contexts)
        CREATE TABLE IF NOT EXISTS research_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            query TEXT NOT NULL,
            filters TEXT DEFAULT '{}',
            sort TEXT DEFAULT '',
            paper_ids TEXT DEFAULT '[]',
            notes TEXT DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)

    # Add abstract and nber_url columns (migration-safe)
    for col, col_type in [("abstract", "TEXT"), ("nber_url", "TEXT")]:
        try:
            cur.execute(f"ALTER TABLE papers ADD COLUMN {col} {col_type}")
        except sqlite3.OperationalError:
            pass  # Column already exists

    # Add triage_summary column (migration-safe — for older DBs created before it was in CREATE TABLE)
    try:
        cur.execute("ALTER TABLE papers ADD COLUMN triage_summary TEXT")
    except sqlite3.OperationalError:
        pass  # Column already exists

    # Add theme column to atoms (migration-safe)
    try:
        cur.execute("ALTER TABLE atoms ADD COLUMN theme TEXT")
    except sqlite3.OperationalError:
        pass  # Column already exists

    # Create unique index for user_notes (outside executescript to handle IF NOT EXISTS)
    cur.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_user_notes_entity ON user_notes(entity_type, entity_id)")

    # Index for RAG sessions
    cur.execute("CREATE INDEX IF NOT EXISTS idx_rag_sessions ON rag_sessions(session_id, created_at)")

    # Performance indexes for common query patterns
    cur.execute("CREATE INDEX IF NOT EXISTS idx_papers_year ON papers(year)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_papers_avg_score ON papers(average_score)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_apr_paper ON atom_paper_refs(paper_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_cs_paper ON card_sections(paper_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_tc_paper ON triage_cards(paper_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_cp_paper ON collection_papers(paper_id)")

    # FTS5 virtual table -- drop and recreate to avoid stale data
    cur.execute("DROP TABLE IF EXISTS search_index")
    cur.execute("""
        CREATE VIRTUAL TABLE search_index USING fts5(
            entity_type,
            entity_id,
            title,
            content,
            tokenize='porter unicode61'
        )
    """)

    conn.commit()
    conn.close()
