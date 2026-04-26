#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
RUN_DIR="$ROOT_DIR/.run"
LOG_DIR="$RUN_DIR/logs"
BACKEND_VENV="$BACKEND_DIR/.venv"
BACKEND_LOG="$LOG_DIR/backend.log"
FRONTEND_LOG="$LOG_DIR/frontend.log"
SUPERVISOR_LOG="$LOG_DIR/supervisor.log"

BACKEND_HOST="${BACKEND_HOST:-127.0.0.1}"
BACKEND_PORT="${BACKEND_PORT:-8050}"
FRONTEND_HOST="${FRONTEND_HOST:-127.0.0.1}"
FRONTEND_PORT="${FRONTEND_PORT:-3050}"
PYTHON_BIN="${PYTHON_BIN:-}"
PROJECT_PYTHONPATH="$ROOT_DIR:$BACKEND_DIR${PYTHONPATH:+:$PYTHONPATH}"

mkdir -p "$LOG_DIR"

: >"$SUPERVISOR_LOG"
: >"$BACKEND_LOG"
: >"$FRONTEND_LOG"

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

frontend_next_bin() {
  echo "$FRONTEND_DIR/node_modules/.bin/next"
}

require_command() {
  if ! command_exists "$1"; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

resolve_python_bin() {
  if [[ -n "$PYTHON_BIN" ]]; then
    require_command "$PYTHON_BIN"
  elif command_exists python3.11; then
    PYTHON_BIN="$(command -v python3.11)"
  else
    require_command python3
    PYTHON_BIN="$(command -v python3)"
  fi

  "$PYTHON_BIN" - <<'PY'
import sys

if sys.version_info < (3, 10):
    raise SystemExit(
        "Python 3.10+ is required for the backend. "
        "Set PYTHON_BIN to a newer interpreter, for example PYTHON_BIN=python3.11."
    )
PY
}

log() {
  local message="$1"
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$message" | tee -a "$SUPERVISOR_LOG"
}

pid_is_running() {
  local pid="$1"
  kill -0 "$pid" >/dev/null 2>&1
}

port_has_external_listener() {
  local port="$1"
  local pid_a="${2:-}"
  local pid_b="${3:-}"
  "$PYTHON_BIN" - "$port" "$pid_a" "$pid_b" <<'PY'
import subprocess
import sys

port = sys.argv[1]
allowed = {pid for pid in sys.argv[2:] if pid}

try:
    output = subprocess.check_output(
        ["lsof", "-nP", f"-iTCP:{port}", "-sTCP:LISTEN", "-Fp"],
        stderr=subprocess.DEVNULL,
        text=True,
    )
except subprocess.CalledProcessError:
    sys.exit(1)

pids = {line[1:] for line in output.splitlines() if line.startswith("p")}
external = sorted(pid for pid in pids if pid not in allowed)
if external:
    print(",".join(external))
    sys.exit(0)
sys.exit(1)
PY
}

ensure_backend_env() {
  resolve_python_bin

  if [[ -x "$BACKEND_VENV/bin/python" ]] && ! "$BACKEND_VENV/bin/python" -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)' >/dev/null 2>&1; then
    log "Recreating backend virtual environment with Python 3.10+..."
    rm -rf "$BACKEND_VENV"
  fi

  if [[ ! -d "$BACKEND_VENV" ]]; then
    log "Creating backend virtual environment..."
    "$PYTHON_BIN" -m venv "$BACKEND_VENV"
  fi

  "$BACKEND_VENV/bin/python" -m ensurepip --upgrade >/dev/null 2>&1 || true

  if [[ ! -f "$BACKEND_VENV/.deps_ready" ]] || [[ "$BACKEND_DIR/requirements.txt" -nt "$BACKEND_VENV/.deps_ready" ]]; then
    log "Installing backend dependencies..."
    "$BACKEND_VENV/bin/python" -m pip install --upgrade pip >>"$SUPERVISOR_LOG" 2>&1
    "$BACKEND_VENV/bin/python" -m pip install -r "$BACKEND_DIR/requirements.txt" >>"$SUPERVISOR_LOG" 2>&1
    touch "$BACKEND_VENV/.deps_ready"
  fi
}

ensure_frontend_env() {
  require_command npm
  if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
    log "Installing frontend dependencies..."
    (cd "$FRONTEND_DIR" && npm install >>"$SUPERVISOR_LOG" 2>&1)
  fi
  if [[ ! -x "$(frontend_next_bin)" ]]; then
    log "Next.js executable not found at $(frontend_next_bin)."
    exit 1
  fi
}

frontend_sources_changed() {
  local build_marker="$1"

  if [[ "$FRONTEND_DIR/package.json" -nt "$build_marker" ]]; then
    return 0
  fi
  if [[ -f "$FRONTEND_DIR/package-lock.json" ]] && [[ "$FRONTEND_DIR/package-lock.json" -nt "$build_marker" ]]; then
    return 0
  fi
  if find "$FRONTEND_DIR/src" -type f -newer "$build_marker" -print -quit 2>/dev/null | grep -q .; then
    return 0
  fi
  if [[ -d "$FRONTEND_DIR/public" ]] && find "$FRONTEND_DIR/public" -type f -newer "$build_marker" -print -quit 2>/dev/null | grep -q .; then
    return 0
  fi
  return 1
}

ensure_frontend_build() {
  local build_marker="$FRONTEND_DIR/.next/BUILD_ID"
  if [[ ! -f "$build_marker" ]] || frontend_sources_changed "$build_marker"; then
    log "Building frontend production bundle..."
    (
      cd "$FRONTEND_DIR"
      export NEXT_PUBLIC_API_URL="http://$BACKEND_HOST:$BACKEND_PORT"
      export NEXT_PUBLIC_GRAPHQL_URL="http://$BACKEND_HOST:$BACKEND_PORT/graphql"
      npm run build >>"$SUPERVISOR_LOG" 2>&1
    )
  fi
}

BACKEND_CHILD=""
FRONTEND_CHILD=""

stop_children() {
  for pid in "$FRONTEND_CHILD" "$BACKEND_CHILD"; do
    if [[ -n "${pid:-}" ]] && pid_is_running "$pid"; then
      kill "$pid" >/dev/null 2>&1 || true
    fi
  done

  sleep 1

  for pid in "$FRONTEND_CHILD" "$BACKEND_CHILD"; do
    if [[ -n "${pid:-}" ]] && pid_is_running "$pid"; then
      kill -9 "$pid" >/dev/null 2>&1 || true
    fi
  done
}

cleanup_and_exit() {
  log "Stopping supervised services..."
  stop_children
  exit 0
}

start_backend() {
  log "Starting backend on http://$BACKEND_HOST:$BACKEND_PORT"
  (
    cd "$BACKEND_DIR"
    export PYTHONPATH="$PROJECT_PYTHONPATH"
    exec "$BACKEND_VENV/bin/python" -m uvicorn app:app \
      --host "$BACKEND_HOST" \
      --port "$BACKEND_PORT"
  ) >>"$BACKEND_LOG" 2>&1 &
  BACKEND_CHILD="$!"
}

start_frontend() {
  log "Starting frontend on http://$FRONTEND_HOST:$FRONTEND_PORT"
  (
    cd "$FRONTEND_DIR"
    export NEXT_PUBLIC_API_URL="http://$BACKEND_HOST:$BACKEND_PORT"
    export NEXT_PUBLIC_GRAPHQL_URL="http://$BACKEND_HOST:$BACKEND_PORT/graphql"
    exec "$(frontend_next_bin)" start --hostname "$FRONTEND_HOST" --port "$FRONTEND_PORT"
  ) >>"$FRONTEND_LOG" 2>&1 &
  FRONTEND_CHILD="$!"
}

wait_for_readiness() {
  local backend_ready=0
  local frontend_ready=0
  for _ in {1..60}; do
    if [[ $backend_ready -eq 0 ]] && curl -fsS "http://$BACKEND_HOST:$BACKEND_PORT/api/health" >/dev/null 2>&1; then
      backend_ready=1
    fi
    if [[ $frontend_ready -eq 0 ]] && curl -fsS "http://$FRONTEND_HOST:$FRONTEND_PORT" >/dev/null 2>&1; then
      frontend_ready=1
    fi
    if [[ $backend_ready -eq 1 && $frontend_ready -eq 1 ]]; then
      log "Services ready: frontend http://$FRONTEND_HOST:$FRONTEND_PORT , backend http://$BACKEND_HOST:$BACKEND_PORT"
      return 0
    fi
    sleep 1
  done
  log "Timed out waiting for services to become ready."
  return 1
}

trap cleanup_and_exit INT TERM

require_command curl
ensure_backend_env
ensure_frontend_env
ensure_frontend_build

while true; do
  if external_backend="$(port_has_external_listener "$BACKEND_PORT" 2>/dev/null)"; then
    log "Backend port $BACKEND_PORT is already used by another process: $external_backend"
    sleep 10
    continue
  fi

  if external_frontend="$(port_has_external_listener "$FRONTEND_PORT" 2>/dev/null)"; then
    log "Frontend port $FRONTEND_PORT is already used by another process: $external_frontend"
    sleep 10
    continue
  fi

  start_backend
  start_frontend
  wait_for_readiness || true

  while true; do
    if ! pid_is_running "$BACKEND_CHILD"; then
      log "Backend exited. Restarting both services..."
      stop_children
      break
    fi
    if ! pid_is_running "$FRONTEND_CHILD"; then
      log "Frontend exited. Restarting both services..."
      stop_children
      break
    fi
    sleep 2
  done

  sleep 2
done
