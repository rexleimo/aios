#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

expand_path() {
  local value="$1"
  if [[ "$value" == "~" ]]; then
    printf '%s' "$HOME"
  elif [[ "$value" == "~/"* ]]; then
    printf '%s/%s' "$HOME" "${value#\~/}"
  else
    printf '%s' "$value"
  fi
}

BROWSER_USE_REPO=""
BROWSER_USE_CANDIDATES=()
if [[ -n "${AIOS_BROWSER_USE_REPO:-}" ]]; then
  BROWSER_USE_CANDIDATES+=("$(expand_path "$AIOS_BROWSER_USE_REPO")")
fi
BROWSER_USE_CANDIDATES+=("$ROOT_DIR/../ai-browser-book" "$ROOT_DIR/ai-browser-book")

for candidate in "${BROWSER_USE_CANDIDATES[@]}"; do
  if [[ -f "$candidate/mcp-browser-use/pyproject.toml" ]]; then
    BROWSER_USE_REPO="$(cd "$candidate" && pwd -P)"
    break
  fi
done

if [[ -z "$BROWSER_USE_REPO" ]]; then
  echo "[aios-browser] mcp-browser-use project not found." >&2
  echo "[aios-browser] Set AIOS_BROWSER_USE_REPO=/path/to/ai-browser-book or place ai-browser-book next to/in this repo." >&2
  echo "[aios-browser] Checked:" >&2
  for candidate in "${BROWSER_USE_CANDIDATES[@]}"; do
    echo "  - $candidate/mcp-browser-use" >&2
  done
  exit 1
fi

export AIOS_BROWSER_USE_REPO="$BROWSER_USE_REPO"
MCP_DIR="$BROWSER_USE_REPO/mcp-browser-use"
VENV_PYTHON="$MCP_DIR/.venv/bin/python"
BOOTSTRAP_SCRIPT="$ROOT_DIR/scripts/browser-use-bootstrap.py"

if [[ ! -x "$VENV_PYTHON" ]]; then
  echo "[aios-browser] browser-use venv python missing: $VENV_PYTHON" >&2
  echo "[aios-browser] Run: cd \"$MCP_DIR\" && uv sync" >&2
  exit 1
fi

if [[ ! -f "$BOOTSTRAP_SCRIPT" ]]; then
  echo "[aios-browser] bootstrap script missing: $BOOTSTRAP_SCRIPT" >&2
  exit 1
fi

if [[ -z "${BROWSER_USE_CDP_URL:-}" ]]; then
  DETECTED_CDP_URL="$(
    node -e "const fs=require('fs');const path=require('path');const root=process.argv[1];const configPath=path.join(root,'config','browser-profiles.json');try{const parsed=JSON.parse(fs.readFileSync(configPath,'utf8'));const profile=parsed?.profiles?.default??{};const cdpUrl=String(profile.cdpUrl||'').trim();if(cdpUrl){process.stdout.write(cdpUrl);process.exit(0);}const port=Number.parseInt(String(profile.cdpPort??''),10);if(Number.isFinite(port)&&port>0){process.stdout.write('http://127.0.0.1:'+port);}}catch{}" "$ROOT_DIR"
  )"
  if [[ -n "$DETECTED_CDP_URL" ]]; then
    export BROWSER_USE_CDP_URL="$DETECTED_CDP_URL"
  fi
fi

if [[ -z "${BROWSER_USE_DEFAULT_TIMEOUT_MS:-}" ]]; then
  export BROWSER_USE_DEFAULT_TIMEOUT_MS="20000"
fi

# --- credential username injection (non-sensitive, from Keychain) ---
inject_usernames() {
  for site in xiaohongshu jimeng; do
    local svc="aios-browser-mcp/${site}/username"
    local username
    username=$(security find-generic-password -s "$svc" -a "default" -w 2>/dev/null || true)
    if [[ -n "$username" ]]; then
      local env_key
      env_key="AIOS_CRED_$(echo "$site" | tr '[:lower:]' '[:upper:]')_USERNAME"
      export "$env_key=$username"
      echo "[aios-browser] injected username for $site: $username" >&2
    fi
  done
}
inject_usernames

exec "$VENV_PYTHON" "$BOOTSTRAP_SCRIPT"
