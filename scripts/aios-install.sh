#!/usr/bin/env bash
set -euo pipefail

DEFAULT_REPO="rexleimo/aios"
DEFAULT_INSTALL_DIR="$HOME/.rexcil/aios"
DEFAULT_WRAP_MODE="opt-in"

usage() {
  cat <<'USAGE'
AIOS one-liner installer (Releases-first)

Usage:
  curl -fsSL https://github.com/rexleimo/aios/releases/latest/download/aios-install.sh | bash

Optional environment variables:
  AIOS_REPO           GitHub repo, default: rexleimo/aios
  AIOS_INSTALL_DIR    install dir, default: ~/.rexcil/aios
  AIOS_STATE_DIR      state dir for installer-owned config, default: parent of install dir
  AIOS_WRAP_MODE      all|repo-only|opt-in|off (default: opt-in)
  AIOS_ASSET_URL      override aios.tar.gz URL for offline install tests
  AIOS_RELEASE_TAG    exact release tag to download (preferred over releases/latest,
                      which GitHub orders by creation time, not semver)
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

if [ -n "${AIOS_ASSET_URL:-}" ]; then
  asset_url="$AIOS_ASSET_URL"
elif [ -n "${AIOS_RELEASE_TAG:-}" ]; then
  # 中文注释：按精确 tag 拉取，避免 releases/latest 被补发旧版抢占后降级安装。
  asset_url="https://github.com/${AIOS_REPO}/releases/download/${AIOS_RELEASE_TAG}/aios.tar.gz"
else
  asset_url="https://github.com/${AIOS_REPO}/releases/latest/download/aios.tar.gz"
fi

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
archive_path="$tmp_dir/aios.tar.gz"
extract_dir="$tmp_dir/extract"

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

# Detect archive layout: prefer aios/ prefix, fall back to root
if [[ -d "$extract_dir/aios" ]]; then
  extracted_root="$extract_dir/aios"
elif [[ -f "$extract_dir/package.json" ]]; then
  echo "[info] archive layout: no aios/ prefix, using extract root"
  extracted_root="$extract_dir"
else
  echo "Archive layout unexpected: neither aios/ prefix nor expected files found in $extract_dir" >&2
  exit 1
fi

if [[ -d "$AIOS_INSTALL_DIR" ]]; then
  # 占用预检：默认只告警；想直接停掉占用进程就设 AIOS_STOP_HOLDERS=1。
  holders="$(pgrep -f "$AIOS_INSTALL_DIR" 2>/dev/null | grep -vx "$$" || true)"
  if [[ -n "$holders" ]]; then
    echo "[warn] processes referencing the install dir $AIOS_INSTALL_DIR (heuristic):" >&2
    for pid in $holders; do echo "        PID $pid $(ps -o comm= -p "$pid" 2>/dev/null || true)" >&2; done
    if [[ "${AIOS_STOP_HOLDERS:-0}" == "1" ]]; then
      for pid in $holders; do
        if kill "$pid" 2>/dev/null; then echo "        stopped PID $pid" >&2; else echo "        [warn] could not stop PID $pid" >&2; fi
      done
    else
      echo "[warn] continuing anyway (old dir is renamed aside, not deleted); set AIOS_STOP_HOLDERS=1 to stop them automatically." >&2
    fi
  fi

  # 改名让位，而不是删除；次序也很关键：**先**把旧目录整体改名，**再**从它里面
  # 把用户数据搬回来（以前是先把用户数据搬去临时区再改名，中途失败就把数据留在临时目录里）。
  # 旧写法是先 safe_rm_rf 再判存在就 exit 1，结果是“删到一半 + 报错退出”，
  # 把安装目录留成半截（只剩 mcp-server/ 那种）。
  retired="$AIOS_INSTALL_DIR.retired-$(date +%Y%m%d-%H%M%S)"
  echo "+ retire old install dir -> $retired"
  if ! mv "$AIOS_INSTALL_DIR" "$retired" 2>/dev/null; then
    echo "[error] cannot swap the install dir: it is held open by a running process." >&2
    echo "        dir:   $AIOS_INSTALL_DIR" >&2
    echo "        fix:   stop those processes and re-run, or set AIOS_STOP_HOLDERS=1." >&2
    echo "        note:  your existing AIOS install was left untouched by this failure." >&2
    exit 1
  fi
fi

echo "+ install -> $AIOS_INSTALL_DIR"
mv "$extracted_root" "$AIOS_INSTALL_DIR"

# 用户数据从旧目录搬回来（新树已就位；搬不动也不影响安装，数据还在 retired 里）。
if [[ -n "${retired:-}" && -d "$retired" ]]; then
  for rel in "${preserve_paths[@]}"; do
    src="$retired/$rel"
    if [[ -e "$src" || -L "$src" ]]; then
      dst="$AIOS_INSTALL_DIR/$rel"
      mkdir -p "$(dirname "$dst")"
      mv "$src" "$dst" || echo "[warn] could not restore $rel from the retired dir; it is still intact at: $src" >&2
    fi
  done
fi

# 旧目录清理：删不掉也不影响本次安装（留一个 .retired-* 目录，退出占用进程后可手删）。
if [[ -n "${retired:-}" && -e "$retired" ]]; then
  if safe_rm_rf "$retired" 2>/dev/null; then
    echo "+ removed retired install dir: $retired"
  else
    echo "[warn] retired install dir could not be removed (files still in use): $retired" >&2
    echo "[warn] this install is complete; delete that directory after closing AIOS/clients." >&2
  fi
fi

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
