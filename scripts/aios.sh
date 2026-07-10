#!/usr/bin/env bash
set -euo pipefail

# Use AIOS_ROOT if set, otherwise derive from script location
if [[ -n "${AIOS_ROOT:-}" ]]; then
  AIOS_DIR="$AIOS_ROOT"
elif [[ -n "${AIOS_ROOT_DIR:-}" ]]; then
  AIOS_DIR="$AIOS_ROOT_DIR"
else
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  AIOS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
fi

NODE_REQUIRED_MAJOR="$(tr -d '[:space:]' < "$AIOS_DIR/.nvmrc" | sed 's/^v//')"

print_node_help() {
  cat <<'EOF' >&2
AIOS now uses Node.js as the unified lifecycle runtime.

Install Node.js 24 LTS, then rerun this command.

All platforms:
  nvm install 24 && nvm use 24

macOS:
  brew install node     # or: nvm (recommended)

Linux:
  Use your distro package manager, NodeSource, or nvm (recommended)

Windows:
  winget install OpenJS.NodeJS.LTS   # or: nvm-windows (recommended)

Tip:
  scripts/aios.sh --install-node     # auto-install (macOS Homebrew only)
EOF
}

install_node() {
  local os_name
  os_name="$(uname -s)"

  if [[ "$os_name" == "Darwin" ]] && command -v brew >/dev/null 2>&1; then
    echo "+ brew install node"
    brew install node
    return 0
  fi

  echo "[err] automatic Node install is only wired for macOS/Homebrew in this wrapper." >&2
  print_node_help
  return 1
}

if ! command -v node >/dev/null 2>&1; then
  if [[ "${1:-}" == "--install-node" ]]; then
    shift
    install_node
  elif [[ -t 0 && -t 1 ]]; then
    printf 'Node.js %s.x is required. Install now? [y/N] ' "$NODE_REQUIRED_MAJOR" >&2
    read -r answer
    if [[ "$answer" =~ ^[Yy]$ ]]; then
      install_node
    else
      print_node_help
      exit 1
    fi
  else
    print_node_help
    exit 1
  fi
fi

node_major="$(node -p "process.versions.node.split('.')[0]")"
if [[ "$node_major" -lt "$NODE_REQUIRED_MAJOR" ]]; then
  echo "[err] Node.js >= $NODE_REQUIRED_MAJOR.x is required (found $(node -v))." >&2
  echo "[hint] If you have Node $NODE_REQUIRED_MAJOR installed via nvm, run: nvm use $NODE_REQUIRED_MAJOR" >&2
  print_node_help
  exit 1
fi

exec node "$AIOS_DIR/scripts/aios.mjs" "$@"
