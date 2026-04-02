#!/bin/bash
# ============================================================================
# Paper Pipeline CLI
#
# Usage:
#   ./scripts/pipeline.sh discover            # Check NBER API for new papers
#   ./scripts/pipeline.sh process w35000      # Download & process a paper by ID
#   ./scripts/pipeline.sh upload /path/to.pdf [paper_id]  # Register a local PDF
#   ./scripts/pipeline.sh run [agent] [batch]  # Run the agent pipeline
#   ./scripts/pipeline.sh refresh             # Refresh website DB
#   ./scripts/pipeline.sh status              # Show pipeline status
# ============================================================================

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_DIR="$PROJECT_ROOT/backend"
DATA_DIR="$PROJECT_ROOT/Data"
PAPERS_DIR="$DATA_DIR/papers"
AGENT_DB="$DATA_DIR/nber_papers.db"

# Python interpreter — prefer the one in any active virtual-env
PYTHON="${PYTHON:-python3}"

# Colours (if terminal supports them)
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

info()  { echo -e "${BLUE}[INFO]${NC}  $*"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; }

# ---------------------------------------------------------------------------

cmd_discover() {
    info "Checking NBER API for new papers..."
    $PYTHON -c "
import sys
sys.path.insert(0, '$BACKEND_DIR')
from pipeline import discover_new_papers
papers = discover_new_papers(limit=${1:-20})
if not papers:
    print('No new papers found.')
else:
    print(f'Found {len(papers)} new paper(s):')
    for p in papers:
        print(f\"  {p['paper_id']:>8}  {p['title'][:70]}\")
"
}

cmd_process() {
    local paper_id="${1:?Usage: pipeline.sh process <paper_id>}"
    info "Processing paper $paper_id ..."

    $PYTHON -c "
import sys, asyncio, json
sys.path.insert(0, '$BACKEND_DIR')
from pipeline import process_paper
result = asyncio.run(process_paper('$paper_id'))
print(json.dumps(result, indent=2))
"
}

cmd_upload() {
    local pdf_path="${1:?Usage: pipeline.sh upload <pdf_path> [paper_id]}"
    local paper_id="${2:-}"

    if [ ! -f "$pdf_path" ]; then
        error "File not found: $pdf_path"
        exit 1
    fi

    # Copy to papers dir
    mkdir -p "$PAPERS_DIR"

    info "Registering $pdf_path ..."
    $PYTHON -c "
import sys, json
sys.path.insert(0, '$BACKEND_DIR')
from pipeline import process_uploaded_pdf
from pathlib import Path
pdf_bytes = Path('$pdf_path').read_bytes()
result = process_uploaded_pdf(pdf_bytes, paper_id='$paper_id' or None, filename='$(basename "$pdf_path")')
print(json.dumps(result, indent=2))
"
}

cmd_run() {
    local agent="${1:-full-cycle}"
    local batch_size="${2:-10}"

    info "Running agent pipeline: agent=$agent  batch_size=$batch_size"
    $PYTHON -c "
import sys, json
sys.path.insert(0, '$BACKEND_DIR')
from pipeline import run_agent_pipeline
result = run_agent_pipeline(agent='$agent', batch_size=$batch_size)
print(json.dumps(result, indent=2))
"
}

cmd_refresh() {
    info "Refreshing website database..."
    $PYTHON -c "
import sys, json
sys.path.insert(0, '$BACKEND_DIR')
from pipeline import refresh_website_db
result = refresh_website_db()
print(json.dumps(result, indent=2, default=str))
"
}

cmd_status() {
    info "Pipeline status"
    $PYTHON -c "
import sys, json
sys.path.insert(0, '$BACKEND_DIR')
from pipeline import get_pipeline_status
status = get_pipeline_status()
counts = status.get('counts', {})
print()
print('  Agent DB exists :', status.get('agent_db_exists'))
print('  Downloaded PDFs :', status.get('downloaded_pdfs'))
print()
print('  Counts:')
for k, v in counts.items():
    print(f'    {k:>20}: {v}')
print()
recent = status.get('recent', [])
if recent:
    print('  Recent activity:')
    for r in recent:
        print(f\"    {r['paper_id']:>10}  {r['status']:<12}  {r.get('triage_decision') or '-':<12}  {r.get('updated_at') or ''}\")
"
}

cmd_help() {
    echo "Paper Pipeline CLI"
    echo ""
    echo "Usage: $(basename "$0") <command> [args...]"
    echo ""
    echo "Commands:"
    echo "  discover            Check NBER API for new papers"
    echo "  process <paper_id>  Download & process a specific paper"
    echo "  upload <pdf> [id]   Register a local PDF file"
    echo "  run [agent] [batch] Run the agent pipeline (default: full-cycle, 10)"
    echo "  refresh             Refresh website DB (ingest + embeddings)"
    echo "  status              Show pipeline status"
    echo "  help                Show this help"
}

# ---------------------------------------------------------------------------

case "${1:-help}" in
    discover) shift; cmd_discover "$@" ;;
    process)  shift; cmd_process "$@" ;;
    upload)   shift; cmd_upload "$@" ;;
    run)      shift; cmd_run "$@" ;;
    refresh)  shift; cmd_refresh "$@" ;;
    status)   shift; cmd_status "$@" ;;
    help|--help|-h) cmd_help ;;
    *)
        error "Unknown command: $1"
        cmd_help
        exit 1
        ;;
esac
