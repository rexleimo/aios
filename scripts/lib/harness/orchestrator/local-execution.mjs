import { normalizeHandoffPayload } from '../handoff.mjs';
import { createLocalDispatchExecutorRegistry, resolveLocalDispatchExecutor } from '../orchestrator-executors.mjs';
import { createHandoffFromPhase, mergeParallelHandoffs } from './handoffs.mjs';
import { normalizeDispatchPlan } from './normalizers.mjs';
import { buildLocalDispatchPlan } from './local-dispatch-plan.mjs';
import { buildOrchestrationPlan, collectExecutorDetails } from './plan.mjs';

export function getPhaseForJob(plan, job) {
  return plan.phases.find((phase) => phase.id === job.phaseId);
}

export function executePhaseJob(plan, job) {
  const phase = getPhaseForJob(plan, job);
  if (!phase) {
    throw new Error(`Unknown orchestration phase for job: ${job.jobId}`);
  }

  const payload = createHandoffFromPhase(plan, phase, {
    toRole: job.launchSpec.handoffTarget || 'next-phase',
    status: 'completed',
    contextSummary: `Dry-run placeholder for ${job.jobId}. ${phase.responsibility}`,
    findings: [`No model execution; synthetic output for ${job.jobId}.`],
    recommendations: [`Executor interface ready for ${job.role}.`],
  });

  return {
    status: 'simulated',
    output: {
      outputType: job.launchSpec.outputType,
      payload,
    },
  };
}

export function executeMergeGateJob(plan, job, dependencyRuns = []) {
  const handoffs = dependencyRuns
    .map((run) => run?.output?.payload)
    .filter(Boolean);
  const mergeResult = mergeParallelHandoffs(handoffs);

  const payload = normalizeHandoffPayload({
    status: mergeResult.ok ? 'completed' : 'blocked',
    fromRole: 'merge-gate',
    toRole: 'complete',
    taskTitle: plan.taskTitle,
    contextSummary: mergeResult.ok
      ? `Dry-run merge gate passed for ${job.group}.`
      : `Dry-run merge gate blocked for ${job.group}.`,
    findings: mergeResult.mergedFindings,
    filesTouched: mergeResult.touchedFiles,
    recommendations: mergeResult.mergedRecommendations,
  });

  return {
    status: mergeResult.ok ? 'simulated' : 'blocked',
    output: {
      outputType: job.launchSpec.outputType,
      payload,
      mergeResult: {
        ok: mergeResult.ok,
        blockedCount: mergeResult.blocked.length,
        conflictCount: mergeResult.conflicts.length,
        touchedFiles: mergeResult.touchedFiles,
      },
    },
  };
}

export function createLocalDryRunRuntimeInfo() {
  return {
    id: 'local-dry-run',
    label: 'Local Dry Run Runtime',
    requiresModel: false,
    executionMode: 'dry-run',
  };
}

export function executeLocalDispatchPlan(input = {}, rawDispatchPlan = null) {
  const plan = Array.isArray(input.phases) ? input : buildOrchestrationPlan(input);
  const dispatchPlan = normalizeDispatchPlan(rawDispatchPlan || plan.dispatchPlan || buildLocalDispatchPlan(plan));
  const registry = createLocalDispatchExecutorRegistry({
    executePhaseJob,
    executeMergeGateJob,
  });
  const jobRuns = [];
  const jobRunMap = new Map();

  for (const job of dispatchPlan.jobs) {
    const dependencyRuns = job.dependsOn
      .map((jobId) => jobRunMap.get(jobId))
      .filter(Boolean);
    const phase = job.jobType === 'phase' ? getPhaseForJob(plan, job) : null;
    const executor = resolveLocalDispatchExecutor(job, registry);
    const execution = executor.execute({
      plan,
      job,
      phase,
      dependencyRuns,
    });

    const jobRun = {
      jobId: job.jobId,
      jobType: job.jobType,
      role: job.role,
      executor: executor.id,
      executorLabel: executor.label,
      dependsOn: [...job.dependsOn],
      status: execution.status,
      ...(job.launchSpec?.modelRouting ? { modelRouting: { ...job.launchSpec.modelRouting } } : {}),
      inputSummary: {
        dependencyCount: dependencyRuns.length,
        inputTypes: Array.isArray(job.launchSpec.inputs) ? [...job.launchSpec.inputs] : [],
      },
      output: execution.output,
    };

    jobRuns.push(jobRun);
    jobRunMap.set(job.jobId, jobRun);
  }

  const executorDetails = collectExecutorDetails(dispatchPlan.jobs);

  return {
    mode: 'dry-run',
    runtime: createLocalDryRunRuntimeInfo(),
    ok: jobRuns.every((jobRun) => jobRun.status !== 'blocked'),
    executorRegistry: executorDetails.map((executor) => executor.id),
    executorDetails,
    jobRuns,
    finalOutputs: jobRuns
      .filter((jobRun) => jobRun.output?.outputType === 'merged-handoff' || jobRun.jobType === 'phase')
      .map((jobRun) => ({ jobId: jobRun.jobId, outputType: jobRun.output?.outputType || 'unknown' })),
  };
}
