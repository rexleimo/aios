import { LOCAL_PHASE_EXECUTOR, listLocalDispatchExecutors } from '../orchestrator-executors.mjs';
import { normalizeExecutorCapabilityManifest } from './executor-capabilities.mjs';
import { getOrchestratorBlueprint } from './blueprints.mjs';
import { normalizeText } from './shared.mjs';
import { buildDecomposedWorkItems, normalizeWorkItems } from './work-items.mjs';
import {
  normalizeDispatchEvidence,
  normalizeDispatchPlan,
  normalizeDispatchPolicy,
  normalizeDispatchPreflight,
  normalizeDispatchRun,
  normalizeLearnEvalOverlay,
} from './normalizers.mjs';

export function collectExecutorDetails(jobs = []) {
  const usedExecutorIds = new Set(
    jobs.map((job) => String(job?.launchSpec?.executor || '').trim()).filter(Boolean)
  );

  return listLocalDispatchExecutors().filter((executor) => usedExecutorIds.has(executor.id));
}

export function listPhaseExecutorIds() {
  return listLocalDispatchExecutors()
    .filter((executor) => Array.isArray(executor.jobTypes) && executor.jobTypes.includes('phase'))
    .map((executor) => executor.id);
}

export function resolvePhaseExecutorSelection(rawPhaseExecutor = '') {
  const requestedExecutor = normalizeText(rawPhaseExecutor) || null;
  const phaseExecutorIds = new Set(listPhaseExecutorIds());

  if (!requestedExecutor) {
    return {
      requested_executor: null,
      applied_executor: LOCAL_PHASE_EXECUTOR,
      reason: 'default_phase_executor',
      fallback_applied: false,
    };
  }

  if (phaseExecutorIds.has(requestedExecutor)) {
    return {
      requested_executor: requestedExecutor,
      applied_executor: requestedExecutor,
      reason: requestedExecutor === LOCAL_PHASE_EXECUTOR
        ? 'requested_default_phase_executor'
        : 'requested_phase_executor_override',
      fallback_applied: false,
    };
  }

  return {
    requested_executor: requestedExecutor,
    applied_executor: LOCAL_PHASE_EXECUTOR,
    reason: `unsupported_phase_executor:${requestedExecutor}`,
    fallback_applied: true,
  };
}

export function buildOrchestrationPlan({
  blueprint = 'feature',
  taskTitle = '',
  contextSummary = '',
  executionContext = null,
  workItems = null,
  learnEvalOverlay = null,
  dispatchPlan = null,
  dispatchRun = null,
  dispatchEvidence = null,
  dispatchPolicy = null,
  dispatchPreflight = null,
  effectiveDispatchPolicy = null,
  executorCapabilityManifest = null,
  readiness = null,
} = {}) {
  const resolved = getOrchestratorBlueprint(blueprint);
  const resolvedTaskTitle = String(taskTitle || '').trim() || 'Untitled task';
  const resolvedContextSummary = String(contextSummary || '').trim();
  const decomposedWorkItems = normalizeWorkItems(
    workItems,
    buildDecomposedWorkItems({
      taskTitle: resolvedTaskTitle,
      contextSummary: resolvedContextSummary,
    })
  );
  const runtimeExecutionContext = executionContext
    && typeof executionContext === 'object'
    && String(executionContext.text || '')
    ? { ...executionContext, text: String(executionContext.text) }
    : null;

  return {
    blueprint: resolved.name,
    description: resolved.description,
    taskTitle: resolvedTaskTitle,
    contextSummary: resolvedContextSummary,
    ...(runtimeExecutionContext ? { executionContext: runtimeExecutionContext } : {}),
    workItems: decomposedWorkItems,
    learnEvalOverlay: normalizeLearnEvalOverlay(learnEvalOverlay),
    dispatchPlan: normalizeDispatchPlan(dispatchPlan),
    dispatchRun: normalizeDispatchRun(dispatchRun),
    dispatchEvidence: normalizeDispatchEvidence(dispatchEvidence),
    dispatchPolicy: normalizeDispatchPolicy(dispatchPolicy),
    dispatchPreflight: normalizeDispatchPreflight(dispatchPreflight),
    effectiveDispatchPolicy: normalizeDispatchPolicy(effectiveDispatchPolicy),
    executorCapabilityManifest: normalizeExecutorCapabilityManifest(executorCapabilityManifest),
    readiness: readiness && typeof readiness === 'object' ? readiness : null,
    phases: resolved.phases.map((phase, index) => ({
      step: index + 1,
      id: phase.id,
      role: phase.role,
      mode: phase.mode,
      group: phase.group || null,
      label: phase.roleCard.label,
      responsibility: phase.roleCard.responsibility,
      ownership: phase.roleCard.ownership,
      canEditFiles: phase.canEditFiles === true,
      ownedPathPrefixes: Array.isArray(phase.ownedPathPrefixes) ? [...phase.ownedPathPrefixes] : [],
    })),
  };
}
