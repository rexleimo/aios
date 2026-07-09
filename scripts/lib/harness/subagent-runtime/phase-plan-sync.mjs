/**
 * L3 — team/subagent success → plan task progress + evidence crumb (best-effort).
 */

export async function maybeSyncPlanOnPhaseSuccess({
  rootDir,
  plan,
  job,
  payloadStatus = '',
  io = null,
} = {}) {
  try {
    const { syncPlanWithIterationOutcome } = await import('../../planning/plan-runtime.mjs');
    return syncPlanWithIterationOutcome({
      rootDir,
      objective: plan?.taskTitle || plan?.objective || job?.jobId,
      iteration: 1,
      outcome: {
        outcome: 'success',
        ok: true,
        summary: `subagent ${job?.jobId || 'job'} completed`,
        evidence: [
          `job=${job?.jobId || ''}`,
          `role=${job?.role || ''}`,
          `status=${payloadStatus}`,
        ],
      },
      client: 'subagent-runtime',
      io,
    });
  } catch {
    return null;
  }
}
