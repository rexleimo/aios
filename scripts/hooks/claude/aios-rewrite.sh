#!/usr/bin/env bash
# AIOS Claude PreToolUse hook: fail-open command rewrite delegate.
set +e
AIOS_ROOT_DIR="${AIOS_ROOT_DIR:-$(pwd)}"
AIOS_CLI="$AIOS_ROOT_DIR/scripts/aios.mjs"
if [ ! -f "$AIOS_CLI" ]; then
  exit 0
fi
payload="$(cat 2>/dev/null)"
if [ -z "$payload" ]; then
  exit 0
fi
node "$AIOS_CLI" interception rewrite --hook claude --input "$payload" --json 2>/dev/null || true
exit 0
