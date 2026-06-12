import {
  createPreMutationSnapshot,
  withPreMutationSnapshot,
} from './snapshots.mjs';
import {
  buildAutoCompletedReadOnlyReviewRun,
  buildBlockedJobRun,
  normalizeSeededJobRun,
  shouldAutoCompleteReadOnlyReviewPhase,
} from './job-runs.mjs';
import { executeMergeGateJob } from './merge-gate.mjs';
import { executePhaseJob } from './phase-job.mjs';
import { normalizeText } from './text.mjs';

function collectSeedJobRuns(dispatchPlan) {
  return Array.isArray(dispatchPlan?.seedJobRuns)
    ? dispatchPlan.seedJobRuns.map((jobRun) => normalizeSeededJobRun(jobRun)).filter(Boolean)
    : [];
}

function buildPendingJobMap(jobs, jobRunMap) {
  return new Map(
    jobs
      .filter((job) => !jobRunMap.has(job.jobId))
      .map((job) => [job.jobId, job])
  );
}

export async function runDispatchJobs({
  plan,
  dispatchPlan,
  clientId,
  concurrency,
  timeoutMs,
  env,
  io,
  agentSpecNormalized,
  executorLabels,
  dispatchPolicy,
  rootDir,
  sessionId,
  structuredOutputTempDir,
  preMutationSnapshotEnabled,
}) {
  const jobs = Array.isArray(dispatchPlan?.jobs) ? dispatchPlan.jobs : [];
  const seedJobRuns = collectSeedJobRuns(dispatchPlan);
  const jobRunMap = new Map();
  for (const seedJobRun of seedJobRuns) {
    jobRunMap.set(seedJobRun.jobId, seedJobRun);
  }
  if (seedJobRuns.length > 0) {
    io?.log?.(`[subagent-runtime] seeded dependency runs=${seedJobRuns.length}`);
  }

  const pending = buildPendingJobMap(jobs, jobRunMap);
  const running = new Map();

  const startJob = async (job) => {
    const dependencyRuns = Array.isArray(job.dependsOn)
      ? job.dependsOn.map((jobId) => jobRunMap.get(jobId)).filter(Boolean)
      : [];
    const executorId = normalizeText(job?.launchSpec?.executor) || 'unknown';
    const executorLabel = executorLabels.get(executorId) || executorId;

    if (dependencyRuns.some((run) => run.status === 'blocked')) {
      return buildBlockedJobRun(plan, job, dependencyRuns, { executorLabel, reason: 'Blocked by dependency' });
    }

    if (job.jobType === 'phase') {
      const phases = Array.isArray(plan?.phases) ? plan.phases : [];
      const phase = phases.find((item) => normalizeText(item?.id) === normalizeText(job.phaseId)) || null;
      if (!phase) {
        return buildBlockedJobRun(plan, job, dependencyRuns, { executorLabel, reason: `Unknown orchestration phase for job: ${job.jobId}` });
      }

      let preMutationSnapshot = null;
      if (preMutationSnapshotEnabled && phase.canEditFiles === true) {
        try {
          preMutationSnapshot = await createPreMutationSnapshot({
            rootDir,
            sessionId,
            job,
            phase,
            io,
          });
        } catch (error) {
          const reason = `pre-mutation snapshot failed: ${error instanceof Error ? error.message : String(error)}`;
          io?.log?.(`[subagent-runtime] blocked ${job.jobId} reason=${reason}`);
          return buildBlockedJobRun(plan, job, dependencyRuns, {
            executorLabel,
            reason,
          });
        }
      }

      if (shouldAutoCompleteReadOnlyReviewPhase(job, dependencyRuns)) {
        io?.log?.(`[subagent-runtime] auto-completed ${job.jobId} status=completed reason=no-upstream-file-changes`);
        return withPreMutationSnapshot(
          buildAutoCompletedReadOnlyReviewRun(plan, job, dependencyRuns, { executorLabel }),
          preMutationSnapshot
        );
      }
      const phaseJobRun = await executePhaseJob(plan, job, phase, dependencyRuns, {
        clientId,
        timeoutMs,
        env,
        io,
        agentSpecNormalized,
        executorLabel,
        dispatchPolicy,
        rootDir,
        structuredOutputTempDir,
      });
      return withPreMutationSnapshot(phaseJobRun, preMutationSnapshot);
    }

    if (job.jobType === 'merge-gate') {
      return executeMergeGateJob(plan, job, dependencyRuns, { executorLabel, dispatchPolicy });
    }

    return buildBlockedJobRun(plan, job, dependencyRuns, { executorLabel, reason: `Unsupported job type: ${job.jobType}` });
  };

  while (pending.size > 0 || running.size > 0) {
    let started = false;

    for (const [jobId, job] of pending) {
      if (running.size >= concurrency) {
        break;
      }

      const deps = Array.isArray(job.dependsOn) ? job.dependsOn : [];
      if (!deps.every((depId) => jobRunMap.has(depId))) {
        continue;
      }

      pending.delete(jobId);
      started = true;

      const promise = startJob(job).then((jobRun) => {
        jobRunMap.set(jobId, jobRun);
        running.delete(jobId);
        return jobRun;
      });
      running.set(jobId, promise);
    }

    if (running.size > 0) {
      await Promise.race(running.values());
      continue;
    }

    if (!started && pending.size > 0) {
      // 循环依赖或缺失依赖留给收尾阶段统一标记为 blocked。
      break;
    }
  }

  for (const job of jobs) {
    if (jobRunMap.has(job.jobId)) {
      continue;
    }
    const deps = Array.isArray(job.dependsOn) ? job.dependsOn : [];
    const dependencyRuns = deps.map((jobId) => jobRunMap.get(jobId)).filter(Boolean);
    const executorId = normalizeText(job?.launchSpec?.executor) || 'unknown';
    const executorLabel = executorLabels.get(executorId) || executorId;
    jobRunMap.set(job.jobId, buildBlockedJobRun(plan, job, dependencyRuns, { executorLabel, reason: 'Unresolved job dependency cycle' }));
  }

  return jobs.map((job) => jobRunMap.get(job.jobId)).filter(Boolean);
}
