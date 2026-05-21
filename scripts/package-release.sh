#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$ROOT_DIR/dist/release"

usage() {
  cat <<'USAGE'
Package AIOS release assets (GitHub Releases)

Usage:
  scripts/package-release.sh [--out <dir>]

Outputs:
  - harness-cli.tar.gz      (macOS/Linux)
  - harness-cli.zip         (Windows)
  - aios-install.sh     (one-liner installer, bash/zsh)
  - aios-install.ps1    (one-liner installer, PowerShell)
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --out)
      OUT_DIR="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown arg: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ "$OUT_DIR" == "~/"* ]]; then
  OUT_DIR="$HOME/${OUT_DIR#\~/}"
fi
if [[ "$OUT_DIR" != /* ]]; then
  OUT_DIR="$ROOT_DIR/$OUT_DIR"
fi
mkdir -p "$OUT_DIR"
OUT_DIR="$(cd "$OUT_DIR" && pwd)"

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing required command: $cmd" >&2
    exit 1
  fi
}

require_cmd git
require_cmd gzip

install_sh="$ROOT_DIR/scripts/aios-install.sh"
install_ps1="$ROOT_DIR/scripts/aios-install.ps1"

if [[ ! -f "$install_sh" ]]; then
  echo "Missing installer script: $install_sh" >&2
  exit 1
fi
if [[ ! -f "$install_ps1" ]]; then
  echo "Missing installer script: $install_ps1" >&2
  exit 1
fi

echo "+ cp installers -> $OUT_DIR"
cp "$install_sh" "$OUT_DIR/aios-install.sh"
cp "$install_ps1" "$OUT_DIR/aios-install.ps1"
chmod +x "$OUT_DIR/aios-install.sh" || true

echo "+ tar -> $OUT_DIR/harness-cli.tar.gz"
(
  cd "$ROOT_DIR"
  tar -czf "$OUT_DIR/harness-cli.tar.gz" \
    --transform 's|^|harness-cli/|' \
    --exclude='.git' \
    --exclude='node_modules' \
    --exclude='dist' \
    --exclude='__pycache__' \
    --exclude='.mypy_cache' \
    --exclude='.aios' \
    --exclude='*.pyc' \
    --exclude='.DS_Store' \
    AGENTS.md CHANGELOG.md VERSION \
    package.json package-lock.json \
    README.md README-zh.md \
    skills-lock.json \
    client-sources agent-sources skill-sources \
    config scripts mcp-server \
    .claude/agents .claude/skills \
    .codex/skills .codex/agents \
    .agents/skills .opencode/skills
)

echo "+ zip -> $OUT_DIR/harness-cli.zip"
(
  cd "$ROOT_DIR"
  zip -r "$OUT_DIR/harness-cli.zip" \
    AGENTS.md CHANGELOG.md VERSION \
    package.json package-lock.json \
    README.md README-zh.md \
    skills-lock.json \
    client-sources agent-sources skill-sources \
    config scripts mcp-server \
    .claude/agents .claude/skills \
    .codex/skills .codex/agents \
    .agents/skills .opencode/skills \
    -x '*.pyc' -x '__pycache__/*' -x 'node_modules/*' -x 'dist/*' -x '.git/*' -x '.aios/*' -x '.mypy_cache/*' -x '.DS_Store'
)

echo ""
echo "Done. Assets:"
ls -la "$OUT_DIR"
