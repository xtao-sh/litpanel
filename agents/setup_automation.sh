#!/bin/bash
# NBER Agent System — Daily Automation Setup
# Sets up a cron job to run the full agent pipeline automatically.

set -e

PROJECT_DIR="$HOME/NBER_Working_Papers"
PYTHON_BIN=$(which python3)

echo ""
echo "=== NBER Agent System: Daily Automation Setup ==="
echo ""
echo "Project dir: $PROJECT_DIR"
echo "Python: $PYTHON_BIN"

# Check python + dependencies
$PYTHON_BIN -c "import anthropic, PyPDF2" 2>/dev/null || {
  echo "Error: Missing Python dependencies. Run:"
  echo "  pip install anthropic PyPDF2"
  exit 1
}

# Check API key is loadable
$PYTHON_BIN -c "
from agents.config import API_KEY
assert API_KEY, 'No API key found'
print(f'API key found: {API_KEY[:15]}...')
" 2>/dev/null || {
  echo "Error: Cannot load Kimi API key. Check ~/.openclaw/openclaw.json or set KIMI_API_KEY."
  exit 1
}

# Preferred run time
read -p "What time should the pipeline run daily? (e.g. 09:00, default 08:00): " RUN_TIME
RUN_TIME=${RUN_TIME:-08:00}
HOUR=$(echo "$RUN_TIME" | cut -d: -f1)
MINUTE=$(echo "$RUN_TIME" | cut -d: -f2)

echo ""
echo "The daily run will:"
echo "  1. Scan arXiv for new papers"
echo "  2. Triage 50 pending papers (Scout)"
echo "  3. Deep-read top 10 papers (Reader)"
echo "  4. Update field maps (Linker, if enough new cards)"
echo "  5. Generate research ideas (Thinker)"
echo "  6. Stress-test ideas (Critic)"
echo ""

read -p "Proceed? (y/n, default y): " PROCEED
PROCEED=${PROCEED:-y}
if [ "$PROCEED" != "y" ]; then
  echo "Cancelled."
  exit 0
fi

# Build cron command
LOG_FILE="$PROJECT_DIR/agent_cron.log"
CRON_CMD="$MINUTE $HOUR * * * cd $PROJECT_DIR && $PYTHON_BIN -m agents.orchestrator --agent full-cycle >> $LOG_FILE 2>&1"

# Check for existing job
EXISTING=$(crontab -l 2>/dev/null | grep "agents.orchestrator" || true)
if [ -n "$EXISTING" ]; then
  echo ""
  echo "Existing cron job found:"
  echo "  $EXISTING"
  read -p "Replace it? (y/n, default y): " REPLACE
  REPLACE=${REPLACE:-y}
  if [ "$REPLACE" != "y" ]; then
    echo "Kept existing job."
    exit 0
  fi
  crontab -l 2>/dev/null | grep -v "agents.orchestrator" | crontab -
fi

# Install cron job
(crontab -l 2>/dev/null; echo "# NBER agent system daily run"; echo "$CRON_CMD") | crontab -

echo ""
echo "=== Setup complete! ==="
echo ""
echo "Daily run at:    $RUN_TIME"
echo "Cron log:        $LOG_FILE"
echo "Digests:         $PROJECT_DIR/knowledge_base/digests/"
echo "Ideas:           $PROJECT_DIR/knowledge_base/ideas/top_10.md"
echo ""
echo "To check:    crontab -l"
echo "To remove:   crontab -l | grep -v agents.orchestrator | crontab -"
echo "To run now:  cd $PROJECT_DIR && python3 -m agents.orchestrator --agent full-cycle"
