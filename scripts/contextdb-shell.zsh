# ContextDB transparent command wrappers for zsh.
# Source this file in ~/.zshrc to route supported clients through AIOS without prompt injection.
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
# - CTXDB_PRIVACY_BANNER: show/hide interactive Privacy Shield banner (default: on, read by bridge)
# - CTXDB_PRIVACY_COLOR: enable/disable banner ANSI color (default: on unless NO_COLOR is set, read by bridge)
# - CTXDB_ALLOW_DIRECT_NATIVE_AGENT: set to 1 to bypass AIOS direct-agent block for diagnostics
# - AIOS_NATIVE_SHIM_DIR: PATH shadow shim dir; bridge removes it before launching real clients

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

# 中文注释：解析 AIOS 安装根目录。非交互 shell（如 harness 命令快照）可能丢失 shell
# 集成导出的 AIOS_ROOT_DIR/AIOS_ROOT/ROOTPATH，此时回退到与 ~/.aios/bin/aios shim
# 相同的探测路径，避免 aios / bridge 包装函数在没有集成变量的会话里直接失败。
# 变量已设置且目录存在时不覆盖，保持既有优先级（AIOS_ROOT_DIR → AIOS_ROOT → ROOTPATH）。
ctxdb_resolve_aios_root() {
  local rootpath="${AIOS_ROOT_DIR:-${AIOS_ROOT:-${ROOTPATH:-}}}"
  if [[ -z "$rootpath" || ! -d "$rootpath" ]]; then
    local probe
    for probe in "$HOME/.rexcil/aios" "$HOME/cool.cnb/rex-ai-boot"; do
      if [[ -f "$probe/scripts/aios.sh" ]]; then
        printf '%s\n' "$probe"
        return 0
      fi
    done
    return 1
  fi
  printf '%s\n' "$rootpath"
  return 0
}

ctxdb_find_bridge() {
  if [[ -n "${CTXDB_SHELL_BRIDGE:-}" ]] && [[ -f "${CTXDB_SHELL_BRIDGE}" ]]; then
    printf '%s\n' "${CTXDB_SHELL_BRIDGE}"
    return 0
  fi

  local rootpath
  if rootpath="$(ctxdb_resolve_aios_root)"; then
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
  node "$bridge" --agent "$agent" --command "$passthrough" -- "$@"
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

  local rootpath
  if ! rootpath="$(ctxdb_resolve_aios_root)"; then
    echo "[warn] AIOS_ROOT_DIR is not set (install shell integration first)"
    return 1
  fi
  # 中文注释：与 ~/.aios/bin/aios shim 保持同一契约——派发前把解析出的安装根写回环境，
  # 避免下游 scripts/aios.sh 等子进程读到缺失或陈旧的 AIOS_ROOT_DIR。
  export AIOS_ROOT_DIR="$rootpath" AIOS_ROOT="$rootpath" ROOTPATH="$rootpath"

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
      echo "  aios --version           # print AIOS version"
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
