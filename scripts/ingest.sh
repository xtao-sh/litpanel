#!/bin/bash
# Re-run the ingestion pipeline to rebuild kb.db from markdown files
set -e

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR/backend"

echo "Running ingestion pipeline..."
python3 ingest.py
echo "Done. Database at: $PROJECT_DIR/backend/kb.db"
