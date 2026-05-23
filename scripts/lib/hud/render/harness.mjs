import { clipLine, normalizeText } from './shared.mjs';

export function formatHarnessLine(state) {
  const harness = state?.latestHarnessRun && typeof state.latestHarnessRun === 'object'
    ? state.latestHarnessRun
    : null;
  if (!harness) return '';

  const parts = [
    `status=${normalizeText(harness.status) || 'unknown'}`,
  ];
  if (Number.isFinite(harness.iterationCount)) parts.push(`iteration=${Math.max(0, Math.floor(harness.iterationCount))}`);
  if (normalizeText(harness.lastOutcome)) parts.push(`outcome=${normalizeText(harness.lastOutcome)}`);
  if (normalizeText(harness.lastFailureClass)) parts.push(`fail=${normalizeText(harness.lastFailureClass)}`);
  const backoffDelay = Number.isFinite(harness.backoff?.nextDelayMs)
    ? Math.max(0, Math.floor(harness.backoff.nextDelayMs))
    : null;
  if (backoffDelay !== null) parts.push(`backoff=${backoffDelay}ms`);
  const stopRequested = state?.harnessControl?.stopRequested === true || harness.stopRequested === true;
  parts.push(`stopRequested=${stopRequested ? 'true' : 'false'}`);
  if (harness.worktree?.enabled === true) {
    parts.push(`worktree=${harness.worktree.preserved === true ? 'preserved' : 'enabled'}`);
  }
  return clipLine(`Harness: ${parts.join(' ')}`, 220);
}
