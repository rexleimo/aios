#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if command -v cygpath >/dev/null 2>&1; then
  ROOT_DIR="$(cygpath -w "$ROOT_DIR")"
fi
OUT_DIR="$ROOT_DIR/dist/release"

usage() {
  cat <<'USAGE'
Package AIOS release assets (GitHub Releases)

Usage:
  scripts/package-release.sh [--out <dir>]

Outputs:
  - aios.tar.gz      (macOS/Linux)
  - aios.zip         (Windows)
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
if command -v cygpath >/dev/null 2>&1 && [[ "${OUT_DIR:1:1}" == ":" ]]; then
  OUT_DIR="$(cygpath -u "$OUT_DIR")"
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
require_cmd npm
if command -v powershell.exe >/dev/null 2>&1 && command -v cygpath >/dev/null 2>&1; then
  ZIP_MODE="powershell"
  ZIP_BIN=""
elif [[ -x /usr/bin/zip ]]; then
  ZIP_MODE="zip"
  ZIP_BIN="/usr/bin/zip"
else
  ZIP_MODE="zip"
  ZIP_BIN="$(command -v zip || true)"
fi
if [[ "$ZIP_MODE" == "zip" && -z "$ZIP_BIN" ]]; then
  echo "Missing required command: zip" >&2
  exit 1
fi

rex_harness_root="$ROOT_DIR/rex-harness"
if [[ ! -f "$rex_harness_root/src/index.mjs" || ! -f "$rex_harness_root/bin/rex-harness.mjs" || ! -f "$rex_harness_root/skill-sources/rex-workflow/SKILL.md" ]]; then
  echo "Missing required rex-harness runtime. Initialize the submodule first:" >&2
  echo "  git -C \"$ROOT_DIR\" submodule update --init --recursive -- rex-harness" >&2
  exit 1
fi

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

release_paths=(
  AGENTS.md CHANGELOG.md VERSION .nvmrc .node-version .npmrc
  package.json package-lock.json
  README.md README-zh.md
  skills-lock.json
  client-sources agent-sources skill-sources rex-harness
  config scripts mcp-server src packages/debug-hub
)

# Client roots are local generated projections. Shipping them would reintroduce
# stale Superpowers files; installers project only the current Rex skills.

existing_release_paths=()
for release_path in "${release_paths[@]}"; do
  if [[ -e "$ROOT_DIR/$release_path" ]]; then
    existing_release_paths+=("$release_path")
  fi
done

debug_hub_root="$ROOT_DIR/packages/debug-hub"
if [[ ! -f "$debug_hub_root/package.json" ]]; then
  echo "Missing required debug-hub package: $debug_hub_root/package.json" >&2
  exit 1
fi
echo "+ build debug-hub"
npm --prefix "$debug_hub_root" run build

echo "+ cp installers -> $OUT_DIR"
cp "$install_sh" "$OUT_DIR/aios-install.sh"
cp "$install_ps1" "$OUT_DIR/aios-install.ps1"
chmod +x "$OUT_DIR/aios-install.sh" || true

echo "+ tar -> $OUT_DIR/aios.tar.gz"
tar_stage="$(mktemp -d)"
trap 'rm -rf "$tar_stage"' EXIT
mkdir -p "$tar_stage/aios"
(
  cd "$ROOT_DIR"
  tar -cf - \
    --exclude='.git' \
    --exclude='node_modules' \
    --exclude='mcp-server/.npm-cache' \
    --exclude='rex-harness/.git' \
    --exclude='rex-harness/.git/*' \
    --exclude='scripts/lib/components/superpowers' \
    --exclude='scripts/lib/components/superpowers/*' \
    --exclude='mcp-server/dist' \
    --exclude='mcp-server/dist/*' \
    --exclude='__pycache__' \
    --exclude='.mypy_cache' \
    --exclude='.aios' \
    --exclude='*.pyc' \
    --exclude='.DS_Store' \
    "${existing_release_paths[@]}" | (cd "$tar_stage/aios" && tar -xf -)
)
if [[ ! -f "$tar_stage/aios/rex-harness/src/index.mjs" ]]; then
  echo "Release archive did not materialize rex-harness/src/index.mjs" >&2
  exit 1
fi
# A deleted legacy directory can remain ignored in a developer worktree. Do not
# preserve its empty directory entry in either release archive.
rmdir "$tar_stage/aios/scripts/lib/components/superpowers" 2>/dev/null || true
(
  cd "$tar_stage"
  tar -czf "$OUT_DIR/aios.tar.gz" aios
)
if [[ ! -s "$OUT_DIR/aios.tar.gz" ]]; then
  echo "tar archive was not created: $OUT_DIR/aios.tar.gz" >&2
  exit 1
fi

echo "+ zip -> $OUT_DIR/aios.zip"
rm -f "$OUT_DIR/aios.zip"
if [[ "$ZIP_MODE" == "powershell" ]]; then
  zip_source_win="$(cygpath -w "$tar_stage/aios")"
  zip_output_win="$(cygpath -w "$OUT_DIR/aios.zip")"
  ps_command="\$source = '$zip_source_win'; \$destination = '$zip_output_win'; Compress-Archive -Path \$source -DestinationPath \$destination -Force"
  powershell.exe -NoLogo -NoProfile -NonInteractive -Command "$ps_command"
else
  (
    cd "$tar_stage"
    "$ZIP_BIN" -r "$OUT_DIR/aios.zip" \
      aios \
      -x '*.pyc' -x '*/__pycache__/*' -x '*/node_modules/*' -x '*/mcp-server/.npm-cache/*' -x '*/scripts/lib/components/superpowers' -x '*/scripts/lib/components/superpowers/*' -x '*/mcp-server/dist' -x '*/mcp-server/dist/*' -x '*/.git/*' -x '*/rex-harness/.git/*' -x '*/.aios/*' -x '*/.mypy_cache/*' -x '*/.DS_Store'
  )
fi
if [[ ! -s "$OUT_DIR/aios.zip" ]]; then
  echo "zip archive was not created: $OUT_DIR/aios.zip" >&2
  exit 1
fi

echo ""
echo "Done. Assets:"
ls -la "$OUT_DIR"
