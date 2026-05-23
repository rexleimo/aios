export function getCodemapHelpText() {
  return `AIOS Codemap - code-review-graph integration

Usage:
  node scripts/aios.mjs internal codemap <action> [options]

Actions:
  install    Install code-review-graph: uvx check, graph build, MCP inject, client docs update
  uninstall  Remove CRG configs, plugin, state (preserves .code-review-graph/)
  doctor     Health check for codemap installation
  build      Full graph rebuild from scratch
  update     Incremental graph update (changed files only, <2s)
  status     Show codemap state and graph statistics

Options:
  --client <all|codex|claude|gemini|opencode>
             Target client config(s). Defaults to all.
  --fix      (doctor) auto-fix issues found
  --dry-run  Preview changes without writing

Client config targets:
  codex    ~/.codex/config.toml ([mcp_servers.code-review-graph])
  claude   <project>/.mcp.json
  gemini   <project>/.gemini/settings.json
  opencode ~/.config/opencode/opencode.json + CRG plugin

Restart the selected client after install/doctor --fix so it reloads MCP config.

Examples:
  node scripts/aios.mjs internal codemap install
  node scripts/aios.mjs internal codemap install --client codex
  node scripts/aios.mjs internal codemap doctor --fix
  node scripts/aios.mjs internal codemap build
  node scripts/aios.mjs internal codemap update
`;
}
