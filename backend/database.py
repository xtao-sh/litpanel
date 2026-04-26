"""
Database connection and schema for the research knowledge base.

Creates and manages a SQLite database with tables for papers, atoms, field
maps, ideas, triage cards, and a full-text search index.
"""

from __future__ import annotations

import json
import shutil
import sqlite3
from pathlib import Path
import re

from config import (
    AGENT_DB_PATH,
    KNOWLEDGE_BASE_DIR,
    KB_DB_PATH,
    PAPERS_DIR,
    SERIES_NAME,
    SOURCE_NAME,
)

DB_PATH = Path(KB_DB_PATH)


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", (value or "").strip().lower()).strip("-")
    return slug or "library"


def default_library_name() -> str:
    source_name = (SOURCE_NAME or "").strip()
    if not source_name:
        return "Default Library"
    if source_name.lower().endswith("library"):
        return source_name
    return f"{source_name} Library"


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


def _ensure_processing_state_schema(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS paper_processing_state (
            library_id INTEGER NOT NULL,
            paper_id TEXT NOT NULL,
            processing_status TEXT DEFAULT 'indexed',
            reading_profile TEXT DEFAULT '',
            analysis_focuses TEXT DEFAULT '[]',
            reading_status TEXT DEFAULT '',
            imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            completed_at TIMESTAMP,
            last_error TEXT DEFAULT '',
            PRIMARY KEY (library_id, paper_id),
            FOREIGN KEY (library_id) REFERENCES libraries(id) ON DELETE CASCADE,
            FOREIGN KEY (paper_id) REFERENCES papers(paper_id) ON DELETE CASCADE
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS paper_extraction_state (
            library_id INTEGER NOT NULL,
            paper_id TEXT NOT NULL,
            dimension_key TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'missing',
            quality_score REAL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (library_id, paper_id, dimension_key),
            FOREIGN KEY (library_id) REFERENCES libraries(id) ON DELETE CASCADE,
            FOREIGN KEY (paper_id) REFERENCES papers(paper_id) ON DELETE CASCADE
        )
        """
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_pps_status ON paper_processing_state(library_id, processing_status)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_pps_profile ON paper_processing_state(library_id, reading_profile)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_pes_dimension ON paper_extraction_state(library_id, dimension_key, status)"
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS paper_feedback (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            library_id INTEGER NOT NULL,
            paper_id TEXT NOT NULL,
            dimension_key TEXT DEFAULT '',
            feedback_type TEXT NOT NULL,
            rating INTEGER,
            comment TEXT DEFAULT '',
            action_status TEXT DEFAULT 'open',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (library_id) REFERENCES libraries(id) ON DELETE CASCADE,
            FOREIGN KEY (paper_id) REFERENCES papers(paper_id) ON DELETE CASCADE
        )
        """
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_pf_paper ON paper_feedback(library_id, paper_id, created_at DESC)"
    )


def init_db() -> None:
    """Create all tables. Safe to call multiple times (uses IF NOT EXISTS)."""
    conn = get_connection()
    cur = conn.cursor()

    cur.executescript("""
        CREATE TABLE IF NOT EXISTS libraries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            slug TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            discipline TEXT DEFAULT '',
            description TEXT DEFAULT '',
            papers_dir TEXT DEFAULT '',
            knowledge_base_dir TEXT DEFAULT '',
            agent_db_path TEXT DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

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

        CREATE TABLE IF NOT EXISTS library_field_maps (
            library_id INTEGER NOT NULL,
            slug TEXT NOT NULL,
            title TEXT,
            content TEXT,
            updated_at TIMESTAMP,
            PRIMARY KEY (library_id, slug),
            FOREIGN KEY (library_id) REFERENCES libraries(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS library_ideas (
            library_id INTEGER NOT NULL,
            id TEXT NOT NULL,
            title TEXT,
            status TEXT,
            generated_date TEXT,
            heuristic TEXT,
            source_papers TEXT,
            content TEXT,
            novelty INTEGER,
            feasibility INTEGER,
            impact INTEGER,
            composite REAL,
            PRIMARY KEY (library_id, id),
            FOREIGN KEY (library_id) REFERENCES libraries(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS library_idea_evaluations (
            library_id INTEGER NOT NULL,
            idea_id TEXT NOT NULL,
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
            evaluated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (library_id, idea_id),
            FOREIGN KEY (library_id) REFERENCES libraries(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS library_digests (
            library_id INTEGER NOT NULL,
            date TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (library_id, date),
            FOREIGN KEY (library_id) REFERENCES libraries(id) ON DELETE CASCADE
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

        CREATE TABLE IF NOT EXISTS library_papers (
            library_id INTEGER NOT NULL,
            paper_id TEXT NOT NULL,
            source_path TEXT DEFAULT '',
            file_sha256 TEXT DEFAULT '',
            imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (library_id, paper_id),
            FOREIGN KEY (library_id) REFERENCES libraries(id) ON DELETE CASCADE,
            FOREIGN KEY (paper_id) REFERENCES papers(paper_id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS paper_processing_state (
            library_id INTEGER NOT NULL,
            paper_id TEXT NOT NULL,
            processing_status TEXT DEFAULT 'indexed',
            reading_profile TEXT DEFAULT '',
            analysis_focuses TEXT DEFAULT '[]',
            reading_status TEXT DEFAULT '',
            imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            completed_at TIMESTAMP,
            last_error TEXT DEFAULT '',
            PRIMARY KEY (library_id, paper_id),
            FOREIGN KEY (library_id) REFERENCES libraries(id) ON DELETE CASCADE,
            FOREIGN KEY (paper_id) REFERENCES papers(paper_id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS paper_extraction_state (
            library_id INTEGER NOT NULL,
            paper_id TEXT NOT NULL,
            dimension_key TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'missing',
            quality_score REAL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (library_id, paper_id, dimension_key),
            FOREIGN KEY (library_id) REFERENCES libraries(id) ON DELETE CASCADE,
            FOREIGN KEY (paper_id) REFERENCES papers(paper_id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS paper_feedback (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            library_id INTEGER NOT NULL,
            paper_id TEXT NOT NULL,
            dimension_key TEXT DEFAULT '',
            feedback_type TEXT NOT NULL,
            rating INTEGER,
            comment TEXT DEFAULT '',
            action_status TEXT DEFAULT 'open',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (library_id) REFERENCES libraries(id) ON DELETE CASCADE,
            FOREIGN KEY (paper_id) REFERENCES papers(paper_id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS import_batches (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            library_id INTEGER NOT NULL,
            source_type TEXT NOT NULL,
            source_label TEXT DEFAULT '',
            total_files INTEGER DEFAULT 0,
            imported_files INTEGER DEFAULT 0,
            skipped_files INTEGER DEFAULT 0,
            failed_files INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (library_id) REFERENCES libraries(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS import_batch_files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            batch_id INTEGER NOT NULL,
            filename TEXT NOT NULL,
            paper_id TEXT DEFAULT '',
            status TEXT NOT NULL,
            detail TEXT DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (batch_id) REFERENCES import_batches(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS ai_provider_settings (
            provider TEXT PRIMARY KEY,
            label TEXT NOT NULL,
            api_style TEXT NOT NULL,
            base_url TEXT DEFAULT '',
            api_key TEXT DEFAULT '',
            api_key_hint TEXT DEFAULT '',
            keychain_account TEXT DEFAULT '',
            default_model TEXT DEFAULT '',
            enabled INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS ai_step_configs (
            step TEXT PRIMARY KEY,
            provider TEXT DEFAULT '',
            model TEXT DEFAULT '',
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

    for col, col_type in [
        ("api_key_hint", "TEXT DEFAULT ''"),
        ("keychain_account", "TEXT DEFAULT ''"),
    ]:
        try:
            cur.execute(f"ALTER TABLE ai_provider_settings ADD COLUMN {col} {col_type}")
        except sqlite3.OperationalError:
            pass

    # Create unique index for user_notes (outside executescript to handle IF NOT EXISTS)
    cur.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_user_notes_entity ON user_notes(entity_type, entity_id)")

    # Index for RAG sessions
    cur.execute("CREATE INDEX IF NOT EXISTS idx_rag_sessions ON rag_sessions(session_id, created_at)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_ai_provider_enabled ON ai_provider_settings(enabled)")

    # Performance indexes for common query patterns
    cur.execute("CREATE INDEX IF NOT EXISTS idx_papers_year ON papers(year)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_papers_avg_score ON papers(average_score)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_apr_paper ON atom_paper_refs(paper_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_cs_paper ON card_sections(paper_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_tc_paper ON triage_cards(paper_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_cp_paper ON collection_papers(paper_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_debate_idea ON debate_results(idea_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_lp_paper ON library_papers(paper_id)")
    cur.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_lp_sha ON library_papers(library_id, file_sha256) WHERE file_sha256 != ''")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_pps_status ON paper_processing_state(library_id, processing_status)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_pps_profile ON paper_processing_state(library_id, reading_profile)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_pes_dimension ON paper_extraction_state(library_id, dimension_key, status)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_pf_paper ON paper_feedback(library_id, paper_id, created_at DESC)")

    # FTS5 virtual table -- keep existing index data unless the schema is outdated
    search_index_row = cur.execute(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'search_index'"
    ).fetchone()
    if search_index_row is not None:
        existing_columns = [
            str(row[1])
            for row in cur.execute("PRAGMA table_info(search_index)").fetchall()
        ]
        if "library_id" not in existing_columns:
            cur.execute("DROP TABLE IF EXISTS search_index")

    cur.execute("""
        CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
            entity_type,
            entity_id,
            title,
            content,
            library_id UNINDEXED,
            tokenize='porter unicode61'
        )
    """)

    default_id = ensure_default_library_with_cursor(cur)
    cur.execute(
        """
        INSERT OR IGNORE INTO library_papers (library_id, paper_id)
        SELECT ?, p.paper_id
        FROM papers p
        """,
        (default_id,),
    )
    cur.execute(
        """
        INSERT OR IGNORE INTO library_field_maps (library_id, slug, title, content, updated_at)
        SELECT ?, slug, title, content, updated_at
        FROM field_maps
        """,
        (default_id,),
    )
    cur.execute(
        """
        INSERT OR IGNORE INTO library_ideas
        (library_id, id, title, status, generated_date, heuristic, source_papers, content, novelty, feasibility, impact, composite)
        SELECT ?, id, title, status, generated_date, heuristic, source_papers, content, novelty, feasibility, impact, composite
        FROM ideas
        """,
        (default_id,),
    )
    cur.execute(
        """
        INSERT OR IGNORE INTO library_idea_evaluations
        (library_id, idea_id, verdict, novelty_score, identification_score, data_score, contribution_score, feasibility_score, overall_score, key_risk, next_steps, death_reason, evaluation_text, evaluated_at)
        SELECT ?, idea_id, verdict, novelty_score, identification_score, data_score, contribution_score, feasibility_score, overall_score, key_risk, next_steps, death_reason, evaluation_text, evaluated_at
        FROM idea_evaluations
        """,
        (default_id,),
    )
    cur.execute(
        """
        INSERT OR IGNORE INTO library_digests (library_id, date, content, created_at)
        SELECT ?, date, content, created_at
        FROM digests
        """,
        (default_id,),
    )

    from llm_runtime import (
        PROVIDER_PRESETS,
        STEP_DEFINITIONS,
        _load_legacy_env_provider,
        _keychain_account,
        upsert_workspace_secret,
    )

    for preset in PROVIDER_PRESETS:
        cur.execute(
            """
            INSERT OR IGNORE INTO ai_provider_settings
            (provider, label, api_style, base_url, api_key, api_key_hint, keychain_account, default_model, enabled)
            VALUES (?, ?, ?, ?, '', '', ?, ?, 0)
            """,
            (
                preset.key,
                preset.label,
                preset.api_style,
                preset.default_base_url,
                _keychain_account(preset.key),
                preset.default_model,
            ),
        )
        cur.execute(
            """
            UPDATE ai_provider_settings
            SET label = COALESCE(NULLIF(label, ''), ?),
                api_style = COALESCE(NULLIF(api_style, ''), ?),
                base_url = CASE WHEN base_url IS NULL OR base_url = '' THEN ? ELSE base_url END,
                api_key_hint = COALESCE(api_key_hint, ''),
                keychain_account = CASE WHEN keychain_account IS NULL OR keychain_account = '' THEN ? ELSE keychain_account END,
                default_model = CASE WHEN default_model IS NULL OR default_model = '' THEN ? ELSE default_model END
            WHERE provider = ?
            """,
            (
                preset.label,
                preset.api_style,
                preset.default_base_url,
                _keychain_account(preset.key),
                preset.default_model,
                preset.key,
            ),
        )

    provider_rows = cur.execute(
        "SELECT provider, api_key, api_key_hint, keychain_account FROM ai_provider_settings"
    ).fetchall()
    for row in provider_rows:
        provider = str(row["provider"])
        legacy_secret = str(row["api_key"] or "")
        keychain_account = str(row["keychain_account"] or _keychain_account(provider))
        if legacy_secret:
            stored = upsert_workspace_secret(provider, legacy_secret, db_path=DB_PATH)
            cur.execute(
                """
                UPDATE ai_provider_settings
                SET api_key = '',
                    api_key_hint = ?,
                    keychain_account = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE provider = ?
                """,
                (
                    stored["api_key_hint"],
                    stored["keychain_account"],
                    provider,
                ),
            )

    legacy_provider = _load_legacy_env_provider()
    if legacy_provider:
        legacy_preset = next(
            (preset for preset in PROVIDER_PRESETS if preset.key == legacy_provider["provider"]),
            PROVIDER_PRESETS[0],
        )
        cur.execute(
            """
            UPDATE ai_provider_settings
            SET base_url = CASE WHEN base_url IS NULL OR base_url = '' OR base_url = ? THEN ? ELSE base_url END,
                api_key = CASE WHEN api_key IS NULL OR api_key = '' THEN ? ELSE api_key END,
                default_model = CASE WHEN default_model IS NULL OR default_model = '' OR default_model = ? THEN ? ELSE default_model END,
                enabled = CASE WHEN enabled = 0 AND ? != '' THEN 1 ELSE enabled END,
                updated_at = CURRENT_TIMESTAMP
            WHERE provider = ?
            """,
            (
                legacy_preset.default_base_url,
                legacy_provider["base_url"],
                legacy_provider["api_key"],
                legacy_preset.default_model,
                legacy_provider["default_model"],
                legacy_provider["api_key"],
                legacy_provider["provider"],
            ),
        )

    for step in STEP_DEFINITIONS:
        default_provider = legacy_provider["provider"] if legacy_provider else step.default_provider
        cur.execute(
            """
            INSERT OR IGNORE INTO ai_step_configs (step, provider, model)
            VALUES (?, ?, '')
            """,
            (step.key, default_provider),
        )

    conn.commit()
    conn.close()


def ensure_default_library_with_cursor(cur: sqlite3.Cursor) -> int:
    slug = _slugify(SOURCE_NAME or "default")
    default_name = default_library_name()
    cur.execute(
        """
        INSERT OR IGNORE INTO libraries
        (slug, name, discipline, description, papers_dir, knowledge_base_dir, agent_db_path)
        VALUES (?, ?, '', '', ?, ?, ?)
        """,
        (
            slug,
            default_name,
            str(PAPERS_DIR),
            str(KNOWLEDGE_BASE_DIR),
            str(AGENT_DB_PATH),
        ),
    )
    cur.execute(
        "UPDATE libraries SET name = ? WHERE slug = ? AND (name IS NULL OR name = '' OR name LIKE ?)",
        (default_name, slug, "% Library Library"),
    )
    row = cur.execute("SELECT id FROM libraries WHERE slug = ?", (slug,)).fetchone()
    return int(row[0])


def ensure_default_library() -> int:
    conn = get_connection()
    cur = conn.cursor()
    library_id = ensure_default_library_with_cursor(cur)
    conn.commit()
    conn.close()
    return library_id


def create_library(
    *,
    name: str,
    discipline: str = "",
    description: str = "",
) -> dict[str, object]:
    conn = get_connection()
    cur = conn.cursor()

    base_slug = _slugify(name)
    slug = base_slug
    suffix = 2
    while cur.execute("SELECT 1 FROM libraries WHERE slug = ?", (slug,)).fetchone():
        slug = f"{base_slug}-{suffix}"
        suffix += 1

    papers_dir = str(PAPERS_DIR / slug)
    knowledge_base_dir = str(KNOWLEDGE_BASE_DIR / slug)
    agent_db_path = str(AGENT_DB_PATH.parent / f"{slug}_agent.db")

    Path(papers_dir).mkdir(parents=True, exist_ok=True)
    Path(knowledge_base_dir).mkdir(parents=True, exist_ok=True)

    cur.execute(
        """
        INSERT INTO libraries
        (slug, name, discipline, description, papers_dir, knowledge_base_dir, agent_db_path)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (slug, name.strip(), discipline.strip(), description.strip(), papers_dir, knowledge_base_dir, agent_db_path),
    )
    library_id = int(cur.lastrowid)
    conn.commit()
    conn.close()
    return {
        "id": library_id,
        "slug": slug,
        "name": name.strip(),
        "discipline": discipline.strip(),
        "description": description.strip(),
        "papers_dir": papers_dir,
        "knowledge_base_dir": knowledge_base_dir,
        "agent_db_path": agent_db_path,
        "paper_count": 0,
        "field_map_count": 0,
        "idea_count": 0,
        "digest_count": 0,
        "import_batch_count": 0,
        "latest_idea_date": None,
        "latest_digest_date": None,
    }


def list_libraries() -> list[dict[str, object]]:
    conn = get_connection()
    rows = conn.execute(
        """
        SELECT l.*,
               (SELECT COUNT(*) FROM library_papers lp WHERE lp.library_id = l.id) AS paper_count,
               (SELECT COUNT(*) FROM library_field_maps lfm WHERE lfm.library_id = l.id) AS field_map_count,
               (SELECT COUNT(*) FROM library_ideas li WHERE li.library_id = l.id) AS idea_count,
               (SELECT COUNT(*) FROM library_digests ld WHERE ld.library_id = l.id) AS digest_count,
               (SELECT COUNT(*) FROM import_batches ib WHERE ib.library_id = l.id) AS import_batch_count,
               (SELECT MAX(li.generated_date) FROM library_ideas li WHERE li.library_id = l.id) AS latest_idea_date,
               (SELECT MAX(ld.date) FROM library_digests ld WHERE ld.library_id = l.id) AS latest_digest_date
        FROM libraries l
        ORDER BY l.created_at ASC, l.id ASC
        """
    ).fetchall()
    conn.close()
    return [dict(row) for row in rows]


def library_exists(library_id: int) -> bool:
    conn = get_connection()
    row = conn.execute("SELECT 1 FROM libraries WHERE id = ?", (library_id,)).fetchone()
    conn.close()
    return row is not None


def get_library(library_id: int) -> dict[str, object] | None:
    conn = get_connection()
    row = conn.execute(
        """
        SELECT l.*,
               (SELECT COUNT(*) FROM library_papers lp WHERE lp.library_id = l.id) AS paper_count,
               (SELECT COUNT(*) FROM library_field_maps lfm WHERE lfm.library_id = l.id) AS field_map_count,
               (SELECT COUNT(*) FROM library_ideas li WHERE li.library_id = l.id) AS idea_count,
               (SELECT COUNT(*) FROM library_digests ld WHERE ld.library_id = l.id) AS digest_count,
               (SELECT COUNT(*) FROM import_batches ib WHERE ib.library_id = l.id) AS import_batch_count,
               (SELECT MAX(li.generated_date) FROM library_ideas li WHERE li.library_id = l.id) AS latest_idea_date,
               (SELECT MAX(ld.date) FROM library_digests ld WHERE ld.library_id = l.id) AS latest_digest_date
        FROM libraries l
        WHERE l.id = ?
        """,
        (library_id,),
    ).fetchone()
    conn.close()
    return dict(row) if row is not None else None


def _parse_json_text_list(raw: str | None) -> list[str]:
    if not raw:
        return []
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, list):
            return [str(item) for item in parsed if str(item).strip()]
    except (json.JSONDecodeError, TypeError):
        pass
    return []


_EXTRACTION_DIMENSION_LABELS: dict[str, str] = {
    "metadata": "Metadata",
    "summary": "Summary",
    "research_question": "Research question",
    "methods_data": "Methods & data",
    "findings": "Findings",
    "writing_style": "Writing style",
    "argument_logic": "Argument logic",
    "relations": "Cross-paper relations",
}


def _build_extraction_rows(
    extraction_status: dict[str, bool],
) -> list[dict[str, object]]:
    return [
        {
            "dimension_key": key,
            "label": label,
            "status": "complete" if bool(extraction_status.get(key)) else "missing",
            "quality_score": None,
        }
        for key, label in _EXTRACTION_DIMENSION_LABELS.items()
    ]


def _processing_snapshot_from_row(row: sqlite3.Row) -> dict[str, object]:
    analysis_focuses = _parse_json_text_list(row["analysis_focuses"])
    reading_profile_value = str(row["reading_profile"] or "")
    has_card_value = bool(row["has_card"])
    extraction_status = {
        "metadata": True,
        "summary": bool((row["abstract"] or "").strip() or (row["triage_summary"] or "").strip()),
        "research_question": bool(row["has_research_question"]),
        "methods_data": bool(row["has_methods_data"]),
        "findings": bool(row["has_findings"]),
        "writing_style": has_card_value and (
            reading_profile_value == "style_logic" or "writing_style" in analysis_focuses
        ),
        "argument_logic": has_card_value and (
            reading_profile_value == "style_logic" or "argument_logic" in analysis_focuses
        ),
        "relations": bool(row["has_relation_data"]),
    }
    processing_status = str(row["processing_status"] or "").strip() or (
        "completed" if has_card_value else "indexed"
    )
    return {
        "paper_id": row["paper_id"],
        "title": row["title"],
        "authors": _parse_json_text_list(row["authors"]),
        "year": row["year"],
        "fields": _parse_json_text_list(row["fields"]),
        "jel": _parse_json_text_list(row["jel"]),
        "triage_decision": row["triage_decision"],
        "triage_summary": row["triage_summary"],
        "average_score": row["average_score"],
        "has_card": has_card_value,
        "imported_at": row["imported_at"],
        "updated_at": row["agent_updated_at"] or row["imported_at"],
        "completed_at": row["completed_at"],
        "reading_status": row["reading_status"],
        "processing_status": processing_status,
        "reading_profile": reading_profile_value,
        "analysis_focuses": analysis_focuses,
        "last_error": row["last_error"] or "",
        "extraction_status": extraction_status,
        "extraction_rows": _build_extraction_rows(extraction_status),
    }


def _persist_processing_snapshot_with_cursor(
    cur: sqlite3.Cursor,
    *,
    library_id: int,
    snapshot: dict[str, object],
) -> None:
    cur.execute(
        """
        INSERT INTO paper_processing_state
        (library_id, paper_id, processing_status, reading_profile, analysis_focuses,
         reading_status, imported_at, updated_at, completed_at, last_error)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(library_id, paper_id) DO UPDATE SET
            processing_status = excluded.processing_status,
            reading_profile = excluded.reading_profile,
            analysis_focuses = excluded.analysis_focuses,
            reading_status = excluded.reading_status,
            imported_at = COALESCE(paper_processing_state.imported_at, excluded.imported_at),
            updated_at = excluded.updated_at,
            completed_at = excluded.completed_at,
            last_error = excluded.last_error
        """,
        (
            library_id,
            snapshot["paper_id"],
            snapshot["processing_status"],
            snapshot["reading_profile"],
            json.dumps(snapshot["analysis_focuses"], ensure_ascii=False),
            snapshot.get("reading_status") or "",
            snapshot.get("imported_at"),
            snapshot.get("updated_at"),
            snapshot.get("completed_at"),
            snapshot.get("last_error") or "",
        ),
    )

    cur.execute(
        "DELETE FROM paper_extraction_state WHERE library_id = ? AND paper_id = ?",
        (library_id, snapshot["paper_id"]),
    )
    cur.executemany(
        """
        INSERT INTO paper_extraction_state
        (library_id, paper_id, dimension_key, status, quality_score, updated_at)
        VALUES (?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
        """,
        [
            (
                library_id,
                snapshot["paper_id"],
                row["dimension_key"],
                row["status"],
                row["quality_score"],
                snapshot.get("updated_at"),
            )
            for row in snapshot["extraction_rows"]  # type: ignore[index]
        ],
    )


def list_library_papers(
    *,
    library_id: int,
    search: str = "",
    field: str = "",
    year_min: int | None = None,
    year_max: int | None = None,
    processing_status: str = "",
    reading_profile: str = "",
    coverage: str = "",
    feedback: str = "",
    has_card: bool | None = None,
    sort: str = "updated_desc",
    limit: int = 50,
    offset: int = 0,
) -> dict[str, object]:
    library = get_library(library_id)
    if library is None:
        return {"items": [], "total": 0, "field_options": []}

    conn = get_connection()
    agent_db_path = Path(str(library.get("agent_db_path") or "")).expanduser()
    agent_attached = False

    try:
        _ensure_processing_state_schema(conn)
        if agent_db_path.is_file():
            conn.execute("ATTACH DATABASE ? AS agentdb", (str(agent_db_path),))
            agent_attached = True

        agent_join = ""
        agent_columns = """
            NULL AS processing_status,
            '' AS reading_profile,
            '[]' AS analysis_focuses,
            NULL AS agent_updated_at,
            NULL AS completed_at,
            '' AS last_error
        """
        folder_bind: list[object] = []
        if agent_attached:
            agent_join = (
                "LEFT JOIN agentdb.papers ap "
                "ON ap.paper_id = p.paper_id AND ap.folder = ?"
            )
            agent_columns = """
                ap.status AS processing_status,
                COALESCE(ap.reading_profile, '') AS reading_profile,
                COALESCE(ap.analysis_focuses, '[]') AS analysis_focuses,
                ap.updated_at AS agent_updated_at,
                ap.completed_at AS completed_at,
                CASE
                    WHEN ap.status IN ('error', 'pdf_error', 'timeout') THEN ap.status
                    ELSE ''
                END AS last_error
            """
            folder_bind = [f"library:{library_id}"]

        where_parts = ["lp.library_id = ?"]
        binds: list[object] = [*folder_bind, library_id]

        normalized_search = search.strip()
        if normalized_search:
            term = f"%{normalized_search}%"
            where_parts.append(
                "(p.paper_id LIKE ? OR p.title LIKE ? OR LOWER(COALESCE(p.authors, '')) LIKE ?)"
            )
            binds.extend([term, term, term.lower()])

        normalized_field = field.strip()
        if normalized_field:
            where_parts.append("p.fields LIKE ?")
            binds.append(f'%"{normalized_field}"%')

        if year_min is not None:
            where_parts.append("p.year >= ?")
            binds.append(year_min)

        if year_max is not None:
            where_parts.append("p.year <= ?")
            binds.append(year_max)

        research_question_expr = (
            "EXISTS(SELECT 1 FROM card_sections cs "
            "WHERE cs.paper_id = p.paper_id AND cs.section = 'research_question')"
        )
        methods_data_expr = (
            "EXISTS(SELECT 1 FROM card_sections cs "
            "WHERE cs.paper_id = p.paper_id AND cs.section = 'identification_and_method')"
        )
        findings_expr = (
            "EXISTS(SELECT 1 FROM card_sections cs "
            "WHERE cs.paper_id = p.paper_id AND cs.section = 'key_findings')"
        )
        relation_expr = (
            "EXISTS(SELECT 1 FROM atom_paper_refs apr WHERE apr.paper_id = p.paper_id)"
        )
        has_feedback_expr = (
            "EXISTS(SELECT 1 FROM paper_feedback pf "
            "WHERE pf.library_id = lp.library_id AND pf.paper_id = p.paper_id)"
        )
        needs_attention_expr = (
            "EXISTS(SELECT 1 FROM paper_feedback pf "
            "WHERE pf.library_id = lp.library_id AND pf.paper_id = p.paper_id "
            "AND pf.action_status = 'open' "
            "AND pf.feedback_type IN ('too_shallow', 'incorrect', 'missing', 'format_issue'))"
        )

        if has_card is not None:
            where_parts.append("p.has_card = ?")
            binds.append(1 if has_card else 0)

        if processing_status.strip():
            if agent_attached:
                where_parts.append("COALESCE(ap.status, '') = ?")
                binds.append(processing_status.strip())
            else:
                where_parts.append("1 = 0")

        if reading_profile.strip():
            if agent_attached:
                where_parts.append("COALESCE(ap.reading_profile, '') = ?")
                binds.append(reading_profile.strip())
            else:
                where_parts.append("1 = 0")

        normalized_coverage = coverage.strip()
        if normalized_coverage == "core_ready":
            where_parts.append(
                f"({research_question_expr} AND {methods_data_expr} AND {findings_expr})"
            )
        elif normalized_coverage == "partial":
            where_parts.append(
                "("
                f"({research_question_expr} OR {methods_data_expr} OR {findings_expr} OR {relation_expr}) "
                "AND NOT "
                f"({research_question_expr} AND {methods_data_expr} AND {findings_expr})"
                ")"
            )
        elif normalized_coverage == "minimal":
            where_parts.append(
                f"NOT ({research_question_expr} OR {methods_data_expr} OR {findings_expr} OR {relation_expr})"
            )
        elif normalized_coverage == "relations_ready":
            where_parts.append(relation_expr)

        normalized_feedback = feedback.strip()
        if normalized_feedback == "has_feedback":
            where_parts.append(has_feedback_expr)
        elif normalized_feedback == "needs_attention":
            where_parts.append(needs_attention_expr)
        elif normalized_feedback in {"good", "too_shallow", "incorrect", "missing", "format_issue"}:
            where_parts.append(
                "EXISTS(SELECT 1 FROM paper_feedback pf "
                "WHERE pf.library_id = lp.library_id AND pf.paper_id = p.paper_id "
                "AND pf.feedback_type = ?)"
            )
            binds.append(normalized_feedback)

        where_sql = " AND ".join(where_parts)
        order_sql = {
            "updated_desc": "COALESCE(agent_updated_at, lp.imported_at) DESC, p.paper_id DESC",
            "imported_desc": "lp.imported_at DESC, p.paper_id DESC",
            "year_desc": "p.year DESC, p.paper_id DESC",
            "year_asc": "p.year ASC, p.paper_id ASC",
            "score_desc": "p.average_score DESC, p.paper_id DESC",
            "title_asc": "LOWER(COALESCE(p.title, p.paper_id)) ASC",
        }.get(sort, "COALESCE(agent_updated_at, lp.imported_at) DESC, p.paper_id DESC")

        count_row = conn.execute(
            f"""
            SELECT COUNT(*)
            FROM library_papers lp
            JOIN papers p ON p.paper_id = lp.paper_id
            {agent_join}
            WHERE {where_sql}
            """,
            binds,
        ).fetchone()
        total = int(count_row[0]) if count_row is not None else 0

        rows = conn.execute(
            f"""
            SELECT
                p.paper_id,
                p.title,
                p.authors,
                p.year,
                p.fields,
                p.jel,
                p.triage_decision,
                p.triage_summary,
                p.average_score,
                p.has_card,
                p.abstract,
                p.nber_url,
                lp.imported_at,
                urs.status AS reading_status,
                {agent_columns},
                EXISTS(
                    SELECT 1 FROM card_sections cs
                    WHERE cs.paper_id = p.paper_id AND cs.section = 'research_question'
                ) AS has_research_question,
                EXISTS(
                    SELECT 1 FROM card_sections cs
                    WHERE cs.paper_id = p.paper_id AND cs.section = 'identification_and_method'
                ) AS has_methods_data,
                EXISTS(
                    SELECT 1 FROM card_sections cs
                    WHERE cs.paper_id = p.paper_id AND cs.section = 'key_findings'
                ) AS has_findings,
                EXISTS(
                    SELECT 1 FROM atom_paper_refs apr
                    WHERE apr.paper_id = p.paper_id
                ) AS has_relation_data,
                (
                    SELECT COUNT(*)
                    FROM paper_feedback pf
                    WHERE pf.library_id = lp.library_id AND pf.paper_id = p.paper_id
                ) AS feedback_count,
                (
                    SELECT COUNT(*)
                    FROM paper_feedback pf
                    WHERE pf.library_id = lp.library_id
                      AND pf.paper_id = p.paper_id
                      AND pf.action_status = 'open'
                      AND pf.feedback_type IN ('too_shallow', 'incorrect', 'missing', 'format_issue')
                ) AS attention_feedback_count,
                (
                    SELECT pf.feedback_type
                    FROM paper_feedback pf
                    WHERE pf.library_id = lp.library_id AND pf.paper_id = p.paper_id
                    ORDER BY pf.created_at DESC, pf.id DESC
                    LIMIT 1
                ) AS latest_feedback_type
            FROM library_papers lp
            JOIN papers p ON p.paper_id = lp.paper_id
            {agent_join}
            LEFT JOIN user_reading_status urs ON urs.paper_id = p.paper_id
            WHERE {where_sql}
            ORDER BY {order_sql}
            LIMIT ? OFFSET ?
            """,
            [*binds, limit, offset],
        ).fetchall()

        field_counter: dict[str, int] = {}
        field_rows = conn.execute(
            """
            SELECT p.fields
            FROM library_papers lp
            JOIN papers p ON p.paper_id = lp.paper_id
            WHERE lp.library_id = ?
            """,
            (library_id,),
        ).fetchall()
        for row in field_rows:
            for item in _parse_json_text_list(row["fields"]):
                field_counter[item] = field_counter.get(item, 0) + 1

        field_options = [
            {"value": item, "count": count}
            for item, count in sorted(
                field_counter.items(),
                key=lambda entry: (-entry[1], entry[0].lower()),
            )[:40]
        ]

        items: list[dict[str, object]] = []
        for row in rows:
            snapshot = _processing_snapshot_from_row(row)
            source_url = str(row["nber_url"] or "")
            venue = "DOI metadata" if "doi.org/" in source_url else (SERIES_NAME or SOURCE_NAME or "")
            _persist_processing_snapshot_with_cursor(
                cur=conn.cursor(),
                library_id=library_id,
                snapshot=snapshot,
            )
            items.append(
                {
                    "paper_id": snapshot["paper_id"],
                    "title": snapshot["title"],
                    "authors": snapshot["authors"],
                    "year": snapshot["year"],
                    "fields": snapshot["fields"],
                    "jel": snapshot["jel"],
                    "triage_decision": snapshot["triage_decision"],
                    "triage_summary": snapshot["triage_summary"],
                    "average_score": snapshot["average_score"],
                    "venue": venue,
                    "source_url": source_url,
                    "has_card": snapshot["has_card"],
                    "imported_at": snapshot["imported_at"],
                    "updated_at": snapshot["updated_at"],
                    "reading_status": snapshot["reading_status"],
                    "processing_status": snapshot["processing_status"],
                    "reading_profile": snapshot["reading_profile"],
                    "analysis_focuses": snapshot["analysis_focuses"],
                    "extraction_status": snapshot["extraction_status"],
                    "feedback_count": int(row["feedback_count"] or 0),
                    "attention_feedback_count": int(row["attention_feedback_count"] or 0),
                    "latest_feedback_type": row["latest_feedback_type"],
                }
            )

        conn.commit()
        return {
            "items": items,
            "total": total,
            "field_options": field_options,
            "library": {
                "id": library["id"],
                "name": library["name"],
                "discipline": library["discipline"],
                "paper_count": library["paper_count"],
            },
        }
    finally:
        if agent_attached:
            conn.execute("DETACH DATABASE agentdb")
        conn.close()


def get_paper_processing_state(
    *,
    library_id: int,
    paper_id: str,
) -> dict[str, object] | None:
    library = get_library(library_id)
    if library is None:
        return None

    conn = get_connection()
    agent_db_path = Path(str(library.get("agent_db_path") or "")).expanduser()
    agent_attached = False

    try:
        _ensure_processing_state_schema(conn)
        if agent_db_path.is_file():
            conn.execute("ATTACH DATABASE ? AS agentdb", (str(agent_db_path),))
            agent_attached = True

        agent_join = ""
        agent_columns = """
            NULL AS processing_status,
            '' AS reading_profile,
            '[]' AS analysis_focuses,
            NULL AS agent_updated_at,
            NULL AS completed_at,
            '' AS last_error
        """
        binds: list[object] = [library_id, paper_id]
        if agent_attached:
            agent_join = (
                "LEFT JOIN agentdb.papers ap "
                "ON ap.paper_id = p.paper_id AND ap.folder = ?"
            )
            agent_columns = """
                ap.status AS processing_status,
                COALESCE(ap.reading_profile, '') AS reading_profile,
                COALESCE(ap.analysis_focuses, '[]') AS analysis_focuses,
                ap.updated_at AS agent_updated_at,
                ap.completed_at AS completed_at,
                CASE
                    WHEN ap.status IN ('error', 'pdf_error', 'timeout') THEN ap.status
                    ELSE ''
                END AS last_error
            """
            binds = [library_id, f"library:{library_id}", paper_id]

        row = conn.execute(
            f"""
            SELECT
                p.paper_id,
                p.title,
                p.authors,
                p.year,
                p.fields,
                p.jel,
                p.triage_decision,
                p.triage_summary,
                p.average_score,
                p.has_card,
                p.abstract,
                lp.imported_at,
                urs.status AS reading_status,
                {agent_columns},
                EXISTS(
                    SELECT 1 FROM card_sections cs
                    WHERE cs.paper_id = p.paper_id AND cs.section = 'research_question'
                ) AS has_research_question,
                EXISTS(
                    SELECT 1 FROM card_sections cs
                    WHERE cs.paper_id = p.paper_id AND cs.section = 'identification_and_method'
                ) AS has_methods_data,
                EXISTS(
                    SELECT 1 FROM card_sections cs
                    WHERE cs.paper_id = p.paper_id AND cs.section = 'key_findings'
                ) AS has_findings,
                EXISTS(
                    SELECT 1 FROM atom_paper_refs apr
                    WHERE apr.paper_id = p.paper_id
                ) AS has_relation_data
            FROM library_papers lp
            JOIN papers p ON p.paper_id = lp.paper_id
            {agent_join}
            LEFT JOIN user_reading_status urs ON urs.paper_id = p.paper_id
            WHERE lp.library_id = ? AND p.paper_id = ?
            LIMIT 1
            """,
            binds,
        ).fetchone()

        if row is None:
            return None

        snapshot = _processing_snapshot_from_row(row)
        _persist_processing_snapshot_with_cursor(
            cur=conn.cursor(),
            library_id=library_id,
            snapshot=snapshot,
        )
        conn.commit()

        return {
            "library_id": library_id,
            "paper_id": snapshot["paper_id"],
            "processing_status": snapshot["processing_status"],
            "reading_profile": snapshot["reading_profile"],
            "analysis_focuses": snapshot["analysis_focuses"],
            "reading_status": snapshot["reading_status"],
            "imported_at": snapshot["imported_at"],
            "updated_at": snapshot["updated_at"],
            "completed_at": snapshot["completed_at"],
            "last_error": snapshot["last_error"],
            "extraction_status": snapshot["extraction_status"],
            "extraction_rows": snapshot["extraction_rows"],
        }
    finally:
        if agent_attached:
            conn.execute("DETACH DATABASE agentdb")
        conn.close()


def add_paper_feedback(
    *,
    library_id: int,
    paper_id: str,
    dimension_key: str = "",
    feedback_type: str,
    rating: int | None = None,
    comment: str = "",
) -> dict[str, object]:
    conn = get_connection()
    try:
        _ensure_processing_state_schema(conn)
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO paper_feedback
            (library_id, paper_id, dimension_key, feedback_type, rating, comment, action_status)
            VALUES (?, ?, ?, ?, ?, ?, 'open')
            """,
            (
                library_id,
                paper_id,
                dimension_key.strip(),
                feedback_type.strip(),
                rating,
                comment.strip(),
            ),
        )
        feedback_id = int(cur.lastrowid)
        conn.commit()
        row = conn.execute(
            """
            SELECT id, library_id, paper_id, dimension_key, feedback_type, rating,
                   comment, action_status, created_at
            FROM paper_feedback
            WHERE id = ?
            """,
            (feedback_id,),
        ).fetchone()
        return dict(row) if row is not None else {"id": feedback_id}
    finally:
        conn.close()


def list_paper_feedback(
    *,
    library_id: int,
    paper_id: str,
    limit: int = 20,
) -> list[dict[str, object]]:
    conn = get_connection()
    try:
        _ensure_processing_state_schema(conn)
        rows = conn.execute(
            """
            SELECT id, library_id, paper_id, dimension_key, feedback_type, rating,
                   comment, action_status, created_at
            FROM paper_feedback
            WHERE library_id = ? AND paper_id = ?
            ORDER BY created_at DESC, id DESC
            LIMIT ?
            """,
            (library_id, paper_id, limit),
        ).fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


def update_paper_feedback_action_status(
    *,
    library_id: int,
    feedback_id: int,
    action_status: str,
) -> dict[str, object] | None:
    conn = get_connection()
    try:
        _ensure_processing_state_schema(conn)
        normalized_status = action_status.strip() or "open"
        cur = conn.cursor()
        cur.execute(
            """
            UPDATE paper_feedback
            SET action_status = ?
            WHERE id = ? AND library_id = ?
            """,
            (normalized_status, feedback_id, library_id),
        )
        if cur.rowcount <= 0:
            conn.rollback()
            return None
        conn.commit()
        row = conn.execute(
            """
            SELECT id, library_id, paper_id, dimension_key, feedback_type, rating,
                   comment, action_status, created_at
            FROM paper_feedback
            WHERE id = ? AND library_id = ?
            """,
            (feedback_id, library_id),
        ).fetchone()
        return dict(row) if row is not None else None
    finally:
        conn.close()


def update_library(
    library_id: int,
    *,
    name: str,
    discipline: str = "",
    description: str = "",
) -> dict[str, object] | None:
    conn = get_connection()
    conn.execute(
        """
        UPDATE libraries
        SET name = ?,
            discipline = ?,
            description = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        """,
        (name.strip(), discipline.strip(), description.strip(), library_id),
    )
    conn.commit()
    conn.close()
    return get_library(library_id)


def get_ai_settings() -> dict[str, object]:
    from llm_runtime import get_catalog_payload, load_workspace_ai_settings

    settings = load_workspace_ai_settings(DB_PATH)
    provider_settings = []
    for item in settings["providers"].values():
        provider_settings.append(
            {
                "provider": item["provider"],
                "label": item["label"],
                "api_style": item["api_style"],
                "base_url": item["base_url"],
                "api_key": "",
                "api_key_hint": item.get("api_key_hint", ""),
                "has_key": bool(item.get("has_key")),
                "default_model": item["default_model"],
                "enabled": bool(item["enabled"]),
            }
        )
    return {
        **get_catalog_payload(),
        "provider_settings": provider_settings,
        "step_configs": list(settings["steps"].values()),
    }


def save_ai_settings(
    *,
    provider_settings: list[dict[str, object]],
    step_configs: list[dict[str, object]],
) -> dict[str, object]:
    from llm_runtime import (
        PROVIDER_PRESET_MAP,
        STEP_DEFINITION_MAP,
        _keychain_account,
        delete_workspace_secret,
        upsert_workspace_secret,
    )

    conn = get_connection()
    cur = conn.cursor()

    for raw in provider_settings:
        provider = str(raw.get("provider") or "").strip()
        if provider not in PROVIDER_PRESET_MAP:
            continue
        preset = PROVIDER_PRESET_MAP[provider]
        cur.execute(
            """
            INSERT INTO ai_provider_settings
            (provider, label, api_style, base_url, api_key, api_key_hint, keychain_account, default_model, enabled, updated_at)
            VALUES (?, ?, ?, ?, '', ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(provider) DO UPDATE SET
                label = excluded.label,
                api_style = excluded.api_style,
                base_url = excluded.base_url,
                api_key = '',
                api_key_hint = excluded.api_key_hint,
                keychain_account = excluded.keychain_account,
                default_model = excluded.default_model,
                enabled = excluded.enabled,
                updated_at = CURRENT_TIMESTAMP
            """,
            (
                provider,
                str(raw.get("label") or preset.label).strip() or preset.label,
                preset.api_style,
                str(raw.get("base_url") or preset.default_base_url).strip() or preset.default_base_url,
                "",
                _keychain_account(provider),
                str(raw.get("default_model") or preset.default_model).strip() or preset.default_model,
                1 if bool(raw.get("enabled")) else 0,
            ),
        )
        incoming_key = str(raw.get("api_key") or "").strip()
        clear_api_key = bool(raw.get("clear_api_key"))
        if incoming_key:
            stored = upsert_workspace_secret(provider, incoming_key, db_path=DB_PATH)
            cur.execute(
                """
                UPDATE ai_provider_settings
                SET api_key_hint = ?, keychain_account = ?, updated_at = CURRENT_TIMESTAMP
                WHERE provider = ?
                """,
                (stored["api_key_hint"], stored["keychain_account"], provider),
            )
        elif clear_api_key:
            delete_workspace_secret(provider, db_path=DB_PATH, keychain_account=_keychain_account(provider))
            cur.execute(
                """
                UPDATE ai_provider_settings
                SET api_key_hint = '', keychain_account = ?, updated_at = CURRENT_TIMESTAMP
                WHERE provider = ?
                """,
                (_keychain_account(provider), provider),
            )

    for raw in step_configs:
        step = str(raw.get("step") or "").strip()
        if step not in STEP_DEFINITION_MAP:
            continue
        provider = str(raw.get("provider") or STEP_DEFINITION_MAP[step].default_provider).strip()
        if provider not in PROVIDER_PRESET_MAP:
            provider = STEP_DEFINITION_MAP[step].default_provider
        cur.execute(
            """
            INSERT INTO ai_step_configs (step, provider, model, updated_at)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(step) DO UPDATE SET
                provider = excluded.provider,
                model = excluded.model,
                updated_at = CURRENT_TIMESTAMP
            """,
            (
                step,
                provider,
                str(raw.get("model") or "").strip(),
            ),
        )

    conn.commit()
    conn.close()
    return get_ai_settings()


def _delete_orphan_atoms_with_cursor(cur: sqlite3.Cursor) -> list[str]:
    orphan_rows = cur.execute(
        """
        SELECT a.slug
        FROM atoms a
        LEFT JOIN atom_paper_refs apr ON apr.atom_slug = a.slug
        GROUP BY a.slug
        HAVING COUNT(apr.paper_id) = 0
        """
    ).fetchall()
    orphan_atom_slugs = [str(row["slug"]) for row in orphan_rows]
    if not orphan_atom_slugs:
        return []

    placeholders = ",".join("?" for _ in orphan_atom_slugs)
    cur.execute(
        f"DELETE FROM atoms WHERE slug IN ({placeholders})",
        orphan_atom_slugs,
    )
    cur.execute(
        f"DELETE FROM embeddings WHERE entity_type = 'atom' AND entity_id IN ({placeholders})",
        orphan_atom_slugs,
    )
    cur.execute(
        f"DELETE FROM search_index WHERE entity_type = 'atom' AND entity_id IN ({placeholders})",
        orphan_atom_slugs,
    )
    return orphan_atom_slugs


def purge_library_index_data(library_id: int) -> dict[str, int]:
    """Clear derived paper/atom rows for one library before a clean reindex."""
    conn = get_connection()
    cur = conn.cursor()

    linked_rows = cur.execute(
        "SELECT paper_id FROM library_papers WHERE library_id = ? ORDER BY paper_id",
        (library_id,),
    ).fetchall()
    paper_ids = [str(row["paper_id"]) for row in linked_rows]

    cleared_maps = cur.execute(
        "DELETE FROM library_field_maps WHERE library_id = ?",
        (library_id,),
    ).rowcount
    cleared_ideas = cur.execute(
        "DELETE FROM library_ideas WHERE library_id = ?",
        (library_id,),
    ).rowcount
    cleared_idea_evaluations = cur.execute(
        "DELETE FROM library_idea_evaluations WHERE library_id = ?",
        (library_id,),
    ).rowcount
    cleared_digests = cur.execute(
        "DELETE FROM library_digests WHERE library_id = ?",
        (library_id,),
    ).rowcount
    cleared_search_rows = cur.execute(
        "DELETE FROM search_index WHERE library_id = ?",
        (str(library_id),),
    ).rowcount

    if not paper_ids:
        conn.commit()
        conn.close()
        return {
            "library_id": library_id,
            "paper_count": 0,
            "cleared_maps": cleared_maps,
            "cleared_ideas": cleared_ideas,
            "cleared_idea_evaluations": cleared_idea_evaluations,
            "cleared_digests": cleared_digests,
            "cleared_search_rows": cleared_search_rows,
            "cleared_sections": 0,
            "cleared_scores": 0,
            "cleared_triage_cards": 0,
            "cleared_atom_refs": 0,
            "cleared_paper_embeddings": 0,
            "removed_orphan_atoms": 0,
        }

    placeholders = ",".join("?" for _ in paper_ids)

    cleared_sections = cur.execute(
        f"DELETE FROM card_sections WHERE paper_id IN ({placeholders})",
        paper_ids,
    ).rowcount
    cleared_scores = cur.execute(
        f"DELETE FROM paper_scores WHERE paper_id IN ({placeholders})",
        paper_ids,
    ).rowcount
    cleared_triage_cards = cur.execute(
        f"DELETE FROM triage_cards WHERE paper_id IN ({placeholders})",
        paper_ids,
    ).rowcount
    cleared_atom_refs = cur.execute(
        f"DELETE FROM atom_paper_refs WHERE paper_id IN ({placeholders})",
        paper_ids,
    ).rowcount
    cleared_paper_embeddings = cur.execute(
        f"DELETE FROM embeddings WHERE entity_type = 'paper' AND entity_id IN ({placeholders})",
        paper_ids,
    ).rowcount
    cur.execute(
        f"""
        UPDATE papers
        SET year = NULL,
            fields = '[]',
            jel = '[]',
            triage_decision = NULL,
            triage_summary = NULL,
            average_score = NULL,
            has_card = 0,
            abstract = NULL
        WHERE paper_id IN ({placeholders})
        """,
        paper_ids,
    )

    orphan_atom_slugs = _delete_orphan_atoms_with_cursor(cur)

    conn.commit()
    conn.close()
    return {
        "library_id": library_id,
        "paper_count": len(paper_ids),
        "cleared_maps": cleared_maps,
        "cleared_ideas": cleared_ideas,
        "cleared_idea_evaluations": cleared_idea_evaluations,
        "cleared_digests": cleared_digests,
        "cleared_search_rows": cleared_search_rows,
        "cleared_sections": cleared_sections,
        "cleared_scores": cleared_scores,
        "cleared_triage_cards": cleared_triage_cards,
        "cleared_atom_refs": cleared_atom_refs,
        "cleared_paper_embeddings": cleared_paper_embeddings,
        "removed_orphan_atoms": len(orphan_atom_slugs),
    }


def delete_library(library_id: int) -> dict[str, object]:
    default_id = ensure_default_library()
    if library_id == default_id:
        raise ValueError("The default library cannot be deleted.")

    library = get_library(library_id)
    if library is None:
        raise ValueError("Library not found.")

    conn = get_connection()
    cur = conn.cursor()

    linked_rows = cur.execute(
        "SELECT paper_id FROM library_papers WHERE library_id = ?",
        (library_id,),
    ).fetchall()
    affected_paper_ids = [str(row["paper_id"]) for row in linked_rows]

    cur.execute("DELETE FROM search_index WHERE library_id = ?", (str(library_id),))

    cur.execute("DELETE FROM libraries WHERE id = ?", (library_id,))

    orphan_paper_ids: list[str] = []
    for paper_id in affected_paper_ids:
        still_linked = cur.execute(
            "SELECT 1 FROM library_papers WHERE paper_id = ? LIMIT 1",
            (paper_id,),
        ).fetchone()
        if still_linked is None:
            orphan_paper_ids.append(paper_id)

    if orphan_paper_ids:
        placeholders = ",".join("?" for _ in orphan_paper_ids)
        for table, column in [
            ("paper_scores", "paper_id"),
            ("card_sections", "paper_id"),
            ("triage_cards", "paper_id"),
            ("atom_paper_refs", "paper_id"),
            ("user_bookmarks", "paper_id"),
            ("user_reading_status", "paper_id"),
            ("collection_papers", "paper_id"),
            ("embeddings", "entity_id"),
        ]:
            extra_where = ""
            if table == "embeddings":
                extra_where = " AND entity_type = 'paper'"
            cur.execute(
                f"DELETE FROM {table} WHERE {column} IN ({placeholders}){extra_where}",
                orphan_paper_ids,
            )
        cur.execute(
            f"DELETE FROM papers WHERE paper_id IN ({placeholders})",
            orphan_paper_ids,
        )

    removed_orphan_atoms = _delete_orphan_atoms_with_cursor(cur)

    conn.commit()
    conn.close()

    for path_key in ["papers_dir", "knowledge_base_dir"]:
        raw = str(library.get(path_key, "") or "").strip()
        if raw:
            shutil.rmtree(Path(raw), ignore_errors=True)

    raw_agent_db_path = str(library.get("agent_db_path", "") or "").strip()
    if raw_agent_db_path:
        agent_db_path = Path(raw_agent_db_path)
        if agent_db_path.exists():
            agent_db_path.unlink()

    return {
        "deleted_library_id": library_id,
        "deleted_paper_count": len(affected_paper_ids),
        "deleted_orphan_paper_count": len(orphan_paper_ids),
        "deleted_orphan_atom_count": len(removed_orphan_atoms),
    }


def attach_paper_to_library(
    *,
    library_id: int,
    paper_id: str,
    title: str = "",
    source_path: str = "",
    file_sha256: str = "",
    source_url: str | None = None,
) -> None:
    conn = get_connection()
    cur = conn.cursor()
    _ensure_processing_state_schema(conn)
    cur.execute(
        """
        INSERT OR IGNORE INTO papers
        (paper_id, title, authors, year, fields, jel, triage_decision, triage_summary, average_score, has_card, abstract, nber_url)
        VALUES (?, ?, '[]', NULL, '[]', '[]', NULL, NULL, NULL, 0, NULL, ?)
        """,
        (paper_id, title or paper_id, source_url),
    )
    cur.execute(
        """
        INSERT OR IGNORE INTO library_papers (library_id, paper_id, source_path, file_sha256)
        VALUES (?, ?, ?, ?)
        """,
        (library_id, paper_id, source_path, file_sha256),
    )
    _persist_processing_snapshot_with_cursor(
        cur,
        library_id=library_id,
        snapshot={
            "paper_id": paper_id,
            "processing_status": "indexed",
            "reading_profile": "",
            "analysis_focuses": [],
            "reading_status": "",
            "imported_at": None,
            "updated_at": None,
            "completed_at": None,
            "last_error": "",
            "extraction_rows": _build_extraction_rows({"metadata": True}),
        },
    )
    conn.commit()
    conn.close()


def attach_metadata_paper_to_library(
    *,
    library_id: int,
    paper_id: str,
    title: str = "",
    authors: list[str] | None = None,
    year: int | None = None,
    source_url: str = "",
) -> None:
    conn = get_connection()
    cur = conn.cursor()
    _ensure_processing_state_schema(conn)
    cur.execute(
        """
        INSERT INTO papers
        (paper_id, title, authors, year, fields, jel, triage_decision, triage_summary, average_score, has_card, abstract, nber_url)
        VALUES (?, ?, ?, ?, '[]', '[]', NULL, NULL, NULL, 0, NULL, ?)
        ON CONFLICT(paper_id) DO UPDATE SET
            title = COALESCE(NULLIF(excluded.title, ''), papers.title),
            authors = CASE WHEN excluded.authors != '[]' THEN excluded.authors ELSE papers.authors END,
            year = COALESCE(excluded.year, papers.year),
            nber_url = COALESCE(NULLIF(excluded.nber_url, ''), papers.nber_url)
        """,
        (
            paper_id,
            title or paper_id,
            json.dumps(authors or []),
            year,
            source_url,
        ),
    )
    cur.execute(
        """
        INSERT OR IGNORE INTO library_papers (library_id, paper_id, source_path, file_sha256)
        VALUES (?, ?, '', '')
        """,
        (library_id, paper_id),
    )
    _persist_processing_snapshot_with_cursor(
        cur,
        library_id=library_id,
        snapshot={
            "paper_id": paper_id,
            "processing_status": "indexed",
            "reading_profile": "metadata_only",
            "analysis_focuses": [],
            "imported_at": None,
            "updated_at": None,
            "completed_at": None,
            "last_error": "",
        },
    )
    conn.commit()
    conn.close()


def is_duplicate_file_for_library(library_id: int, file_sha256: str) -> bool:
    if not file_sha256:
        return False
    conn = get_connection()
    row = conn.execute(
        "SELECT 1 FROM library_papers WHERE library_id = ? AND file_sha256 = ?",
        (library_id, file_sha256),
    ).fetchone()
    conn.close()
    return row is not None


def create_import_batch(
    *,
    library_id: int,
    source_type: str,
    source_label: str = "",
    total_files: int = 0,
) -> int:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO import_batches
        (library_id, source_type, source_label, total_files)
        VALUES (?, ?, ?, ?)
        """,
        (library_id, source_type, source_label, total_files),
    )
    batch_id = int(cur.lastrowid)
    conn.commit()
    conn.close()
    return batch_id


def add_import_batch_file(
    *,
    batch_id: int,
    filename: str,
    status: str,
    paper_id: str = "",
    detail: str = "",
) -> None:
    conn = get_connection()
    conn.execute(
        """
        INSERT INTO import_batch_files
        (batch_id, filename, paper_id, status, detail)
        VALUES (?, ?, ?, ?, ?)
        """,
        (batch_id, filename, paper_id, status, detail),
    )
    conn.commit()
    conn.close()


def finalize_import_batch(
    *,
    batch_id: int,
    imported_files: int,
    skipped_files: int,
    failed_files: int,
) -> None:
    conn = get_connection()
    conn.execute(
        """
        UPDATE import_batches
        SET imported_files = ?,
            skipped_files = ?,
            failed_files = ?
        WHERE id = ?
        """,
        (imported_files, skipped_files, failed_files, batch_id),
    )
    conn.commit()
    conn.close()


def list_import_batches(
    *,
    library_id: int | None = None,
    limit: int = 20,
    file_limit: int = 20,
) -> list[dict[str, object]]:
    conn = get_connection()
    cur = conn.cursor()
    binds: list[object] = []
    where_sql = ""
    if library_id is not None:
        where_sql = "WHERE b.library_id = ?"
        binds.append(library_id)

    rows = cur.execute(
        f"""
        SELECT b.*,
               l.name AS library_name
        FROM import_batches b
        JOIN libraries l ON l.id = b.library_id
        {where_sql}
        ORDER BY b.created_at DESC, b.id DESC
        LIMIT ?
        """,
        [*binds, limit],
    ).fetchall()

    batch_ids = [int(row["id"]) for row in rows]
    files_by_batch: dict[int, list[dict[str, object]]] = {batch_id: [] for batch_id in batch_ids}

    if batch_ids:
        placeholders = ",".join("?" for _ in batch_ids)
        file_rows = cur.execute(
            f"""
            SELECT *
            FROM import_batch_files
            WHERE batch_id IN ({placeholders})
            ORDER BY created_at DESC, id DESC
            """,
            batch_ids,
        ).fetchall()
        file_counts: dict[int, int] = {}
        for row in file_rows:
            batch_id = int(row["batch_id"])
            current_count = file_counts.get(batch_id, 0)
            if current_count >= file_limit:
                continue
            files_by_batch.setdefault(batch_id, []).append(dict(row))
            file_counts[batch_id] = current_count + 1

    conn.close()
    return [
        {
            **dict(row),
            "files": files_by_batch.get(int(row["id"]), []),
        }
        for row in rows
    ]
