// scripts/lib/tooling/cli/dispatch/memory.mjs — 记忆与留痕族命令的路由（memo / memory / tokens / import）。
//
// 从 `dispatch/dispatch.mjs` 原样搬出，行为一字未改：那 507 行早已超过它自己的 shrink-only
// 基线 506（`config/standards.json:462`），而 `aios mcp` 必须再往里加一条分支。加线前先按
// 基线要求减线，是这条门唯一的正向走法——把违规定格扩大、或反过来把基线调高，都不算修。
//
// 这族命令的共同点是真的：它们都只读/写 AIOS 自己的记忆与观测状态，且都不需要 projectRoot。
/** 命中即返回 true；未命中返回 false，由调用方继续走它自己的路由链。 */
export async function runMemoryFamilyCommand(parsed, { workspaceRoot, stdout }) {
  if (parsed.command === 'memo') {
    const { runMemo } = await import('../../../memory/memo/memo.mjs');
    await runMemo(parsed.options, { rootDir: workspaceRoot });
    return true;
  }

  if (parsed.command === 'memory') {
    const [sub, ...flags] = parsed.options.args || [];
    if (sub !== 'report') {
      throw new Error('Usage: aios memory report [--json]');
    }
    const { buildMemoryReport, renderMemoryReport } = await import('../../../memory/memo/care/report.mjs');
    const report = await buildMemoryReport(workspaceRoot, { env: process.env });
    const json = flags.includes('--json');
    stdout.write(json ? `${JSON.stringify(report, null, 2)}\n` : `${renderMemoryReport(report)}\n`);
    return true;
  }

  if (parsed.command === 'tokens') {
    const [sub, ...flags] = parsed.options.args || [];
    if (sub !== 'report') {
      throw new Error('Usage: aios tokens report [--session <id>] [--json]');
    }
    const { buildTokensReport, renderTokensReport } = await import('../../../foundation/interception/observability/metrics/report.mjs');
    const json = flags.includes('--json');
    const sessionFlag = flags.indexOf('--session');
    const sessionId = sessionFlag >= 0 ? String(flags[sessionFlag + 1] || 'default') : 'default';
    const report = await buildTokensReport({ workspaceRoot, sessionId });
    stdout.write(json ? `${JSON.stringify(report, null, 2)}\n` : `${renderTokensReport(report)}\n`);
    return true;
  }

  if (parsed.command === 'import') {
    const { runImportCommand } = await import('../../../memory/memo/flow/import-cli.mjs');
    await runImportCommand({ args: parsed.options.args || [], rootDir: workspaceRoot, stdout });
    return true;
  }

  return false;
}
