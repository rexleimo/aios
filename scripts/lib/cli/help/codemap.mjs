// 中文注释：客户端目标来自注册表，避免新增客户端时帮助文本滞后。
import { getClientHelpList } from '../../clients/registry.mjs';

function clientHelpChoices() {
  return ['all', ...getClientHelpList().clientNames].join('|');
}

export function getCodemapHelpText() {
  return `AIOS Codemap - code-review-graph integration

Usage:
  aios internal codemap <action> [options]

Actions:
  install    Install code-review-graph: uvx check, graph build, MCP inject, client docs update
  uninstall  Remove CRG configs, plugin, state (preserves .code-review-graph/)
  doctor     Health check for codemap installation
  build      Full graph rebuild from scratch
  update     Incremental graph update (changed files only, <2s)
  status     Show codemap state and graph statistics

Options:
  --client <${clientHelpChoices()}>
             Target client config(s). Defaults to all.
  --fix      (doctor) auto-fix issues found
  --dry-run  Preview changes without writing

Client config targets:
  codex    ~/.codex/config.toml ([mcp_servers.code-review-graph])
  claude   <project>/.mcp.json
  gemini   <project>/.gemini/settings.json
  opencode ~/.config/opencode/opencode.json + CRG plugin
  hermes   ~/.hermes/config.yaml (mcp_servers.code-review-graph)
  grok     ~/.grok/config.toml ([mcp_servers.code-review-graph])
  workbuddy ~/.workbuddy/mcp.json
  pi         ~/.pi/agent/settings.json (extensions/skills via Pi package, no MCP)
  zcode     ~/.zcode/cli/config.json (mcp.servers, nested JSON)
  qoder     <edition home>/settings.json (mcpServers; CN ~/.qoder-cn, intl ~/.qoder) + <project>/.qoder/settings.json

Restart the selected client after install/doctor --fix so it reloads MCP config.

Examples:
  aios internal codemap install
  aios internal codemap install --client codex
  aios internal codemap doctor --fix
  aios internal codemap build
  aios internal codemap update
`;
}
