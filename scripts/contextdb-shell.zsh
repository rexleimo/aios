# ContextDB transparent command wrappers for zsh.
# Source this file in ~/.zshrc to make codex/claude/gemini/opencode auto-load context packets.
#
# Optional overrides:
# - AIOS_ROOT_DIR: AIOS install root where scripts/contextdb-shell-bridge.mjs lives
# - AIOS_ROOT: legacy-compatible alias for AIOS_ROOT_DIR
# - ROOTPATH: legacy alias for AIOS_ROOT_DIR
# - CTXDB_SHELL_BRIDGE: explicit bridge path (highest priority)
# - CTXDB_RUNNER: explicit ctx-agent runner path (read by bridge)
# - CTXDB_REPO_NAME: optional project name (read by bridge)
# - CTXDB_WRAP_MODE: all|repo-only|opt-in|off (default: repo-only, read by bridge)
# - CTXDB_MARKER_FILE: marker filename for opt-in mode (default: .contextdb-enable, read by bridge)
# - CTXDB_AUTO_CREATE_MARKER: auto-create marker in opt-in mode (default: on, read by bridge)
# - CTXDB_INTERACTIVE_AUTO_ROUTE: inject single/subagent/team/harness route prompt (default: on, read by bridge)
# - CTXDB_HARNESS_PROVIDER: provider for injected harness route (default: current CLI, read by bridge)
# - CTXDB_HARNESS_MAX_ITERATIONS: iteration budget for injected harness route (default: 8, read by bridge)
# - CTXDB_PRIVACY_BANNER: show/hide interactive Privacy Shield banner (default: on, read by bridge)
# - CTXDB_PRIVACY_COLOR: enable/disable banner ANSI color (default: on unless NO_COLOR is set, read by bridge)
# - CTXDB_ALLOW_DIRECT_NATIVE_AGENT: set to 1 to bypass AIOS direct-agent block for diagnostics

typeset -g CTXDB_LAST_WORKSPACE=""

ctxdb_normalize_codex_home() {
  local codex_home="${CODEX_HOME:-}"
  if [[ -z "$codex_home" ]]; then
    return 0
  fi

  # Resolve relative CODEX_HOME against current working directory.
  if [[ "$codex_home" == "~" ]]; then
    codex_home="$HOME"
  elif [[ "$codex_home" == "~/"* ]]; then
    codex_home="$HOME/${codex_home#\~/}"
  fi

  if [[ "$codex_home" != /* ]]; then
    codex_home="$PWD/$codex_home"
  fi
  export CODEX_HOME="$codex_home"

  if [[ ! -d "$codex_home" ]]; then
    mkdir -p "$codex_home" >/dev/null 2>&1 || true
  fi
}

ctxdb_find_bridge() {
  if [[ -n "${CTXDB_SHELL_BRIDGE:-}" ]] && [[ -f "${CTXDB_SHELL_BRIDGE}" ]]; then
    printf '%s\n' "${CTXDB_SHELL_BRIDGE}"
    return 0
  fi

  local rootpath="${AIOS_ROOT_DIR:-${AIOS_ROOT:-${ROOTPATH:-}}}"
  if [[ -n "$rootpath" ]]; then
    local candidate="$rootpath/scripts/contextdb-shell-bridge.mjs"
    if [[ -f "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  fi

  return 1
}

ctxdb_update_last_workspace() {
  local workspace=""
  workspace="$(command git -C "$PWD" rev-parse --show-toplevel 2>/dev/null || true)"
  if [[ -n "$workspace" ]]; then
    CTXDB_LAST_WORKSPACE="$workspace"
  fi
}

ctxdb_invoke_bridge_or_passthrough() {
  local agent="$1"
  shift
  local passthrough="$1"
  shift

  local bridge=""
  bridge="$(ctxdb_find_bridge || true)"
  if [[ -z "$bridge" ]] || ! command -v node >/dev/null 2>&1; then
    command "$passthrough" "$@"
    return $?
  fi

  ctxdb_update_last_workspace
  # Avoid bricking interactive wrappers if someone left CTXDB_PACK_STRICT=1 in
  # their shell env. Quality gates can still enforce strict mode explicitly.
  local strict_interactive="${CTXDB_PACK_STRICT_INTERACTIVE:-}"
  strict_interactive="${strict_interactive:l}"
  if [[ "$strict_interactive" == "1" || "$strict_interactive" == "true" || "$strict_interactive" == "yes" || "$strict_interactive" == "on" ]]; then
    node "$bridge" --agent "$agent" --command "$passthrough" -- "$@"
  else
    CTXDB_PACK_STRICT=0 node "$bridge" --agent "$agent" --command "$passthrough" -- "$@"
  fi
}

codex() {
  ctxdb_normalize_codex_home
  ctxdb_invoke_bridge_or_passthrough codex-cli codex "$@"
}

claude() {
  ctxdb_invoke_bridge_or_passthrough claude-code claude "$@"
}

gemini() {
  ctxdb_invoke_bridge_or_passthrough gemini-cli gemini "$@"
}

opencode() {
  ctxdb_invoke_bridge_or_passthrough opencode-cli opencode "$@"
}

aios() {
  local sub="${1:-}"
  shift || true

  local rootpath="${AIOS_ROOT_DIR:-${AIOS_ROOT:-${ROOTPATH:-}}}"
  if [[ -z "$rootpath" ]]; then
    echo "[warn] AIOS_ROOT_DIR is not set (install shell integration first)"
    return 1
  fi

  case "$sub" in
    doctor)
      local script="$rootpath/scripts/verify-aios.sh"
      if [[ -x "$script" ]]; then
        "$script" "$@"
        return $?
      fi
      echo "[warn] missing verifier script: $script"
      return 1
      ;;
    update)
      local script="$rootpath/scripts/update-all.sh"
      if [[ -x "$script" ]]; then
        "$script" "$@"
        return $?
      fi
      echo "[warn] missing update script: $script"
      return 1
      ;;
    privacy)
      local script="$rootpath/scripts/privacy-guard.mjs"
      if ! command -v node >/dev/null 2>&1; then
        echo "[warn] node not found; privacy guard unavailable"
        return 1
      fi
      if [[ ! -f "$script" ]]; then
        echo "[warn] missing privacy guard script: $script"
        return 1
      fi

      local action="${1:-status}"
      shift || true

      case "$action" in
        init|status|set|read|redact)
          node "$script" "$action" "$@"
          return $?
          ;;
        enable)
          node "$script" set --enabled true --mode regex --enforce true --block-when-disabled true --detect-content true "$@"
          return $?
          ;;
        disable)
          node "$script" set --enabled false "$@"
          return $?
          ;;
        ollama-on)
          node "$script" set --enabled true --mode hybrid --ollama-enabled true --model qwen3.5:4b "$@"
          return $?
          ;;
        ollama-off)
          node "$script" set --mode regex --ollama-enabled false "$@"
          return $?
          ;;
        enforce-on)
          node "$script" set --enforce true --block-when-disabled true --detect-content true "$@"
          return $?
          ;;
        enforce-off)
          node "$script" set --enforce false --block-when-disabled false "$@"
          return $?
          ;;
        *)
          echo "[warn] unknown aios privacy action: $action"
          echo "Usage: aios privacy <status|init|set|read|redact|enable|disable|ollama-on|ollama-off|enforce-on|enforce-off> [args]"
          return 1
          ;;
      esac
      ;;
    "")
      local script="$rootpath/scripts/aios.sh"
      if [[ -x "$script" ]]; then
        "$script"
        return $?
      fi
      echo "[warn] missing TUI entry script: $script"
      echo "Usage: aios [doctor|update|privacy] [args]"
      return 1
      ;;
    -h|--help|help)
      echo "Usage:"
      echo "  aios                     # interactive TUI"
      echo "  aios --version           # print Harness CLI version"
      echo "  aios <doctor|update|privacy> [args]"
      return 0
      ;;
    *)
      local script="$rootpath/scripts/aios.sh"
      if [[ -x "$script" ]]; then
        "$script" "$sub" "$@"
        return $?
      fi
      echo "[warn] missing TUI entry script: $script"
      echo "Usage: aios [doctor|update|privacy|<other>] [args]"
      return 1
      ;;
  esac
}

alias aios-doctor='aios doctor'
alias aios-update='aios update'
alias aios-privacy='aios privacy'
