#!/usr/bin/env bash
set -euo pipefail

DEFAULT_REPO="rexleimo/harness-cli"
DEFAULT_INSTALL_DIR="$HOME/.rexcil/harness-cli"
DEFAULT_WRAP_MODE="opt-in"

usage() {
  cat <<'USAGE'
AIOS one-liner installer (Releases-first)

Usage:
  curl -fsSL https://github.com/rexleimo/harness-cli/releases/latest/download/aios-install.sh | bash

Optional environment variables:
  AIOS_REPO           GitHub repo, default: rexleimo/harness-cli
  AIOS_INSTALL_DIR    install dir, default: ~/.rexcil/harness-cli
  AIOS_STATE_DIR      state dir for installer-owned config, default: parent of install dir
  AIOS_WRAP_MODE      all|repo-only|opt-in|off (default: opt-in)
  AIOS_ASSET_URL      override harness-cli.tar.gz URL for offline install tests
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
  shift
done

AIOS_REPO="${AIOS_REPO:-$DEFAULT_REPO}"
AIOS_INSTALL_DIR="${AIOS_INSTALL_DIR:-$DEFAULT_INSTALL_DIR}"
AIOS_WRAP_MODE="${AIOS_WRAP_MODE:-$DEFAULT_WRAP_MODE}"

case "$AIOS_WRAP_MODE" in
  all|repo-only|opt-in|off) ;;
  *)
    echo "AIOS_WRAP_MODE must be one of: all, repo-only, opt-in, off" >&2
    exit 1
    ;;
esac

asset_url="${AIOS_ASSET_URL:-https://github.com/${AIOS_REPO}/releases/latest/download/harness-cli.tar.gz}"

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing required command: $cmd" >&2
    exit 1
  fi
}

download() {
  local url="$1"
  local out="$2"

  if [[ "$url" == file://* ]]; then
    local source_path="${url#file://}"
    if command -v cygpath >/dev/null 2>&1 && [[ "$source_path" =~ ^/?[A-Za-z]:[\\/].* ]]; then
      source_path="$(cygpath -u "$source_path")"
    fi
    if [[ ! -f "$source_path" ]]; then
      echo "Local asset not found: $source_path" >&2
      return 1
    fi
    cp -- "$source_path" "$out"
    return 0
  fi

  if command -v curl >/dev/null 2>&1; then
    curl -fL --retry 3 --connect-timeout 10 --max-time 600 -o "$out" "$url"
    return 0
  fi

  if command -v wget >/dev/null 2>&1; then
    wget -O "$out" "$url"
    return 0
  fi

  echo "Need curl or wget to download: $url" >&2
  exit 1
}

safe_rm_rf() {
  local target="$1"
  if [[ -z "$target" || "$target" == "/" || "$target" == "$HOME" || "$target" == "$HOME/" ]]; then
    echo "Refusing to remove: $target" >&2
    exit 1
  fi
  rm -rf "$target"
}

require_cmd tar
require_cmd mkdir
require_cmd rm
require_cmd mv

parent_dir="$(dirname "$AIOS_INSTALL_DIR")"
mkdir -p "$parent_dir"

tmp_dir="$(mktemp -d)"
archive_path="$tmp_dir/harness-cli.tar.gz"
extract_dir="$tmp_dir/extract"
preserve_dir="$tmp_dir/preserve"

  preserve_paths=(
    ".aios"
    ".browser-profiles"
    "mcp-server/.browser-profiles"
    "config/browser-profiles.json"
  )

cleanup() {
  rm -rf "$tmp_dir" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "+ download $asset_url"
download "$asset_url" "$archive_path"

mkdir -p "$extract_dir"
echo "+ extract -> $extract_dir"
tar -xzf "$archive_path" -C "$extract_dir"

# Detect archive layout: prefer harness-cli/ prefix, fall back to root
if [[ -d "$extract_dir/harness-cli" ]]; then
  extracted_root="$extract_dir/harness-cli"
elif [[ -f "$extract_dir/package.json" ]]; then
  echo "[info] archive layout: no harness-cli/ prefix, using extract root"
  extracted_root="$extract_dir"
else
  echo "Archive layout unexpected: neither harness-cli/ prefix nor expected files found in $extract_dir" >&2
  exit 1
fi

if [[ -d "$AIOS_INSTALL_DIR" ]]; then
  mkdir -p "$preserve_dir"

  for rel in "${preserve_paths[@]}"; do
    src="$AIOS_INSTALL_DIR/$rel"
    if [[ -e "$src" || -L "$src" ]]; then
      dst="$preserve_dir/$rel"
      mkdir -p "$(dirname "$dst")"
      mv "$src" "$dst"
    fi
  done

  echo "+ remove old install dir -> $AIOS_INSTALL_DIR"
  safe_rm_rf "$AIOS_INSTALL_DIR"
fi

echo "+ install -> $AIOS_INSTALL_DIR"
mv "$extracted_root" "$AIOS_INSTALL_DIR"

for rel in "${preserve_paths[@]}"; do
  src="$preserve_dir/$rel"
  if [[ -e "$src" || -L "$src" ]]; then
    dst="$AIOS_INSTALL_DIR/$rel"
    mkdir -p "$(dirname "$dst")"
    mv "$src" "$dst"
  fi
done

# Child wrappers must use this newly installed runtime, never an inherited
# AIOS_ROOT left behind by an older installation or an enclosing shell.
AIOS_RUNTIME_ROOT="$(cd "$AIOS_INSTALL_DIR" && pwd -P)"
AIOS_STATE_DIR="${AIOS_STATE_DIR:-$(dirname "$AIOS_RUNTIME_ROOT")}"

root_package_json="$AIOS_INSTALL_DIR/package.json"
root_tsx_bin="$AIOS_INSTALL_DIR/node_modules/.bin/tsx"
if [[ -f "$root_package_json" ]]; then
  if ! command -v npm >/dev/null 2>&1; then
    echo "Missing required command: npm" >&2
    exit 1
  fi
  if [[ ! -x "$root_tsx_bin" ]]; then
    echo "+ install AIOS runtime deps: (cd $AIOS_INSTALL_DIR && npm install --include=dev --engine-strict=false)"
    (cd "$AIOS_INSTALL_DIR" && npm install --include=dev --engine-strict=false)
  else
    echo "[ok] AIOS runtime deps ready: $AIOS_INSTALL_DIR"
  fi
else
  echo "[warn] missing root package.json; TUI dependencies may be unavailable: $root_package_json" >&2
fi

shell_installer="$AIOS_INSTALL_DIR/scripts/install-contextdb-shell.sh"
if [[ -f "$shell_installer" ]]; then
  echo "+ install shell integration (zsh): $shell_installer --mode $AIOS_WRAP_MODE --force"
  AIOS_ROOT_DIR="$AIOS_RUNTIME_ROOT" AIOS_ROOT="$AIOS_RUNTIME_ROOT" ROOTPATH="$AIOS_RUNTIME_ROOT" \
    bash "$shell_installer" --mode "$AIOS_WRAP_MODE" --force
else
  echo "[warn] missing shell installer: $shell_installer" >&2
fi

privacy_installer="$AIOS_INSTALL_DIR/scripts/install-privacy-guard.sh"
if [[ -f "$privacy_installer" ]]; then
  if command -v node >/dev/null 2>&1; then
    echo "+ init privacy guard: $privacy_installer"
    set +e
    AIOS_ROOT_DIR="$AIOS_RUNTIME_ROOT" AIOS_ROOT="$AIOS_RUNTIME_ROOT" ROOTPATH="$AIOS_RUNTIME_ROOT" \
      REXCIL_HOME="${REXCIL_HOME:-$AIOS_STATE_DIR}" \
      bash "$privacy_installer" --enable
    status=$?
    set -e
    if [[ $status -ne 0 ]]; then
      echo "[warn] privacy guard init failed (exit=$status); you can retry later:" >&2
      echo "  aios privacy init" >&2
    fi
  else
    echo "[warn] node not found; skip privacy guard init" >&2
  fi
fi

workflow_reconciler="$AIOS_INSTALL_DIR/scripts/reconcile-rex-workflow-surface.mjs"
if [[ -f "$workflow_reconciler" ]]; then
  echo "+ reconcile AIOS-managed legacy workflow projections"
  workflow_reconcile_args=(--root "$AIOS_INSTALL_DIR")
  node "$workflow_reconciler" "${workflow_reconcile_args[@]}"
else
  echo "[warn] missing Rex workflow reconciler: $workflow_reconciler" >&2
fi

rex_projector="$AIOS_INSTALL_DIR/scripts/install-rex-client-projections.mjs"
if [[ -f "$rex_projector" ]]; then
  echo "+ install Rex workflow skills for all supported clients"
  node "$rex_projector" --root "$AIOS_INSTALL_DIR" --client all --scope global
else
  echo "[warn] missing Rex client skill projector: $rex_projector" >&2
fi

rc_file="${ZDOTDIR:-$HOME}/.zshrc"

echo ""
echo "[ok] Installed AIOS:"
echo "  Repo:        $AIOS_REPO"
echo "  Install dir: $AIOS_INSTALL_DIR"
echo ""
echo "Next:"
echo "  1) source \"$rc_file\""
echo "  2) aios doctor # verify"
echo "  3) aios        # opens the TUI"
