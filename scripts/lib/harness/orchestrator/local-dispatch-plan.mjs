import { MERGE_GATE_BLOCK_STATUSES, MERGE_GATE_CONFLICT_RULE } from './blueprints.mjs';
import { LOCAL_PHASE_EXECUTOR } from '../orchestrator-executors.mjs';
import { collectExecutorDetails, resolvePhaseExecutorSelection, buildOrchestrationPlan } from './plan.mjs';
import { normalizeWorkItems } from './work-items.mjs';
import {
  assertEditableParallelOwnership,
  buildBoundedWorkItemQueue,
  createMergeGateJob,
  createPhaseJob,
  createPhaseJobWithOverrides,
  getDispatchParallelism,
  resolveWorkItemsForPhase,
} from './local-jobs.mjs';

export function buildLocalDispatchPlan(input = {}, options = {}) {
  const plan = Array.isArray(input.phases) ? input : buildOrchestrationPlan(input);
  assertEditableParallelOwnership(plan);
  const parallelism = getDispatchParallelism(plan);
  const phaseExecutorSelection = resolvePhaseExecutorSelection(options.phaseExecutor);
  const phaseExecutor = phaseExecutorSelection.applied_executor;
  const env = options.env || process.env;
  const workItemQueueEntries = [];
  const maxParallelWorkItems = 2;
  const jobs = [];
  const notes = ['Skeleton only; no model runtime is invoked.'];
  let upstreamJobIds = [];
  let openParallelGroup = null;

  if (phaseExecutorSelection.requested_executor) {
    if (phaseExecutorSelection.fallback_applied) {
      notes.push(
        `Phase executor override "${phaseExecutorSelection.requested_executor}" is unsupported; fallback to "${phaseExecutorSelection.applied_executor}".`
      );
    } else if (phaseExecutorSelection.requested_executor !== LOCAL_PHASE_EXECUTOR) {
      notes.push(`Phase executor override applied: "${phaseExecutorSelection.applied_executor}".`);
    }
  }

  if (parallelism === 'serial-only') {
    notes.push('Policy applied: serial-only; grouped parallel phases are emitted as sequential jobs.');
  }

  const flushParallelGroup = () => {
    if (!openParallelGroup) {
      return;
    }

    if (openParallelGroup.jobIds.length > 1) {
      const mergeGateJob = createMergeGateJob(openParallelGroup.name, openParallelGroup.jobIds);
      jobs.push(mergeGateJob);
      upstreamJobIds = [mergeGateJob.jobId];
    } else {
      const job = jobs.find((item) => item.jobId === openParallelGroup.jobIds[0]);
      if (job) {
        job.launchSpec.handoffTarget = 'next-phase';
      }
      upstreamJobIds = [...openParallelGroup.jobIds];
    }

    openParallelGroup = null;
  };

  for (const phase of plan.phases) {
    const groupedParallel = phase.mode === 'parallel' && phase.group && parallelism === 'parallel-with-merge-gate';
    const policySerializedParallel = phase.mode === 'parallel' && phase.group && parallelism === 'serial-only';
    const phaseWorkItems = resolveWorkItemsForPhase(plan, phase);
    const shouldExpandWorkItems = phase.canEditFiles === true && phaseWorkItems.length > 1;
    const phaseDependencies = [...upstreamJobIds];

    if (groupedParallel) {
      if (!openParallelGroup || openParallelGroup.name !== phase.group) {
        flushParallelGroup();
        openParallelGroup = {
          name: phase.group,
          upstreamJobIds: [...upstreamJobIds],
          jobIds: [],
        };
      }

      const job = createPhaseJob(plan, phase, openParallelGroup.upstreamJobIds, 'merge-gate', null, phaseExecutor, env);
      jobs.push(job);
      openParallelGroup.jobIds.push(job.jobId);
      continue;
    }

    flushParallelGroup();
    if (shouldExpandWorkItems) {
      const queue = buildBoundedWorkItemQueue({
        phase,
        items: phaseWorkItems,
        upstreamJobIds: phaseDependencies,
        maxParallel: maxParallelWorkItems,
      });
      for (const itemJob of queue.expanded) {
        const job = createPhaseJobWithOverrides(plan, phase, {
          dependsOn: itemJob.dependsOn,
          handoffTarget: 'next-phase',
          modeOverride: policySerializedParallel ? 'sequential' : null,
          phaseExecutor,
          jobIdOverride: itemJob.jobId,
          workItemRefsOverride: [itemJob.itemId],
          workItemId: itemJob.itemId,
          env,
        });
        jobs.push(job);
      }
      workItemQueueEntries.push(...queue.entries);
      upstreamJobIds = queue.expanded.map((itemJob) => itemJob.jobId);
      continue;
    }

    const singleWorkItemRef = phaseWorkItems.length === 1 ? [phaseWorkItems[0].itemId] : null;
    const job = createPhaseJobWithOverrides(plan, phase, {
      dependsOn: phaseDependencies,
      handoffTarget: 'next-phase',
      modeOverride: policySerializedParallel ? 'sequential' : null,
      phaseExecutor,
      env,
      ...(singleWorkItemRef ? { workItemRefsOverride: singleWorkItemRef, workItemId: singleWorkItemRef[0] } : {}),
    });
    jobs.push(job);
    if (phase.canEditFiles === true && singleWorkItemRef) {
      workItemQueueEntries.push({
        queueId: `${phase.id}.${singleWorkItemRef[0]}`,
        phaseId: phase.id,
        role: phase.role,
        itemId: singleWorkItemRef[0],
        jobId: job.jobId,
        dependsOn: [...phaseDependencies],
        status: 'queued',
      });
    }
    upstreamJobIds = [job.jobId];
  }

  flushParallelGroup();

  const executorDetails = collectExecutorDetails(jobs);

  return {
    mode: 'local',
    readyForExecution: false,
    workItems: normalizeWorkItems(plan.workItems),
    workItemQueue: {
      enabled: workItemQueueEntries.length > 0,
      maxParallel: maxParallelWorkItems,
      entries: workItemQueueEntries,
    },
    notes,
    phaseExecutor: phaseExecutorSelection,
    executorRegistry: executorDetails.map((executor) => executor.id),
    executorDetails,
    mergeGate: {
      blockStatuses: [...MERGE_GATE_BLOCK_STATUSES],
      conflictRule: MERGE_GATE_CONFLICT_RULE,
    },
    jobs,
  };
}
