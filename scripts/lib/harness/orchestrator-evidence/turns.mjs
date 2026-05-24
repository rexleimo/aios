/* 中文注释：turn/work-item refs 生成独立处理，让 artifact enrichment 可单独测试和复用。 */
import { normalizeStringArray, normalizeText, uniqueStrings } from './shared.mjs';

export function parseAttemptCount(jobRun) {
  const raw = Number.isFinite(jobRun?.attempts) ? Math.floor(jobRun.attempts) : 0;
  return raw > 0 ? raw : 1;
}

export function buildTurnId({ stamp, jobId, attempt }) {
  const safeStamp = normalizeText(stamp);
  const safeJobId = normalizeText(jobId);
  const safeAttempt = Number.isFinite(attempt) ? Math.max(1, Math.floor(attempt)) : 1;
  if (!safeStamp || !safeJobId) {
    return '';
  }
  return `${safeStamp}:${safeJobId}:a${safeAttempt}`;
}

export function buildJobWorkItemRefMap(dispatchPlan = null) {
  const jobs = Array.isArray(dispatchPlan?.jobs) ? dispatchPlan.jobs : [];
  const map = new Map();
  for (const job of jobs) {
    const jobId = normalizeText(job?.jobId);
    if (!jobId) continue;
    const refs = normalizeStringArray(job?.launchSpec?.workItemRefs);
    if (refs.length > 0) {
      map.set(jobId, refs);
    }
  }
  return map;
}

export function buildTurnRefs({ stamp, jobId, turnId, workItemRefs }) {
  const refs = [
    'env:orchestrate',
    stamp ? `dispatch:${stamp}` : '',
    turnId ? `turn:${turnId}` : '',
    jobId ? `job:${jobId}` : '',
    ...(Array.isArray(workItemRefs) ? workItemRefs.map((ref) => `work-item:${normalizeText(ref)}`) : []),
  ];
  return normalizeStringArray(refs);
}

export function enrichDispatchRunForArtifact(dispatchRun, dispatchPlan, stamp) {
  if (!dispatchRun || typeof dispatchRun !== 'object') {
    return dispatchRun || null;
  }

  const workItemRefsByJobId = buildJobWorkItemRefMap(dispatchPlan);
  const rawJobRuns = Array.isArray(dispatchRun.jobRuns) ? dispatchRun.jobRuns : [];
  const jobRuns = rawJobRuns.map((jobRun) => {
    if (!jobRun || typeof jobRun !== 'object') return jobRun;
    const jobId = normalizeText(jobRun.jobId);
    if (!jobId) return { ...jobRun };

    const existingWorkItemRefs = normalizeStringArray(jobRun.workItemRefs);
    const resolvedWorkItemRefs = existingWorkItemRefs.length > 0
      ? existingWorkItemRefs
      : (workItemRefsByJobId.get(jobId) || []);

    const existingTurnId = normalizeText(jobRun.turnId);
    const attempt = parseAttemptCount(jobRun);
    const resolvedTurnId = existingTurnId || buildTurnId({ stamp, jobId, attempt });

    const existingRefs = normalizeStringArray(jobRun.refs);
    const resolvedRefs = uniqueStrings([
      ...existingRefs,
      ...buildTurnRefs({
        stamp,
        jobId,
        turnId: resolvedTurnId,
        workItemRefs: resolvedWorkItemRefs,
      }),
    ]);

    return {
      ...jobRun,
      turnId: resolvedTurnId,
      workItemRefs: resolvedWorkItemRefs,
      refs: resolvedRefs,
    };
  });

  return {
    ...dispatchRun,
    jobRuns,
  };
}
