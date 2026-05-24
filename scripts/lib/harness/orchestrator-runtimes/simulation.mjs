/* 中文注释：subagent simulation 只生成模拟 jobRuns，不处理真实子进程执行。 */
import { normalizeHandoffPayload } from '../handoff.mjs';
import { createHandoffFromPhase, mergeParallelHandoffs } from '../orchestrator.mjs';

export function getPhaseForJob(plan, job) {
  const phaseId = String(job?.phaseId || '').trim();
  if (!phaseId) return null;
  const phases = Array.isArray(plan?.phases) ? plan.phases : [];
  return phases.find((phase) => String(phase?.id || '').trim() === phaseId) || null;
}

export function mapExecutorLabels(dispatchPlan) {
  const entries = Array.isArray(dispatchPlan?.executorDetails) ? dispatchPlan.executorDetails : [];
  return new Map(entries.map((item) => [String(item?.id || '').trim(), String(item?.label || '').trim()]).filter(([id]) => id));
}

export function simulateSubagentDispatchRun(plan, dispatchPlan, { io } = {}) {
  const jobs = Array.isArray(dispatchPlan?.jobs) ? dispatchPlan.jobs : [];
  const executorLabels = mapExecutorLabels(dispatchPlan);
  const jobRuns = [];
  const jobRunMap = new Map();

  for (const job of jobs) {
    const dependencyRuns = Array.isArray(job.dependsOn)
      ? job.dependsOn.map((jobId) => jobRunMap.get(jobId)).filter(Boolean)
      : [];

    const executorId = String(job?.launchSpec?.executor || '').trim() || 'unknown';
    const executorLabel = executorLabels.get(executorId) || executorId;

    if (job.jobType === 'phase') {
      const phase = getPhaseForJob(plan, job);
      if (!phase) {
        jobRuns.push({
          jobId: job.jobId,
          jobType: job.jobType,
          role: job.role,
          executor: executorId,
          executorLabel,
          dependsOn: Array.isArray(job.dependsOn) ? [...job.dependsOn] : [],
          status: 'blocked',
          inputSummary: {
            dependencyCount: dependencyRuns.length,
            inputTypes: Array.isArray(job.launchSpec?.inputs) ? [...job.launchSpec.inputs] : [],
          },
          output: {
            outputType: job.launchSpec?.outputType || 'handoff',
            error: `Unknown orchestration phase for job: ${job.jobId}`,
          },
        });
        continue;
      }

      const payload = createHandoffFromPhase(plan, phase, {
        toRole: job.launchSpec?.handoffTarget || 'next-phase',
        status: 'completed',
        contextSummary: `Subagent runtime simulated output for ${job.jobId}. ${phase.responsibility}`,
        findings: [`Simulated subagent output for ${job.jobId}.`],
        recommendations: [`Runtime path validated for ${job.role}.`],
      });

      const jobRun = {
        jobId: job.jobId,
        jobType: job.jobType,
        role: job.role,
        executor: executorId,
        executorLabel,
        dependsOn: Array.isArray(job.dependsOn) ? [...job.dependsOn] : [],
        status: 'simulated',
        inputSummary: {
          dependencyCount: dependencyRuns.length,
          inputTypes: Array.isArray(job.launchSpec?.inputs) ? [...job.launchSpec.inputs] : [],
        },
        output: {
          outputType: job.launchSpec?.outputType || 'handoff',
          payload,
        },
      };

      jobRuns.push(jobRun);
      jobRunMap.set(job.jobId, jobRun);
      continue;
    }

    if (job.jobType === 'merge-gate') {
      const handoffs = dependencyRuns.map((run) => run?.output?.payload).filter(Boolean);
      const mergeResult = mergeParallelHandoffs(handoffs);
      const payload = normalizeHandoffPayload({
        status: mergeResult.ok ? 'completed' : 'blocked',
        fromRole: 'merge-gate',
        toRole: 'complete',
        taskTitle: plan?.taskTitle || 'Untitled task',
        contextSummary: mergeResult.ok
          ? `Subagent merge gate passed for ${job.group}.`
          : `Subagent merge gate blocked for ${job.group}.`,
        findings: mergeResult.mergedFindings,
        filesTouched: mergeResult.touchedFiles,
        recommendations: mergeResult.mergedRecommendations,
      });

      const jobRun = {
        jobId: job.jobId,
        jobType: job.jobType,
        role: job.role,
        executor: executorId,
        executorLabel,
        dependsOn: Array.isArray(job.dependsOn) ? [...job.dependsOn] : [],
        status: mergeResult.ok ? 'simulated' : 'blocked',
        inputSummary: {
          dependencyCount: dependencyRuns.length,
          inputTypes: Array.isArray(job.launchSpec?.inputs) ? [...job.launchSpec.inputs] : [],
        },
        output: {
          outputType: job.launchSpec?.outputType || 'merged-handoff',
          payload,
          mergeResult: {
            ok: mergeResult.ok,
            blockedCount: mergeResult.blocked.length,
            conflictCount: mergeResult.conflicts.length,
            touchedFiles: mergeResult.touchedFiles,
          },
        },
      };

      jobRuns.push(jobRun);
      jobRunMap.set(job.jobId, jobRun);
      continue;
    }

    const jobRun = {
      jobId: job.jobId,
      jobType: job.jobType,
      role: job.role,
      executor: executorId,
      executorLabel,
      dependsOn: Array.isArray(job.dependsOn) ? [...job.dependsOn] : [],
      status: 'blocked',
      inputSummary: {
        dependencyCount: dependencyRuns.length,
        inputTypes: Array.isArray(job.launchSpec?.inputs) ? [...job.launchSpec.inputs] : [],
      },
      output: {
        outputType: job.launchSpec?.outputType || 'unknown',
        error: `Unsupported job type in subagent runtime simulation: ${job.jobType}`,
      },
    };
    jobRuns.push(jobRun);
    jobRunMap.set(job.jobId, jobRun);
  }

  const executorDetails = Array.isArray(dispatchPlan?.executorDetails)
    ? dispatchPlan.executorDetails.map((item) => ({ ...item }))
    : [];
  const executorRegistry = Array.isArray(dispatchPlan?.executorRegistry)
    ? [...dispatchPlan.executorRegistry]
    : executorDetails.map((item) => item.id);

  io?.log?.(`[subagent-runtime] simulated jobs=${jobRuns.length}`);

  return {
    mode: 'live',
    ok: jobRuns.every((jobRun) => jobRun.status !== 'blocked'),
    executorRegistry,
    executorDetails,
    jobRuns,
    finalOutputs: jobRuns
      .filter((jobRun) => jobRun.output?.outputType === 'merged-handoff' || jobRun.jobType === 'phase')
      .map((jobRun) => ({ jobId: jobRun.jobId, outputType: jobRun.output?.outputType || 'unknown' })),
  };
}
