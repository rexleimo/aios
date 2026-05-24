/* 中文注释：帮助文案显式暴露 interception doctor/proof，让用户能直接验证压缩链路。 */
export function getRootHelpText() {
  return `AIOS unified entry (Node-first CLI + TUI)

Usage:
  node scripts/aios.mjs
  node scripts/aios.mjs --version
  node scripts/aios.mjs <command> [options]

Commands:
  init          Initialize ContextDB registry markers for this project
  version       Print the installed Harness CLI version
  setup         Install AIOS integrations
  update        Update Harness CLI and AIOS integrations
  uninstall     Remove selected AIOS integrations
  doctor        Verify AIOS installation and repo health
  memo          Workspace memo + pinned memory helpers
  refs          Search/read offloaded tool-output refs
  canvas        Show Mermaid task canvas for offloaded tool calls
  interception  RTK/Caveman-style interception proof, MCP proxy repair, and metrics
  perception    Content outcome recording, insight generation, and perception summary
  quality-gate  Run repo quality checks with harness profiles
  orchestrate   Preview reusable subagent workflow blueprints
  team          One-click multi-client live team runtime (codex/claude/gemini)
  harness       Solo overnight harness with run journal + resume controls
  hud           Show ContextDB + dispatch HUD (CLI/TUI)
  learn-eval    Turn checkpoint telemetry into operator recommendations
  entropy-gc    Auto-archive stale ContextDB artifacts with rollback manifests
  snapshot-rollback Restore pre-mutation snapshot artifacts (manifest-driven)
  release-status Show RL policy release gate state and recent trend

Examples:
  node scripts/aios.mjs init --agent codex
  node scripts/aios.mjs --version
  node scripts/aios.mjs setup --components all --mode opt-in --client all
  node scripts/aios.mjs update --components shell,skills,native --skip-doctor
  node scripts/aios.mjs uninstall --components shell,skills,native
  node scripts/aios.mjs doctor --strict --native --verbose --profile standard
  node scripts/aios.mjs doctor --native --fix --dry-run
  node scripts/aios.mjs internal native repair list --limit 20
  node scripts/aios.mjs internal native repair show --repair-id latest
  node scripts/aios.mjs internal native rollback --repair-id latest
  node scripts/aios.mjs memo add "note #tag"
  node scripts/aios.mjs refs grep "error" --session codex-cli-...
  node scripts/aios.mjs canvas show --session codex-cli-...
  node scripts/aios.mjs interception proof --json
  node scripts/aios.mjs interception doctor --fix
  node scripts/aios.mjs quality-gate pre-pr --profile strict
  node scripts/aios.mjs orchestrate feature --task "Ship orchestrator blueprints"
  node scripts/aios.mjs team 3:codex "Ship orchestrator blueprints"
  node scripts/aios.mjs team 2:claude --session codex-cli-20260303T080437-065e16c0 --dry-run
  node scripts/aios.mjs harness run --objective "Ship release checklist" --worktree
  node scripts/aios.mjs harness status --session codex-cli-20260303T080437-065e16c0 --json
  node scripts/aios.mjs hud --provider codex
  node scripts/aios.mjs hud --watch --preset focused
  node scripts/aios.mjs team status --provider codex --watch
  node scripts/aios.mjs orchestrate --session codex-cli-20260303T080437-065e16c0 --format json
  node scripts/aios.mjs learn-eval --limit 5
  node scripts/aios.mjs entropy-gc auto --session codex-cli-20260303T080437-065e16c0
  node scripts/aios.mjs snapshot-rollback --session codex-cli-20260303T080437-065e16c0 --job phase.implement --dry-run
  node scripts/aios.mjs release-status --recent 12
  node scripts/aios.mjs perception record --content-id note_001 --platform xiaohongshu --content-type note --title "test" --metrics '{"likes":100}'
  node scripts/aios.mjs perception insights --min-sample 3
  node scripts/aios.mjs perception summary --format json
  node scripts/aios.mjs internal browser doctor --fix
  node scripts/aios.mjs internal browser mcp-migrate
  node scripts/aios.mjs internal browser cdp-start
  node scripts/aios.mjs internal browser cdp-status
  node scripts/aios.mjs internal codemap install
  node scripts/aios.mjs internal codemap doctor --fix
`;
}
