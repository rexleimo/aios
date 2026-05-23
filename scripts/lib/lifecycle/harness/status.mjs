export function formatHarnessStatusText(status = null) {
  if (!status) {
    return 'AIOS Harness: (no session)\n';
  }
  const lines = [
    `AIOS Harness: ${status.sessionId}`,
    `Objective: ${status.objective || '(none)'}`,
    `Status: ${status.status}`,
    `Provider: ${status.provider}`,
    `Iterations: ${status.iterationCount}`,
    `Last outcome: ${status.lastOutcome || '(none)'}`,
    `Last failure: ${status.lastFailureClass || '(none)'}`,
    `Last stage: ${status.lastStage || '(none)'}`,
    `Stop requested: ${status.stopRequested ? 'yes' : 'no'}`,
  ];
  if (Array.isArray(status.latestEvidence) && status.latestEvidence.length > 0) {
    lines.push(`Latest evidence: ${status.latestEvidence.join(' | ')}`);
  }
  if (status.worktree?.enabled) {
    lines.push(`Worktree: ${status.worktree.preserved ? 'preserved' : 'pending'} ${status.worktree.path || '(no path)'}`);
  }
  if (status.continuitySummaryPath) {
    lines.push(`Continuity: ${status.continuitySummaryPath}`);
  }
  if (status.hookEventsPath) {
    lines.push(`Hook events: ${status.hookEventsPath}`);
  }
  return `${lines.join('\n')}\n`;
}

export async function renderStatus(io, status, json = false) {
  if (json) {
    io.log(JSON.stringify(status, null, 2));
  } else {
    io.log(formatHarnessStatusText(status));
  }
}
