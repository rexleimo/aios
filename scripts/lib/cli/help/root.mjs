/* 中文注释：帮助文案显式暴露 interception doctor/proof，让用户能直接验证压缩链路。 */
export function getRootHelpText() {
  return `AIOS unified entry (Node-first CLI + TUI)

Usage:
  aios
  aios --version
  aios <command> [options]

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
  evolution     Inspect and run governed self-evolution proposals
  dream         Consolidate durable memo knowledge and export to plan/pins
  memo          Workspace memo + pinned memory helpers
  memory        Memory-plane observability ('memory report [--json]')
  import        Import external memory files (MEMORY.md/.roomodes/...) as memo candidates
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
  aios init --agent codex
  aios --version
  aios setup --components all --mode opt-in --client all
  aios update --components shell,skills,native --skip-doctor
  aios uninstall --components shell,skills,native
  aios doctor --strict --native --verbose --profile standard
  aios doctor --native --fix --dry-run
  aios status --json
  aios agents doctor --strict --json
  aios workflow run ecc-uplift-governed --task "Borrow ECC safely" --dry-run --json
  aios plan show --html
  aios dream --preview --to pin --json
  aios internal native repair list --limit 20
  aios internal native repair show --repair-id latest
  aios internal native rollback --repair-id latest
  aios memo add "note #tag"
  aios search "project memory" --agent codex-cli --json
  aios refs grep "error" --session codex-cli-...
  aios canvas show --session codex-cli-...
  aios interception proof --json
  aios interception tail --latest --json
  aios interception rewrite --command "git status"
  aios interception doctor --fix
  aios interception doctor --enforce-turns --json
  aios quality-gate pre-pr --profile strict
  aios orchestrate feature --task "Ship orchestrator blueprints"
  aios work --task "Ship the release checklist"
  aios work --task "重构 mcp-server 并补测试" --client codex-cli --concurrency 4
  aios work --task "..." --serial
  aios work --task "..." --dry-run --json
  aios team 3:codex "Ship orchestrator blueprints"
  aios team 2:claude --session codex-cli-20260303T080437-065e16c0 --dry-run
  aios harness run --objective "Ship release checklist" --worktree
  aios harness status --session codex-cli-20260303T080437-065e16c0 --json
  aios hud --provider codex
  aios hud --watch --preset focused
  aios team status --provider codex --watch
  aios orchestrate --session codex-cli-20260303T080437-065e16c0 --format json
  aios learn-eval --limit 5
  aios skill comply skill-sources/search-first/SKILL.md --client opencode --dry-run --json
  aios skill health --json
  aios session changed-files --session codex-cli-20260303T080437-065e16c0 --json
  aios entropy-gc auto --session codex-cli-20260303T080437-065e16c0
  aios snapshot-rollback --session codex-cli-20260303T080437-065e16c0 --job phase.implement --dry-run
  aios release-status --recent 12
  aios perception record --content-id note_001 --platform xiaohongshu --content-type note --title "test" --metrics '{"likes":100}'
  aios perception insights --min-sample 3
  aios perception summary --format json
  aios internal browser doctor --fix
  aios internal browser mcp-migrate
  aios internal browser cdp-start
  aios internal browser cdp-status
  aios internal codemap install
  aios internal codemap doctor --fix
`;
}
