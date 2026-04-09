#!/usr/bin/env bash

set -euo pipefail

LABEL="${LABEL:-com.tao.nber-website}"
PLIST_PATH="$HOME/Library/LaunchAgents/$LABEL.plist"

launchctl unload "$PLIST_PATH" >/dev/null 2>&1 || true
rm -f "$PLIST_PATH"

echo "Removed launch agent: $LABEL"
echo "Plist removed: $PLIST_PATH"
