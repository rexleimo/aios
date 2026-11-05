// scripts/lib/tooling/cli/commander/specs/io/mcp.mjs — `aios mcp` 的声明面。
//
// 这份声明不是文档注释：`COMMAND_SPECS` 会喂给 `cli-usage-error-exit.test.mjs`，
// 它对每个登记的命令真实 spawn `<cmd> --definitely-not-a-real-flag` 并要求非零退出。
// 所以「在这里登记」等于「承诺这个命令会拒绝未知旗标」——做不到就别登记（`mcp` 从严实现）。
export const MCP_COMMAND_SPECS = [
  {
    name: 'mcp',
    description: 'Manage MCP servers AIOS registered across local agent clients (ownership-guarded)',
    options: [
      ['--json', 'Machine-readable JSON output'],
      ['--format <format>', 'Output format: text or json'],
      ['--client <id>', 'Client id, or "all" for list/doctor'],
      ['--scope <scope>', 'Landing scope: home, project, or all'],
      ['--dry-run', 'Plan without touching config or ledger'],
      ['--adopt', 'Explicitly take over a foreign or user-edited entry'],
      ['--restore', 'Replace an AIOS-owned entry whose shape is stale'],
      ['--force', 'Human override to delete an entry AIOS registered and someone has since edited'],
    ],
  },
];
