#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE_REQUIRED_MAJOR="$(tr -d '[:space:]' < "$SCRIPT_DIR/../.nvmrc" | sed 's/^v//')"

print_node_help() {
  cat <<'EOF' >&2
AIOS now uses Node.js as the unified lifecycle runtime.

Install Node.js 24 LTS, then rerun this command.

macOS:
  brew install node

Linux:
  Use your distro package manager or NodeSource/nvm.

Tip:
  scripts/aios.sh --install-node
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
if [[ "$node_major" != "$NODE_REQUIRED_MAJOR" ]]; then
  echo "[err] Node.js $NODE_REQUIRED_MAJOR.x is required (found $(node -v))." >&2
  print_node_help
  exit 1
fi

exec node "$SCRIPT_DIR/aios.mjs" "$@"
