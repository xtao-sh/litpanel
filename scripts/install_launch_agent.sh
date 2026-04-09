#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="$ROOT_DIR/.run"
LOG_DIR="$RUN_DIR/logs"

LABEL="${LABEL:-com.tao.nber-website}"
BACKEND_HOST="${BACKEND_HOST:-127.0.0.1}"
BACKEND_PORT="${BACKEND_PORT:-8011}"
FRONTEND_HOST="${FRONTEND_HOST:-127.0.0.1}"
FRONTEND_PORT="${FRONTEND_PORT:-3011}"
PLIST_PATH="$HOME/Library/LaunchAgents/$LABEL.plist"

mkdir -p "$LOG_DIR" "$HOME/Library/LaunchAgents"

cat >"$PLIST_PATH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>$LABEL</string>
    <key>ProgramArguments</key>
    <array>
      <string>/bin/zsh</string>
      <string>-lc</string>
      <string>cd "$ROOT_DIR" &amp;&amp; BACKEND_HOST="$BACKEND_HOST" BACKEND_PORT="$BACKEND_PORT" FRONTEND_HOST="$FRONTEND_HOST" FRONTEND_PORT="$FRONTEND_PORT" ./scripts/serve.sh</string>
    </array>
    <key>WorkingDirectory</key>
    <string>$ROOT_DIR</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>$LOG_DIR/launchd.out.log</string>
    <key>StandardErrorPath</key>
    <string>$LOG_DIR/launchd.err.log</string>
  </dict>
</plist>
EOF

launchctl unload "$PLIST_PATH" >/dev/null 2>&1 || true
launchctl load -w "$PLIST_PATH"
launchctl kickstart -k "gui/$(id -u)/$LABEL"

echo "Installed launch agent: $LABEL"
echo "Frontend: http://$FRONTEND_HOST:$FRONTEND_PORT"
echo "Backend:  http://$BACKEND_HOST:$BACKEND_PORT"
echo "Plist:    $PLIST_PATH"
