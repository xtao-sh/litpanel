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
BACKEND_PORT="${BACKEND_PORT:-8001}"
FRONTEND_HOST="${FRONTEND_HOST:-127.0.0.1}"
FRONTEND_PORT="${FRONTEND_PORT:-3001}"

mkdir -p "$LOG_DIR" "$PID_DIR"

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

require_command() {
  if ! command_exists "$1"; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
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

ensure_backend_env() {
  require_command python3

  if [[ ! -d "$BACKEND_VENV" ]]; then
    echo "Creating backend virtual environment..."
    python3 -m venv "$BACKEND_VENV"
  fi

  # shellcheck disable=SC1091
  source "$BACKEND_VENV/bin/activate"

  if [[ ! -f "$BACKEND_VENV/.deps_ready" ]] || [[ "$BACKEND_DIR/requirements.txt" -nt "$BACKEND_VENV/.deps_ready" ]]; then
    echo "Installing backend dependencies..."
    pip install --upgrade pip
    pip install -r "$BACKEND_DIR/requirements.txt"
    touch "$BACKEND_VENV/.deps_ready"
  fi

  deactivate
}

ensure_frontend_env() {
  require_command npm

  if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
    echo "Installing frontend dependencies..."
    (cd "$FRONTEND_DIR" && npm install)
  fi
}

start_backend() {
  local pid
  pid="$(read_pid "$BACKEND_PID_FILE")"
  if [[ -n "${pid:-}" ]] && pid_is_running "$pid"; then
    echo "Backend already running on PID $pid."
    return
  fi

  echo "Starting backend on http://$BACKEND_HOST:$BACKEND_PORT ..."
  (
    cd "$BACKEND_DIR"
    # shellcheck disable=SC1091
    source "$BACKEND_VENV/bin/activate"
    exec python3 -m uvicorn app:app \
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

  echo "Starting frontend on http://$FRONTEND_HOST:$FRONTEND_PORT ..."
  (
    cd "$FRONTEND_DIR"
    export NEXT_PUBLIC_API_URL="http://$BACKEND_HOST:$BACKEND_PORT"
    export NEXT_PUBLIC_GRAPHQL_URL="http://$BACKEND_HOST:$BACKEND_PORT/graphql"
    exec npm run dev -- --hostname "$FRONTEND_HOST" --port "$FRONTEND_PORT"
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

Environment overrides:
  BACKEND_HOST   Default: 127.0.0.1
  BACKEND_PORT   Default: 8001
  FRONTEND_HOST  Default: 127.0.0.1
  FRONTEND_PORT  Default: 3001
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
      status_service "backend" "$BACKEND_PID_FILE" "$BACKEND_LOG"
      status_service "frontend" "$FRONTEND_PID_FILE" "$FRONTEND_LOG"
      ;;
    *)
      usage
      exit 1
      ;;
  esac
}

main "$@"
