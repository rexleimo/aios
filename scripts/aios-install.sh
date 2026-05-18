#!/usr/bin/env bash
set -euo pipefail

DEFAULT_REPO="rexleimo/rex-cli"
DEFAULT_INSTALL_DIR="$HOME/.rexcil/rex-cli"
DEFAULT_WRAP_MODE="opt-in"
DEFAULT_FIRST_SETUP="1"

usage() {
  cat <<'USAGE'
AIOS one-liner installer (Releases-first)

Usage:
  curl -fsSL https://github.com/rexleimo/rex-cli/releases/latest/download/aios-install.sh | bash

Optional environment variables:
  AIOS_REPO           GitHub repo, default: rexleimo/rex-cli
  AIOS_INSTALL_DIR    install dir, default: ~/.rexcil/rex-cli
  AIOS_WRAP_MODE      all|repo-only|opt-in|off (default: opt-in)
  AIOS_FIRST_SETUP    1|0, run first-run skills/native/superpowers setup (default: 1)
USAGE
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

AIOS_REPO="${AIOS_REPO:-$DEFAULT_REPO}"
AIOS_INSTALL_DIR="${AIOS_INSTALL_DIR:-$DEFAULT_INSTALL_DIR}"
AIOS_WRAP_MODE="${AIOS_WRAP_MODE:-$DEFAULT_WRAP_MODE}"
AIOS_FIRST_SETUP="${AIOS_FIRST_SETUP:-$DEFAULT_FIRST_SETUP}"

case "$AIOS_WRAP_MODE" in
  all|repo-only|opt-in|off) ;;
  *)
    echo "AIOS_WRAP_MODE must be one of: all, repo-only, opt-in, off" >&2
    exit 1
    ;;
esac

asset_url="https://github.com/${AIOS_REPO}/releases/latest/download/rex-cli.tar.gz"

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

is_disabled() {
  case "$1" in
    0|false|FALSE|off|OFF|no|NO) return 0 ;;
    *) return 1 ;;
  esac
}

require_cmd tar
require_cmd mkdir
require_cmd rm
require_cmd mv

parent_dir="$(dirname "$AIOS_INSTALL_DIR")"
mkdir -p "$parent_dir"

tmp_dir="$(mktemp -d)"
archive_path="$tmp_dir/rex-cli.tar.gz"
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

if [[ ! -d "$extract_dir/rex-cli" ]]; then
  echo "Archive layout unexpected: missing rex-cli/ folder" >&2
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
mv "$extract_dir/rex-cli" "$AIOS_INSTALL_DIR"

for rel in "${preserve_paths[@]}"; do
  src="$preserve_dir/$rel"
  if [[ -e "$src" || -L "$src" ]]; then
    dst="$AIOS_INSTALL_DIR/$rel"
    mkdir -p "$(dirname "$dst")"
    mv "$src" "$dst"
  fi
done

root_package_json="$AIOS_INSTALL_DIR/package.json"
root_tsx_bin="$AIOS_INSTALL_DIR/node_modules/.bin/tsx"
if [[ -f "$root_package_json" ]]; then
  if ! command -v npm >/dev/null 2>&1; then
    echo "Missing required command: npm" >&2
    exit 1
  fi
  if [[ ! -x "$root_tsx_bin" ]]; then
    echo "+ install AIOS runtime deps: (cd $AIOS_INSTALL_DIR && npm install --include=dev)"
    (cd "$AIOS_INSTALL_DIR" && npm install --include=dev)
  else
    echo "[ok] AIOS runtime deps ready: $AIOS_INSTALL_DIR"
  fi
else
  echo "[warn] missing root package.json; TUI dependencies may be unavailable: $root_package_json" >&2
fi

shell_installer="$AIOS_INSTALL_DIR/scripts/install-contextdb-shell.sh"
if [[ -f "$shell_installer" ]]; then
  echo "+ install shell integration (zsh): $shell_installer --mode $AIOS_WRAP_MODE --force"
  bash "$shell_installer" --mode "$AIOS_WRAP_MODE" --force
else
  echo "[warn] missing shell installer: $shell_installer" >&2
fi

privacy_installer="$AIOS_INSTALL_DIR/scripts/install-privacy-guard.sh"
if [[ -f "$privacy_installer" ]]; then
  if command -v node >/dev/null 2>&1; then
    echo "+ init privacy guard: $privacy_installer"
    set +e
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

if is_disabled "$AIOS_FIRST_SETUP"; then
  echo "[info] first-run core setup skipped (AIOS_FIRST_SETUP=$AIOS_FIRST_SETUP)"
else
  aios_cli="$AIOS_INSTALL_DIR/scripts/aios.mjs"
  if [[ -f "$aios_cli" ]]; then
    if command -v node >/dev/null 2>&1; then
      echo "+ first-run core setup: node $aios_cli setup --components skills,native,superpowers --client all --skip-doctor"
      node "$aios_cli" setup --components skills,native,superpowers --client all --skip-doctor
    else
      echo "[warn] node not found; skip first-run core setup" >&2
      echo "       Retry after installing Node.js: aios setup --components skills,native,superpowers" >&2
    fi
  else
    echo "[warn] missing AIOS CLI; skip first-run core setup: $aios_cli" >&2
  fi
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
