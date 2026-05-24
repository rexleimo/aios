/* 中文注释：事件文本、checkpoint 摘要和下一步建议独立构造，持久化层只负责写入。 */
import { formatDispatchCostForEvent, hasDispatchCost } from './cost.mjs';
import { normalizeDispatchMode } from './shared.mjs';

export function buildDispatchHeadline(report) {
  const dispatchRun = report.dispatchRun || { ok: false, jobRuns: [], executorRegistry: [] };
  const mode = normalizeDispatchMode(dispatchRun);
  const blockedCount = dispatchRun.jobRuns.filter((jobRun) => jobRun.status === 'blocked').length;
  const executorSummary = dispatchRun.executorRegistry.length > 0
    ? dispatchRun.executorRegistry.join(',')
    : 'none';

  return dispatchRun.ok
    ? `orchestrate ${mode} ready: blueprint=${report.blueprint} jobs=${dispatchRun.jobRuns.length} executors=${executorSummary}`
    : `orchestrate ${mode} blocked: blueprint=${report.blueprint} jobs=${dispatchRun.jobRuns.length} blocked=${blockedCount} executors=${executorSummary}`;
}

export function buildEventText(report, artifactPath) {
  const dispatchRun = report.dispatchRun || { ok: false, jobRuns: [] };
  const finalOutputs = Array.isArray(dispatchRun.finalOutputs) ? dispatchRun.finalOutputs.length : 0;
  const parts = [
    buildDispatchHeadline(report),
    `task=${report.taskTitle}`,
    `artifact=${artifactPath}`,
    `finalOutputs=${finalOutputs}`,
  ];
  if (hasDispatchCost(dispatchRun.cost)) {
    parts.push(`cost=${formatDispatchCostForEvent(dispatchRun.cost)}`);
  }
  return parts.join(' | ');
}

export function buildCheckpointSummary(report) {
  const dispatchRun = report.dispatchRun || { ok: false, jobRuns: [] };
  const mode = normalizeDispatchMode(dispatchRun);
  const blockedCount = dispatchRun.jobRuns.filter((jobRun) => jobRun.status === 'blocked').length;
  const statusLabel = dispatchRun.ok ? 'ready' : 'blocked';
  return `Recorded orchestrate ${mode} ${statusLabel} for ${report.taskTitle}; jobs=${dispatchRun.jobRuns.length}; blocked=${blockedCount}.`;
}

export function buildNextActions(report, artifactPath) {
  const dispatchRun = report.dispatchRun || { ok: false };
  const mode = normalizeDispatchMode(dispatchRun);
  if (dispatchRun.ok) {
    if (mode === 'live') {
      return [
        `Review live-dispatch artifact ${artifactPath}`,
        'Run learn-eval to inspect cost/token telemetry trends',
      ];
    }
    return [
      `Review dry-run artifact ${artifactPath}`,
      'Attach a real executor runtime when available',
    ];
  }

  return [
    `Inspect blocked handoffs in ${artifactPath}`,
    'Resolve merge-gate conflicts before rerunning orchestration',
  ];
}
