#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
RUN_DIR="$ROOT_DIR/.run"
LOG_DIR="$RUN_DIR/logs"
PID_DIR="$RUN_DIR/pids"
BACKEND_VENV="$BACKEND_DIR/.venv"
BACKEND_PID_FILE="$PID_DIR/backend.pid"
FRONTEND_PID_FILE="$PID_DIR/frontend.pid"
BACKEND_LOG="$LOG_DIR/backend.log"
FRONTEND_LOG="$LOG_DIR/frontend.log"
BACKEND_HOST="${BACKEND_HOST:-127.0.0.1}"
BACKEND_PORT="${BACKEND_PORT:-8050}"
FRONTEND_HOST="${FRONTEND_HOST:-127.0.0.1}"
FRONTEND_PORT="${FRONTEND_PORT:-3050}"
PYTHON_BIN="${PYTHON_BIN:-}"
PROJECT_PYTHONPATH="$ROOT_DIR:$BACKEND_DIR${PYTHONPATH:+:$PYTHONPATH}"

mkdir -p "$LOG_DIR" "$PID_DIR"

prepare_log_file() {
  : >"$1"
}

frontend_next_bin() {
  echo "$FRONTEND_DIR/node_modules/.bin/next"
}

command_exists() {
  command -v "$1" >/dev/null 2>&1
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

pid_is_running() {
  local pid="$1"
  kill -0 "$pid" >/dev/null 2>&1
}

read_pid() {
  local file="$1"
  if [[ -f "$file" ]]; then
    tr -d '[:space:]' <"$file"
  fi
}

cleanup_pid_file() {
  local file="$1"
  if [[ -f "$file" ]]; then
    rm -f "$file"
  fi
}

port_has_external_listener() {
  local port="$1"
  local pid_a="${2:-}"
  local pid_b="${3:-}"
  "$PYTHON_BIN" - "$port" "$pid_a" "$pid_b" <<'PYCODE'
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
PYCODE
}

ensure_frontend_dev_available() {
  local lock_file="$FRONTEND_DIR/.next/dev/lock"
  local lock_pid=""
  local lock_port=""

  if [[ -f "$lock_file" ]]; then
    read -r lock_pid lock_port < <(
      "$PYTHON_BIN" - "$lock_file" <<'PYCODE'
import json
import pathlib
import sys

payload = json.loads(pathlib.Path(sys.argv[1]).read_text())
print(payload.get("pid", ""), payload.get("port", ""))
PYCODE
    )

    if [[ -n "${lock_pid:-}" ]] && pid_is_running "$lock_pid"; then
      echo "Another Next.js dev server is already running for this frontend directory (PID $lock_pid, port ${lock_port:-unknown}). Stop it first or reuse that instance." >&2
      exit 1
    fi

    rm -f "$lock_file"
  fi
}

stop_service() {
  local name="$1"
  local pid_file="$2"
  local pid
  pid="$(read_pid "$pid_file")"

  if [[ -z "${pid:-}" ]]; then
    echo "$name is not running."
    cleanup_pid_file "$pid_file"
    return
  fi

  if pid_is_running "$pid"; then
    echo "Stopping $name (PID $pid)..."
    kill "$pid"
    for _ in {1..20}; do
      if ! pid_is_running "$pid"; then
        break
      fi
      sleep 0.5
    done
    if pid_is_running "$pid"; then
      echo "Force stopping $name (PID $pid)..."
      kill -9 "$pid"
    fi
  else
    echo "$name pid file exists but process is not running."
  fi

  cleanup_pid_file "$pid_file"
}

status_service() {
  local name="$1"
  local pid_file="$2"
  local log_file="$3"
  local pid
  pid="$(read_pid "$pid_file")"

  if [[ -n "${pid:-}" ]] && pid_is_running "$pid"; then
    echo "$name: running (PID $pid)"
  else
    echo "$name: stopped"
  fi

  if [[ -f "$log_file" ]]; then
    echo "  log: $log_file"
  fi
}

show_runtime_status() {
  local smoke_output
  smoke_output="$(mktemp)"

  status_service "backend" "$BACKEND_PID_FILE" "$BACKEND_LOG"
  echo "  url: http://$BACKEND_HOST:$BACKEND_PORT"
  status_service "frontend" "$FRONTEND_PID_FILE" "$FRONTEND_LOG"
  echo "  url: http://$FRONTEND_HOST:$FRONTEND_PORT"

  if [[ -x "$ROOT_DIR/scripts/smoke.sh" ]]; then
    if "$ROOT_DIR/scripts/smoke.sh" >"$smoke_output" 2>&1; then
      echo "smoke: passed"
    else
      echo "smoke: failed"
      sed 's/^/  /' "$smoke_output"
    fi
  else
    echo "smoke: unavailable (missing scripts/smoke.sh)"
  fi

  rm -f "$smoke_output"
}

ensure_backend_env() {
  resolve_python_bin

  if [[ -x "$BACKEND_VENV/bin/python" ]] && ! "$BACKEND_VENV/bin/python" -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)' >/dev/null 2>&1; then
    echo "Recreating backend virtual environment with Python 3.10+..."
    rm -rf "$BACKEND_VENV"
  fi

  if [[ ! -d "$BACKEND_VENV" ]]; then
    echo "Creating backend virtual environment..."
    "$PYTHON_BIN" -m venv "$BACKEND_VENV"
  fi

  "$BACKEND_VENV/bin/python" -m ensurepip --upgrade >/dev/null 2>&1 || true

  if [[ ! -f "$BACKEND_VENV/.deps_ready" ]] || [[ "$BACKEND_DIR/requirements.txt" -nt "$BACKEND_VENV/.deps_ready" ]]; then
    echo "Installing backend dependencies..."
    "$BACKEND_VENV/bin/python" -m pip install --upgrade pip
    "$BACKEND_VENV/bin/python" -m pip install -r "$BACKEND_DIR/requirements.txt"
    touch "$BACKEND_VENV/.deps_ready"
  fi
}

ensure_frontend_env() {
  require_command npm

  if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
    echo "Installing frontend dependencies..."
    (cd "$FRONTEND_DIR" && npm install)
  fi

  if [[ ! -x "$(frontend_next_bin)" ]]; then
    echo "Next.js executable not found at $(frontend_next_bin)." >&2
    exit 1
  fi
}

start_backend() {
  local pid
  pid="$(read_pid "$BACKEND_PID_FILE")"
  if [[ -n "${pid:-}" ]] && pid_is_running "$pid"; then
    echo "Backend already running on PID $pid."
    return
  fi

  if external_backend="$(port_has_external_listener "$BACKEND_PORT" "${pid:-}" 2>/dev/null)"; then
    echo "Backend port $BACKEND_PORT is already used by another process: $external_backend" >&2
    exit 1
  fi

  prepare_log_file "$BACKEND_LOG"
  echo "Starting backend on http://$BACKEND_HOST:$BACKEND_PORT ..."
  (
    cd "$BACKEND_DIR"
    export PYTHONPATH="$PROJECT_PYTHONPATH"
    exec "$BACKEND_VENV/bin/python" -m uvicorn app:app \
      --host "$BACKEND_HOST" \
      --port "$BACKEND_PORT" \
      --reload
  ) >"$BACKEND_LOG" 2>&1 &
  echo $! >"$BACKEND_PID_FILE"
}

start_frontend() {
  local pid
  pid="$(read_pid "$FRONTEND_PID_FILE")"
  if [[ -n "${pid:-}" ]] && pid_is_running "$pid"; then
    echo "Frontend already running on PID $pid."
    return
  fi

  ensure_frontend_dev_available

  if external_frontend="$(port_has_external_listener "$FRONTEND_PORT" "${pid:-}" 2>/dev/null)"; then
    echo "Frontend port $FRONTEND_PORT is already used by another process: $external_frontend" >&2
    exit 1
  fi

  prepare_log_file "$FRONTEND_LOG"
  echo "Starting frontend on http://$FRONTEND_HOST:$FRONTEND_PORT ..."
  (
    cd "$FRONTEND_DIR"
    export NEXT_PUBLIC_API_URL="http://$BACKEND_HOST:$BACKEND_PORT"
    export NEXT_PUBLIC_GRAPHQL_URL="http://$BACKEND_HOST:$BACKEND_PORT/graphql"
    exec "$(frontend_next_bin)" dev --hostname "$FRONTEND_HOST" --port "$FRONTEND_PORT"
  ) >"$FRONTEND_LOG" 2>&1 &
  echo $! >"$FRONTEND_PID_FILE"
}

wait_for_processes() {
  local backend_pid frontend_pid
  backend_pid="$(read_pid "$BACKEND_PID_FILE")"
  frontend_pid="$(read_pid "$FRONTEND_PID_FILE")"

  echo
  echo "Backend log:  $BACKEND_LOG"
  echo "Frontend log: $FRONTEND_LOG"
  echo "Frontend URL: http://$FRONTEND_HOST:$FRONTEND_PORT"
  echo "Backend URL:  http://$BACKEND_HOST:$BACKEND_PORT"
  echo
  echo "Press Ctrl+C to stop both services."

  trap 'stop_service "frontend" "$FRONTEND_PID_FILE"; stop_service "backend" "$BACKEND_PID_FILE"; exit 0' INT TERM

  while true; do
    if [[ -n "${backend_pid:-}" ]] && ! pid_is_running "$backend_pid"; then
      echo "Backend exited. See $BACKEND_LOG" >&2
      cleanup_pid_file "$BACKEND_PID_FILE"
      stop_service "frontend" "$FRONTEND_PID_FILE"
      exit 1
    fi
    if [[ -n "${frontend_pid:-}" ]] && ! pid_is_running "$frontend_pid"; then
      echo "Frontend exited. See $FRONTEND_LOG" >&2
      cleanup_pid_file "$FRONTEND_PID_FILE"
      stop_service "backend" "$BACKEND_PID_FILE"
      exit 1
    fi
    sleep 2
  done
}

start_all() {
  ensure_backend_env
  ensure_frontend_env
  start_backend
  start_frontend
  wait_for_processes
}

usage() {
  cat <<EOF
Usage: ./scripts/dev.sh <command>

Commands:
  start    Install missing deps and start backend + frontend
  stop     Stop backend + frontend
  restart  Restart backend + frontend
  status   Show current process status
  smoke    Run backend/frontend smoke checks

Environment overrides:
  PYTHON_BIN     Preferred Python interpreter for backend venv creation
  BACKEND_HOST   Default: 127.0.0.1
  BACKEND_PORT   Default: 8050
  FRONTEND_HOST  Default: 127.0.0.1
  FRONTEND_PORT  Default: 3050
EOF
}

main() {
  local cmd="${1:-start}"

  case "$cmd" in
    start)
      start_all
      ;;
    stop)
      stop_service "frontend" "$FRONTEND_PID_FILE"
      stop_service "backend" "$BACKEND_PID_FILE"
      ;;
    restart)
      stop_service "frontend" "$FRONTEND_PID_FILE"
      stop_service "backend" "$BACKEND_PID_FILE"
      start_all
      ;;
    status)
      show_runtime_status
      ;;
    smoke)
      exec "$ROOT_DIR/scripts/smoke.sh"
      ;;
    *)
      usage
      exit 1
      ;;
  esac
}

main "$@"
