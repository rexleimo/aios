import { resolveModelRoutingForRole } from '../../model-router.mjs';
import { resolveAgentRefIdForRole } from '../orchestrator-agents.mjs';
import { LOCAL_MERGE_GATE_EXECUTOR, LOCAL_PHASE_EXECUTOR } from '../orchestrator-executors.mjs';
import { MERGE_GATE_BLOCK_STATUSES, MERGE_GATE_CONFLICT_RULE } from './blueprints.mjs';
import { hasWildcardOwnedPrefix, normalizeOwnedPathPrefixes, normalizeText } from './shared.mjs';
import { normalizeOwnedPathHints, normalizeWorkItems } from './work-items.mjs';

// 纯函数集合：负责 local dispatch job 构造和路径归属校验。
export function createPhaseJob(
  plan,
  phase,
  dependsOn = [],
  handoffTarget = 'next-phase',
  modeOverride = null,
  phaseExecutor = LOCAL_PHASE_EXECUTOR,
  env = process.env
) {
  const contextSources = ['orchestration-plan'];
  if (plan?.executionContext?.text) {
    contextSources.push('execution-context-delivery');
  }
  if (plan.learnEvalOverlay) {
    contextSources.push('learn-eval-overlay');
  }
  const workItemRefs = Array.isArray(plan?.workItems)
    ? plan.workItems.map((item) => normalizeText(item?.itemId)).filter(Boolean)
    : [];
  const ownedPathPrefixes = resolveOwnedPathPrefixesForWorkItemRefs(plan, phase, workItemRefs);

  const mode = modeOverride || phase.mode;
  const agentRefId = resolveAgentRefIdForRole(phase.role) || String(phase.role || '').trim();
  const modelRouting = resolveModelRoutingForRole({
    role: phase.role,
    taskDescription: `${phase.label}: ${phase.responsibility} ${phase.ownership}`,
    env,
  });

  return {
    jobId: `phase.${phase.id}`,
    jobType: 'phase',
    step: phase.step,
    phaseId: phase.id,
    role: phase.role,
    label: phase.label,
    mode,
    group: mode === 'parallel' ? phase.group : null,
    dependsOn: [...dependsOn],
    status: 'pending',
    outputs: ['handoff'],
    launchSpec: {
      executor: phaseExecutor,
      requiresModel: true,
      modelRouting,
      agentRefId,
      inputs: contextSources,
      outputType: 'handoff',
      handoffTarget,
      workItemRefs,
      canEditFiles: phase.canEditFiles === true,
      ownedPathPrefixes,
      promptSeed: `${phase.label}: ${phase.responsibility} Ownership: ${phase.ownership}`,
    },
  };
}

export function resolveOwnedPathPrefixesForWorkItemRefs(plan, phase, workItemRefs = []) {
  const fallbackOwnedPrefixes = normalizeOwnedPathPrefixes(phase?.ownedPathPrefixes);
  if (phase?.canEditFiles !== true) {
    return fallbackOwnedPrefixes;
  }

  const refs = Array.isArray(workItemRefs)
    ? workItemRefs.map((item) => normalizeText(item)).filter(Boolean)
    : [];
  if (refs.length === 0) {
    return fallbackOwnedPrefixes;
  }

  const workItemMap = new Map(
    normalizeWorkItems(plan?.workItems).map((item) => [normalizeText(item?.itemId), item])
  );
  const hints = [];
  for (const ref of refs) {
    const item = workItemMap.get(ref);
    if (!item) {
      continue;
    }
    hints.push(...normalizeOwnedPathHints(item.ownedPathHints));
  }

  const resolvedHints = normalizeOwnedPathPrefixes(hints);
  if (resolvedHints.length > 0) {
    return resolvedHints;
  }
  return fallbackOwnedPrefixes;
}

export function normalizeJobIdSegment(value = '') {
  const normalized = normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'item';
}

export function createPhaseJobWithOverrides(
  plan,
  phase,
  {
    dependsOn = [],
    handoffTarget = 'next-phase',
    modeOverride = null,
    phaseExecutor = LOCAL_PHASE_EXECUTOR,
    jobIdOverride = '',
    workItemRefsOverride = null,
    workItemId = '',
    env = process.env,
  } = {}
) {
  const base = createPhaseJob(plan, phase, dependsOn, handoffTarget, modeOverride, phaseExecutor, env);
  const resolvedRefs = Array.isArray(workItemRefsOverride)
    ? workItemRefsOverride.map((item) => normalizeText(item)).filter(Boolean)
    : base.launchSpec.workItemRefs;
  const resolvedOwnedPrefixes = resolveOwnedPathPrefixesForWorkItemRefs(plan, phase, resolvedRefs);
  return {
    ...base,
    jobId: normalizeText(jobIdOverride) || base.jobId,
    launchSpec: {
      ...base.launchSpec,
      workItemRefs: resolvedRefs,
      ownedPathPrefixes: resolvedOwnedPrefixes,
      ...(normalizeText(workItemId) ? { workItemId: normalizeText(workItemId) } : {}),
    },
  };
}

export function createMergeGateJob(groupName, dependsOn = []) {
  return {
    jobId: `merge.${groupName}`,
    jobType: 'merge-gate',
    step: null,
    phaseId: null,
    role: 'merge-gate',
    label: 'Merge Gate',
    mode: 'sequential',
    group: groupName,
    dependsOn: [...dependsOn],
    status: 'pending',
    outputs: ['merged-handoff'],
    launchSpec: {
      executor: LOCAL_MERGE_GATE_EXECUTOR,
      requiresModel: false,
      inputs: ['parallel-handoffs'],
      outputType: 'merged-handoff',
      promptSeed: 'Validate handoff statuses and overlapping file ownership before merge.',
      blockStatuses: [...MERGE_GATE_BLOCK_STATUSES],
      conflictRule: MERGE_GATE_CONFLICT_RULE,
    },
  };
}

export function getDispatchParallelism(plan) {
  return plan?.dispatchPolicy?.parallelism === 'serial-only'
    ? 'serial-only'
    : 'parallel-with-merge-gate';
}

export function assertEditableParallelOwnership(plan) {
  for (const phase of Array.isArray(plan?.phases) ? plan.phases : []) {
    if (phase?.mode !== 'parallel' || phase?.canEditFiles !== true) {
      continue;
    }
    const ownedPathPrefixes = normalizeOwnedPathPrefixes(phase?.ownedPathPrefixes);
    if (ownedPathPrefixes.length === 0 || hasWildcardOwnedPrefix(ownedPathPrefixes)) {
      throw new Error(
        `Parallel editable phase "${String(phase?.id || '').trim() || 'unknown'}" requires explicit ownedPathPrefixes (wildcard \"\" is not allowed).`
      );
    }
  }
}

export function resolveWorkItemsForPhase(plan, phase) {
  if (!phase?.canEditFiles) {
    return [];
  }
  return normalizeWorkItems(plan?.workItems);
}

export function buildBoundedWorkItemQueue({
  phase,
  items = [],
  upstreamJobIds = [],
  maxParallel = 2,
} = {}) {
  const boundedParallel = Number.isFinite(maxParallel) ? Math.max(1, Math.floor(maxParallel)) : 2;
  const jobIdsByItemId = new Map();
  const expanded = [];
  const entries = [];

  for (const [index, item] of items.entries()) {
    const itemId = normalizeText(item?.itemId) || `wi.${index + 1}`;
    const suffix = normalizeJobIdSegment(itemId);
    const jobId = `phase.${phase.id}.${suffix}`;

    const deps = [];
    if (index < boundedParallel) {
      deps.push(...upstreamJobIds);
    } else if (expanded[index - boundedParallel]) {
      deps.push(expanded[index - boundedParallel].jobId);
    } else {
      deps.push(...upstreamJobIds);
    }

    for (const depItemId of Array.isArray(item.dependsOn) ? item.dependsOn : []) {
      const depJobId = jobIdsByItemId.get(depItemId);
      if (depJobId) {
        deps.push(depJobId);
      }
    }

    const uniqueDeps = [...new Set(deps.filter(Boolean))];
    expanded.push({
      itemId,
      jobId,
      dependsOn: uniqueDeps,
      item,
    });
    jobIdsByItemId.set(itemId, jobId);
    entries.push({
      queueId: `${phase.id}.${itemId}`,
      phaseId: phase.id,
      role: phase.role,
      itemId,
      jobId,
      dependsOn: uniqueDeps,
      status: 'queued',
    });
  }

  return {
    maxParallel: boundedParallel,
    expanded,
    entries,
  };
}
