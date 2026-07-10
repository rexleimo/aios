#!/usr/bin/env bash
set -euo pipefail

# Use AIOS_ROOT if set, otherwise derive from script location
if [[ -n "${AIOS_ROOT:-}" ]]; then
  SCRIPT_DIR="$AIOS_ROOT/scripts"
elif [[ -n "${AIOS_ROOT_DIR:-}" ]]; then
  SCRIPT_DIR="$AIOS_ROOT_DIR/scripts"
else
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fi

if ! command -v node >/dev/null 2>&1; then
  echo "[warn] node not found; cannot run bootstrap task doctor"
  exit 0
fi

echo "+ node \"$SCRIPT_DIR/doctor-bootstrap-task.mjs\" $*"
node "$SCRIPT_DIR/doctor-bootstrap-task.mjs" "$@"
