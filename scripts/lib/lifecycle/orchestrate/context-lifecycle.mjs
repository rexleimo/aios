import {
  assembleExecutionContext,
  evaluateExecutionContextPreflight,
} from '../../contextdb/execution-context.mjs';
import { readActivePlan } from '../../planning/contract.mjs';
import { evaluateContextReconciliation } from '../context-reconciliation.mjs';

function allTasks(plan) {
  return Array.isArray(plan?.tasks) ? plan.tasks : [];
}

function eligibleTasks(plan) {
  return allTasks(plan)
    .filter((task) => !['done', 'skipped'].includes(String(task?.status || 'pending')));
}

function topologicalTasks(plan) {
  const tasks = allTasks(plan);
  const indexById = new Map();
  const indegree = new Map();
  const dependents = new Map();

  for (const [index, task] of tasks.entries()) {
    const id = String(task?.id || '').trim();
    if (id && !indexById.has(id)) indexById.set(id, index);
    indegree.set(index, 0);
    dependents.set(index, []);
  }

  for (const [index, task] of tasks.entries()) {
    const dependencyIds = new Set((Array.isArray(task?.dependsOn) ? task.dependsOn : [])
      .map((value) => String(value || '').trim())
      .filter(Boolean));
    for (const dependencyId of dependencyIds) {
      const dependencyIndex = indexById.get(dependencyId);
      if (dependencyIndex === undefined) continue;
      indegree.set(index, (indegree.get(index) || 0) + 1);
      dependents.get(dependencyIndex).push(index);
    }
  }

  const ready = [...indegree.entries()]
    .filter(([, degree]) => degree === 0)
    .map(([index]) => index)
    .sort((left, right) => left - right);
  const ordered = [];
  const seen = new Set();

  while (ready.length > 0) {
    const index = ready.shift();
    if (seen.has(index)) continue;
    seen.add(index);
    ordered.push(tasks[index]);
    for (const dependentIndex of dependents.get(index) || []) {
      const degree = (indegree.get(dependentIndex) || 0) - 1;
      indegree.set(dependentIndex, degree);
      if (degree === 0) {
        ready.push(dependentIndex);
        ready.sort((left, right) => left - right);
      }
    }
  }

  // Malformed dependency cycles still get a stable, declared-order fallback.
  for (const [index, task] of tasks.entries()) {
    if (!seen.has(index)) ordered.push(task);
  }
  return ordered;
}

function selectTask(plan, requestedTaskId) {
  const requested = String(requestedTaskId || '').trim();
  const candidates = eligibleTasks(plan);
  if (requested) {
    const task = candidates.find((candidate) => String(candidate?.id || '') === requested);
    return task
      ? { task, reason: '' }
      : { task: null, reason: 'context_task_not_found' };
  }

  const pending = topologicalTasks(plan)
    .filter((task) => String(task?.status || 'pending') === 'pending');
  const contextualPending = pending.filter((task) => Array.isArray(task?.contextRequirements) && task.contextRequirements.length > 0);
  if (contextualPending.length > 0) return { task: contextualPending[0], reason: '' };
  if (pending.length > 0) return { task: pending[0], reason: '' };
  if (candidates.length === 1) return { task: candidates[0], reason: '' };
  if (candidates.length === 0) return { task: null, reason: 'no_eligible_context_task' };
  return { task: null, reason: 'ambiguous_context_task' };
}

function publicAssembly(assembled) {
  return {
    evidenceSource: assembled.assembly.evidenceSource,
    evidenceTrust: assembled.assembly.evidenceTrust,
    brokerVerified: false,
    budget: assembled.assembly.budget,
    projectionDecisionDigest: assembled.assembly.projectionDecisionDigest,
    deliveryUnits: assembled.assembly.deliveryUnits,
    deliveryDigest: assembled.assembly.deliveryDigest,
    sources: assembled.assembly.sources,
  };
}

/**
 * Bridge the active structured plan into the real orchestrate lifecycle.
 * The returned contextText is the exact representation appended to dispatch input;
 * it is deliberately excluded from the report and sidecar metadata.
 */
export async function prepareOrchestrateContextLifecycle({
  rootDir,
  options,
  env = process.env,
} = {}) {
  const plan = readActivePlan(rootDir);
  if (!plan) {
    return {
      contextText: '',
      redactionTexts: [],
      packet: null,
      receipt: null,
      planTasks: null,
      report: { status: 'not_applicable', reason: 'no_active_structured_plan' },
    };
  }
  const selected = selectTask(plan, options?.contextTaskId);
  if (!selected.task) {
    return {
      contextText: '',
      redactionTexts: [],
      packet: null,
      receipt: null,
      planTasks: plan.tasks || null,
      report: {
        status: 'not_applicable',
        reason: selected.reason,
        activePlan: { relativePath: String(plan.relativePath || ''), sessionId: String(plan.sessionId || '') },
        eligibleTaskIds: eligibleTasks(plan).map((task) => String(task.id || '')),
      },
    };
  }

  try {
    const assembled = await assembleExecutionContext({
      rootDir,
      plan,
      taskId: selected.task.id,
      budgetUnits: options?.contextBudgetUnits,
      mode: 'observe',
      persist: true,
      env,
    });
    const preflight = await evaluateExecutionContextPreflight({
      rootDir,
      packet: assembled.packet,
      receipt: assembled.receipt,
      mutationRefs: selected.task.targets || [],
    });
    return {
      contextText: assembled.assembly.contextText,
      redactionTexts: assembled.assembly.redactionTexts,
      packet: assembled.packet,
      receipt: assembled.receipt,
      planTasks: plan.tasks || null,
      report: {
        status: 'observed',
        activePlan: { relativePath: String(plan.relativePath || ''), sessionId: String(plan.sessionId || '') },
        taskId: selected.task.id,
        packetRef: assembled.paths.packetRef,
        receiptRef: assembled.paths.receiptRef,
        assembly: publicAssembly(assembled),
        preflight,
      },
    };
  } catch (error) {
    return {
      contextText: '',
      redactionTexts: [],
      packet: null,
      receipt: null,
      planTasks: null,
      report: {
        status: 'observation_error',
        reason: 'context_assembly_failed',
        error: String(error?.message || error),
      },
    };
  }
}

export async function finalizeOrchestrateContextLifecycle({
  rootDir,
  options,
  prepared,
  mutationObservation = null,
  env = process.env,
} = {}) {
  if (!prepared?.packet || prepared?.report?.status !== 'observed') return prepared?.report || null;
  try {
    const reconciliation = await evaluateContextReconciliation({
      rootDir,
      sessionId: options?.sessionId || prepared.packet.plan?.sessionId || 'orchestrate',
      packet: prepared.packet,
      workspaceObservation: mutationObservation,
      env,
      persist: true,
    });
    return { ...prepared.report, reconciliation };
  } catch (error) {
    return {
      ...prepared.report,
      reconciliation: {
        status: 'observation_error',
        reason: 'context_reconciliation_failed',
        error: String(error?.message || error),
      },
    };
  }
}
