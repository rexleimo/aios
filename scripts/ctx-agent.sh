#!/usr/bin/env bash
set -euo pipefail

# Use AIOS_ROOT if set, otherwise derive from script location
if [[ -n "${AIOS_ROOT:-}" ]]; then
  ROOT_DIR="$AIOS_ROOT"
elif [[ -n "${AIOS_ROOT_DIR:-}" ]]; then
  ROOT_DIR="$AIOS_ROOT_DIR"
else
  ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fi
exec node "$ROOT_DIR/scripts/ctx-agent.mjs" "$@"
