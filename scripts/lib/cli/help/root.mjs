/* 中文注释：帮助文案显式暴露 interception doctor/proof，让用户能直接验证压缩链路。 */
export function getRootHelpText() {
  return `AIOS unified entry (Node-first CLI + TUI)

Usage:
  node scripts/aios.mjs
  node scripts/aios.mjs --version
  node scripts/aios.mjs <command> [options]

Commands:
  init          Initialize ContextDB registry markers for this project
  version       Print the installed AIOS version
  setup         Install AIOS integrations
  update        Update AIOS and AIOS integrations
  rex           Run bundled Rex Harness without global PATH installation
  uninstall     Remove selected AIOS integrations
  doctor        Verify AIOS installation and repo health
  status        Show unified AIOS readiness status
  agents        Inspect default agent catalogue and live-readiness gates
  workflow      List and dry-run workflow recipes
  plan          Review and update the active intelligent-planning state
  dream         Consolidate durable memo knowledge and export to plan/pins
  memo          Workspace memo + pinned memory helpers
  search        Search project memory, docs, plans, and code references
  refs          Search/read offloaded tool-output refs
  canvas        Show Mermaid task canvas for offloaded tool calls
  interception  RTK/Caveman-style interception proof, MCP proxy repair, and metrics
  perception    Content outcome recording, insight generation, and perception summary
  quality-gate  Run repo quality checks with harness profiles
  orchestrate   Preview reusable subagent workflow blueprints
  work          Run a task with automatic planning + concurrent multi-agent dispatch (live by default)
  team          One-click multi-client live team runtime (codex/claude/gemini)
  harness       Solo overnight harness with run journal + resume controls
  hud           Show ContextDB + dispatch HUD (CLI/TUI)
  learn-eval    Turn checkpoint telemetry into operator recommendations
  skill         Skill compliance dry-runs and health dashboard
  session       Inspect session-local changed file state
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
  node scripts/aios.mjs status --json
  node scripts/aios.mjs agents doctor --strict --json
  node scripts/aios.mjs workflow run ecc-uplift-governed --task "Borrow ECC safely" --dry-run --json
  node scripts/aios.mjs plan show --html
  node scripts/aios.mjs dream --preview --to pin --json
  node scripts/aios.mjs internal native repair list --limit 20
  node scripts/aios.mjs internal native repair show --repair-id latest
  node scripts/aios.mjs internal native rollback --repair-id latest
  node scripts/aios.mjs memo add "note #tag"
  node scripts/aios.mjs search "project memory" --agent codex-cli --json
  node scripts/aios.mjs refs grep "error" --session codex-cli-...
  node scripts/aios.mjs canvas show --session codex-cli-...
  node scripts/aios.mjs interception proof --json
  node scripts/aios.mjs interception tail --latest --json
  node scripts/aios.mjs interception rewrite --command "git status"
  node scripts/aios.mjs interception doctor --fix
  node scripts/aios.mjs interception doctor --enforce-turns --json
  node scripts/aios.mjs quality-gate pre-pr --profile strict
  node scripts/aios.mjs orchestrate feature --task "Ship orchestrator blueprints"
  node scripts/aios.mjs work --task "Ship the release checklist"
  node scripts/aios.mjs work --task "重构 mcp-server 并补测试" --client codex-cli --concurrency 4
  node scripts/aios.mjs work --task "..." --serial
  node scripts/aios.mjs work --task "..." --dry-run --json
  node scripts/aios.mjs team 3:codex "Ship orchestrator blueprints"
  node scripts/aios.mjs team 2:claude --session codex-cli-20260303T080437-065e16c0 --dry-run
  node scripts/aios.mjs harness run --objective "Ship release checklist" --worktree
  node scripts/aios.mjs harness status --session codex-cli-20260303T080437-065e16c0 --json
  node scripts/aios.mjs hud --provider codex
  node scripts/aios.mjs hud --watch --preset focused
  node scripts/aios.mjs team status --provider codex --watch
  node scripts/aios.mjs orchestrate --session codex-cli-20260303T080437-065e16c0 --format json
  node scripts/aios.mjs learn-eval --limit 5
  node scripts/aios.mjs skill comply skill-sources/search-first/SKILL.md --client opencode --dry-run --json
  node scripts/aios.mjs skill health --json
  node scripts/aios.mjs session changed-files --session codex-cli-20260303T080437-065e16c0 --json
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
