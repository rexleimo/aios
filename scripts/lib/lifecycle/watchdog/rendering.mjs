/* 中文注释：watchdog 渲染只负责把状态对象转成 CLI 文本。 */
export function formatWatchdogText(state) {
  const lines = [
    `AIOS Team Watchdog: ${state.sessionId || '(no session)'}`,
    `Decision: ${state.decision}`,
    state.readiness?.verdict ? `Readiness: ${state.readiness.verdict}` : '',
    `Reason: ${state.reason}`,
  ];
  if (Array.isArray(state.nextActions) && state.nextActions.length > 0) {
    lines.push('Next actions:');
    for (const action of state.nextActions) {
      lines.push(`- ${action}`);
    }
  }
  return `${lines.join('\n')}\n`;
}
