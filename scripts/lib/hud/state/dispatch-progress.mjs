import { normalizeText } from './shared.mjs';

function createDispatchProgressCounts() {
  return {
    total: 0,
    queued: 0,
    running: 0,
    blocked: 0,
    done: 0,
  };
}

function normalizeDispatchRunStatus(rawStatus = '') {
  const value = normalizeText(rawStatus).toLowerCase();
  if (value === 'blocked' || value === 'needs-input') return 'blocked';
  if (value === 'running') return 'running';
  if (value === 'completed' || value === 'simulated' || value === 'done') return 'done';
  if (value === 'queued' || value === 'pending') return 'queued';
  return 'queued';
}

function incrementDispatchProgressCount(counts = null, status = 'queued') {
  if (!counts || typeof counts !== 'object') return;
  counts.total += 1;
  if (status === 'queued' || status === 'running' || status === 'blocked' || status === 'done') {
    counts[status] += 1;
  } else {
    counts.queued += 1;
  }
}

function computeCompletionRatio(done = 0, total = 0) {
  const doneValue = Number.isFinite(done) ? Math.max(0, Number(done)) : 0;
  const totalValue = Number.isFinite(total) ? Math.max(0, Number(total)) : 0;
  if (totalValue <= 0) return 0;
  return Number((doneValue / totalValue).toFixed(3));
}

function resolveDispatchExecutor({ jobId = '', jobRun = null, planByJobId = new Map(), dispatchRun = null } = {}) {
  const fromRun = normalizeText(jobRun?.executor);
  if (fromRun) return fromRun;

  if (jobId && planByJobId instanceof Map && planByJobId.has(jobId)) {
    const plannedExecutor = normalizeText(planByJobId.get(jobId)?.launchSpec?.executor);
    if (plannedExecutor) return plannedExecutor;
  }

  const registry = Array.isArray(dispatchRun?.executorRegistry)
    ? dispatchRun.executorRegistry.map((item) => normalizeText(item)).filter(Boolean)
    : [];
  if (registry.length === 1) return registry[0];
  return 'unknown';
}

export function buildDispatchProgress(dispatchRun = null, dispatchPlan = null) {
  const jobRuns = Array.isArray(dispatchRun?.jobRuns) ? dispatchRun.jobRuns : [];
  const plannedJobs = Array.isArray(dispatchPlan?.jobs) ? dispatchPlan.jobs : [];
  if (jobRuns.length === 0 && plannedJobs.length === 0) return null;

  const planByJobId = new Map(
    plannedJobs
      .map((job) => [normalizeText(job?.jobId), job])
      .filter(([jobId]) => jobId)
  );
  const fromRuns = jobRuns.length > 0;
  const entries = fromRuns ? jobRuns : plannedJobs;
  const jobCounts = createDispatchProgressCounts();
  const toolCounts = new Map();

  for (const entry of entries) {
    const jobId = normalizeText(entry?.jobId);
    const status = fromRuns
      ? normalizeDispatchRunStatus(entry?.status)
      : normalizeDispatchRunStatus(entry?.status || 'queued');
    const tool = fromRuns
      ? resolveDispatchExecutor({ jobId, jobRun: entry, planByJobId, dispatchRun })
      : normalizeText(entry?.launchSpec?.executor) || 'unknown';

    incrementDispatchProgressCount(jobCounts, status);
    const current = toolCounts.get(tool) || createDispatchProgressCounts();
    incrementDispatchProgressCount(current, status);
    toolCounts.set(tool, current);
  }

  const tools = Array.from(toolCounts.entries())
    .map(([tool, counts]) => ({
      tool,
      ...counts,
      completionRatio: computeCompletionRatio(counts.done, counts.total),
    }))
    .sort((left, right) =>
      right.blocked - left.blocked
      || right.running - left.running
      || right.total - left.total
      || left.tool.localeCompare(right.tool)
    );

  return {
    jobs: {
      ...jobCounts,
      completionRatio: computeCompletionRatio(jobCounts.done, jobCounts.total),
    },
    tools,
  };
}
