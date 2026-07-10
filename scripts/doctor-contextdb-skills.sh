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
exec "$SCRIPT_DIR/aios.sh" internal skills doctor "$@"
