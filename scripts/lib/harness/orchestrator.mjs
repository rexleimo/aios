import { normalizeHandoffPayload, validateHandoffPayload } from './handoff.mjs';
import { resolveModelRoutingForRole } from '../model-router.mjs';
import { resolveAgentRefIdForRole } from './orchestrator-agents.mjs';
import {
  LOCAL_CONTROL_EXECUTOR,
  LOCAL_MERGE_GATE_EXECUTOR,
  LOCAL_PHASE_EXECUTOR,
  createLocalDispatchExecutorRegistry,
  listLocalDispatchExecutors,
  resolveLocalDispatchExecutor,
} from './orchestrator-executors.mjs';
import blueprintSpec from '../specs/orchestrator-blueprints.json' with { type: 'json' };

export const ORCHESTRATOR_ROLE_IDS = ['planner', 'implementer', 'reviewer', 'security-reviewer'];
export const ORCHESTRATOR_BLUEPRINT_NAMES = ['feature', 'bugfix', 'refactor', 'security'];
export const ORCHESTRATOR_FORMATS = ['text', 'json'];
export const RL_ORCHESTRATOR_DECISION_TYPES = ['dispatch', 'retry', 'stop', 'handoff', 'preflight'];
const DEFAULT_WORK_ITEM_LIMIT = 4;
const EXECUTOR_CAPABILITY_LEVELS = new Set(['yes', 'no', 'unknown']);
const EXECUTOR_CAPABILITY_KEYS = ['read', 'write', 'network', 'browser', 'sideEffect'];
const WORK_ITEM_TYPE_PATTERNS = Object.freeze([
  { type: 'auth', pattern: /\b(auth|authentication|authorize|authorization|login|oauth|token|credential|secret)\b/i },
  { type: 'payment', pattern: /\b(payment|billing|invoice|charge|refund|payout|stripe|paypal|card)\b/i },
  { type: 'security', pattern: /\b(security|vulnerability|xss|csrf|injection|permissions|policy|compliance|privacy)\b/i },
  { type: 'testing', pattern: /\b(test|testing|qa|verification|assert|regression)\b/i },
  { type: 'docs', pattern: /\b(doc|docs|documentation|readme|runbook|guide)\b/i },
  { type: 'refactor', pattern: /\b(refactor|cleanup|rename|extract|decompose|modularize)\b/i },
]);
const WORK_ITEM_OWNERSHIP_HINT_PATTERNS = Object.freeze([
  { pattern: /\bdocs?\b|\breadme\b|\brunbook\b|\bguide\b/i, hints: ['docs/'] },
  { pattern: /\btest|testing|qa|verification|assert|regression\b/i, hints: ['scripts/tests/'] },
  { pattern: /\bmcp-server\b/i, hints: ['mcp-server/src/'] },
  { pattern: /\bspec|schema\b/i, hints: ['scripts/lib/specs/'] },
]);
export { LOCAL_PHASE_EXECUTOR, LOCAL_CONTROL_EXECUTOR, LOCAL_MERGE_GATE_EXECUTOR } from './orchestrator-executors.mjs';
export const MERGE_GATE_BLOCK_STATUSES = normalizeMergeGateBlockStatuses(blueprintSpec?.mergeGate?.blockStatuses);
export const MERGE_GATE_CONFLICT_RULE = normalizeText(blueprintSpec?.mergeGate?.conflictRule)
  || 'overlapping file ownership blocks parallel merge';

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeExecutorCapabilityLevel(value, fallback = 'unknown') {
  const normalized = normalizeText(value).toLowerCase();
  return EXECUTOR_CAPABILITY_LEVELS.has(normalized) ? normalized : fallback;
}

function normalizeExecutorCapabilities(raw = null) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    read: normalizeExecutorCapabilityLevel(source.read, 'unknown'),
    write: normalizeExecutorCapabilityLevel(source.write, 'unknown'),
    network: normalizeExecutorCapabilityLevel(source.network, 'unknown'),
    browser: normalizeExecutorCapabilityLevel(source.browser, 'unknown'),
    sideEffect: normalizeExecutorCapabilityLevel(source.sideEffect, 'unknown'),
  };
}

function aggregateExecutorCapabilityLevels(levels = []) {
  const normalizedLevels = Array.isArray(levels)
    ? levels.map((level) => normalizeExecutorCapabilityLevel(level, 'unknown'))
    : [];
  if (normalizedLevels.some((level) => level === 'yes')) return 'yes';
  if (normalizedLevels.some((level) => level === 'unknown')) return 'unknown';
  return 'no';
}

function normalizeExecutorCapabilityManifest(rawManifest = null) {
  if (!rawManifest || typeof rawManifest !== 'object') {
    return null;
  }

  const executors = Array.isArray(rawManifest.executors)
    ? rawManifest.executors
      .map((entry) => {
        const id = normalizeText(entry?.id);
        if (!id) return null;
        const notes = Array.isArray(entry?.notes)
          ? entry.notes.map((item) => normalizeText(item)).filter(Boolean)
          : [];
        return {
          id,
          label: normalizeText(entry?.label) || id,
          jobCount: Number.isFinite(entry?.jobCount) ? Math.max(0, Math.floor(entry.jobCount)) : 0,
          capabilities: normalizeExecutorCapabilities(entry?.capabilities),
          notes,
        };
      })
      .filter(Boolean)
    : [];

  const fallbackSummary = normalizeExecutorCapabilities(rawManifest.summary);
  const summary = executors.length > 0
    ? {
      read: aggregateExecutorCapabilityLevels(executors.map((entry) => entry.capabilities.read)),
      write: aggregateExecutorCapabilityLevels(executors.map((entry) => entry.capabilities.write)),
      network: aggregateExecutorCapabilityLevels(executors.map((entry) => entry.capabilities.network)),
      browser: aggregateExecutorCapabilityLevels(executors.map((entry) => entry.capabilities.browser)),
      sideEffect: aggregateExecutorCapabilityLevels(executors.map((entry) => entry.capabilities.sideEffect)),
    }
    : fallbackSummary;

  return {
    schemaVersion: Number.isFinite(rawManifest.schemaVersion) ? Math.max(1, Math.floor(rawManifest.schemaVersion)) : 1,
    generatedAt: normalizeText(rawManifest.generatedAt),
    executionMode: normalizeText(rawManifest.executionMode) || 'none',
    runtimeId: normalizeText(rawManifest.runtimeId),
    summary,
    executors,
  };
}

function normalizeOwnedPathPrefixes(raw = null) {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map((item) => normalizeText(item))
    .filter((item) => item.length > 0 || item === '');
}

function hasWildcardOwnedPrefix(prefixes = []) {
  return Array.isArray(prefixes) && prefixes.some((prefix) => prefix === '');
}

function normalizeMergeGateBlockStatuses(raw) {
  const fallback = ['blocked', 'needs-input'];
  if (!Array.isArray(raw)) {
    return fallback;
  }
  const values = raw.map((item) => normalizeText(item)).filter(Boolean);
  return values.length > 0 ? values : fallback;
}

function titleCase(value = '') {
  return String(value)
    .split(/[\s_-]+/)
    .map((part) => part ? part[0].toUpperCase() + part.slice(1) : '')
    .filter(Boolean)
    .join(' ');
}

function normalizeRoleLabel(roleId) {
  return titleCase(String(roleId || '').trim());
}

function normalizeRoleCards(rawRoles = {}) {
  if (!rawRoles || typeof rawRoles !== 'object') {
    throw new Error('Invalid orchestrator-blueprints spec: roles missing');
  }

  const roleCards = {};
  for (const roleId of ORCHESTRATOR_ROLE_IDS) {
    const entry = rawRoles[roleId];
    const responsibility = normalizeText(entry?.responsibility);
    const ownership = normalizeText(entry?.ownership);
    if (!responsibility) {
      throw new Error(`Invalid orchestrator-blueprints spec: roles.${roleId}.responsibility missing`);
    }
    if (!ownership) {
      throw new Error(`Invalid orchestrator-blueprints spec: roles.${roleId}.ownership missing`);
    }

    const canEditFiles = entry?.canEditFiles === true;
    const ownedPathPrefixes = normalizeOwnedPathPrefixes(entry?.ownedPathPrefixes);
    if (canEditFiles && hasWildcardOwnedPrefix(ownedPathPrefixes)) {
      throw new Error(`Invalid orchestrator-blueprints spec: roles.${roleId}.ownedPathPrefixes cannot include wildcard \"\" for editable roles`);
    }

    roleCards[roleId] = {
      id: roleId,
      label: normalizeRoleLabel(roleId),
      responsibility,
      ownership,
      canEditFiles,
      ownedPathPrefixes,
    };
  }

  return roleCards;
}

function normalizePhaseMode(rawMode) {
  const value = normalizeText(rawMode).toLowerCase();
  return value === 'parallel' ? 'parallel' : 'sequential';
}

function normalizeBlueprintPhase(rawPhase, index, blueprintName) {
  if (!rawPhase || typeof rawPhase !== 'object') {
    throw new Error(`Invalid orchestrator-blueprints spec: blueprints.${blueprintName}.phases[${index}] missing`);
  }

  const id = normalizeText(rawPhase.id) || `phase-${index + 1}`;
  const role = normalizeText(rawPhase.role);
  const mode = normalizePhaseMode(rawPhase.mode);
  const group = normalizeText(rawPhase.group);
  const hasCanEditFiles = Object.prototype.hasOwnProperty.call(rawPhase, 'canEditFiles');
  const canEditFiles = hasCanEditFiles ? rawPhase.canEditFiles === true : null;
  const hasOwnedPathPrefixes = Object.prototype.hasOwnProperty.call(rawPhase, 'ownedPathPrefixes');
  const ownedPathPrefixes = hasOwnedPathPrefixes
    ? normalizeOwnedPathPrefixes(rawPhase.ownedPathPrefixes)
    : null;

  if (!role) {
    throw new Error(`Invalid orchestrator-blueprints spec: blueprints.${blueprintName}.phases[${index}].role missing`);
  }
  if (!ORCHESTRATOR_ROLE_IDS.includes(role)) {
    throw new Error(`Invalid orchestrator-blueprints spec: blueprints.${blueprintName}.phases[${index}].role unknown (${role})`);
  }
  if (mode === 'parallel' && !group) {
    throw new Error(`Invalid orchestrator-blueprints spec: blueprints.${blueprintName}.phases[${index}].group required for parallel phases`);
  }
  if (canEditFiles === true && hasWildcardOwnedPrefix(ownedPathPrefixes || [])) {
    throw new Error(`Invalid orchestrator-blueprints spec: blueprints.${blueprintName}.phases[${index}].ownedPathPrefixes cannot include wildcard \"\" for editable phases`);
  }

  return {
    id,
    role,
    mode,
    ...(group ? { group } : {}),
    ...(hasCanEditFiles ? { canEditFiles } : {}),
    ...(hasOwnedPathPrefixes ? { ownedPathPrefixes } : {}),
  };
}

function normalizeOrchestratorBlueprints(rawBlueprints = {}) {
  if (!rawBlueprints || typeof rawBlueprints !== 'object') {
    throw new Error('Invalid orchestrator-blueprints spec: blueprints missing');
  }

  const blueprints = {};
  for (const blueprintName of ORCHESTRATOR_BLUEPRINT_NAMES) {
    const rawBlueprint = rawBlueprints[blueprintName];
    if (!rawBlueprint || typeof rawBlueprint !== 'object') {
      throw new Error(`Invalid orchestrator-blueprints spec: blueprints.${blueprintName} missing`);
    }

    const description = normalizeText(rawBlueprint.description);
    const phasesRaw = Array.isArray(rawBlueprint.phases) ? rawBlueprint.phases : null;
    if (!description) {
      throw new Error(`Invalid orchestrator-blueprints spec: blueprints.${blueprintName}.description missing`);
    }
    if (!phasesRaw || phasesRaw.length === 0) {
      throw new Error(`Invalid orchestrator-blueprints spec: blueprints.${blueprintName}.phases missing`);
    }

    const phases = phasesRaw.map((phase, index) => normalizeBlueprintPhase(phase, index, blueprintName));
    const ids = new Set();
    for (const phase of phases) {
      if (ids.has(phase.id)) {
        throw new Error(`Invalid orchestrator-blueprints spec: blueprints.${blueprintName} has duplicate phase id (${phase.id})`);
      }
      ids.add(phase.id);
    }

    blueprints[blueprintName] = {
      name: blueprintName,
      description,
      phases,
    };
  }

  return blueprints;
}

export const ROLE_CARDS = normalizeRoleCards(blueprintSpec?.roles);

export const ORCHESTRATOR_BLUEPRINTS = {
  ...normalizeOrchestratorBlueprints(blueprintSpec?.blueprints),
};

export function normalizeOrchestratorBlueprint(raw = 'feature') {
  const value = String(raw || 'feature').trim().toLowerCase();
  if (!ORCHESTRATOR_BLUEPRINT_NAMES.includes(value)) {
    throw new Error(`orchestrate blueprint must be one of: ${ORCHESTRATOR_BLUEPRINT_NAMES.join(', ')}`);
  }
  return value;
}

export function normalizeOrchestratorFormat(raw = 'text') {
  const value = String(raw || 'text').trim().toLowerCase();
  if (!ORCHESTRATOR_FORMATS.includes(value)) {
    throw new Error(`--format must be one of: ${ORCHESTRATOR_FORMATS.join(', ')}`);
  }
  return value;
}

export function getRoleCard(roleId) {
  const role = ROLE_CARDS[String(roleId || '').trim().toLowerCase()];
  if (!role) {
    throw new Error(`Unknown orchestrator role: ${roleId}`);
  }
  return role;
}

export function getOrchestratorBlueprint(name = 'feature') {
  const blueprint = ORCHESTRATOR_BLUEPRINTS[normalizeOrchestratorBlueprint(name)];
  return {
    ...blueprint,
    phases: blueprint.phases.map((phase) => {
      const roleCard = getRoleCard(phase.role);
      const canEditFiles = typeof phase.canEditFiles === 'boolean'
        ? phase.canEditFiles
        : roleCard.canEditFiles === true;
      const ownedPathPrefixes = Array.isArray(phase.ownedPathPrefixes)
        ? [...phase.ownedPathPrefixes]
        : Array.isArray(roleCard.ownedPathPrefixes)
          ? [...roleCard.ownedPathPrefixes]
          : [];
      return {
        ...phase,
        roleCard,
        canEditFiles,
        ownedPathPrefixes,
      };
    }),
  };
}

function normalizeLearnEvalOverlay(rawOverlay) {
  if (!rawOverlay || typeof rawOverlay !== 'object') {
    return null;
  }

  const appliedRecommendations = Array.isArray(rawOverlay.appliedRecommendations)
    ? rawOverlay.appliedRecommendations.map((item) => ({ ...item }))
    : [];

  return {
    sourceSessionId: String(rawOverlay.sourceSessionId || '').trim(),
    sourceGoal: String(rawOverlay.sourceGoal || '').trim(),
    selectedRecommendationId: rawOverlay.selectedRecommendationId ? String(rawOverlay.selectedRecommendationId).trim() : null,
    appliedRecommendationIds: Array.isArray(rawOverlay.appliedRecommendationIds)
      ? rawOverlay.appliedRecommendationIds.map((item) => String(item))
      : appliedRecommendations.map((item) => item.targetId),
    appliedRecommendations,
  };
}

function normalizeDispatchPlan(rawPlan) {
  if (!rawPlan || typeof rawPlan !== 'object') {
    return null;
  }

  return {
    ...rawPlan,
    workItems: normalizeWorkItems(rawPlan.workItems),
    workItemQueue: rawPlan.workItemQueue && typeof rawPlan.workItemQueue === 'object'
      ? {
        enabled: rawPlan.workItemQueue.enabled === true,
        maxParallel: Number.isFinite(rawPlan.workItemQueue.maxParallel)
          ? Math.max(1, Math.floor(rawPlan.workItemQueue.maxParallel))
          : 1,
        entries: Array.isArray(rawPlan.workItemQueue.entries)
          ? rawPlan.workItemQueue.entries.map((entry) => ({
            queueId: normalizeText(entry?.queueId),
            phaseId: normalizeText(entry?.phaseId),
            role: normalizeText(entry?.role),
            itemId: normalizeText(entry?.itemId),
            jobId: normalizeText(entry?.jobId),
            dependsOn: Array.isArray(entry?.dependsOn)
              ? entry.dependsOn.map((item) => normalizeText(item)).filter(Boolean)
              : [],
            status: normalizeText(entry?.status) || 'queued',
          }))
          : [],
      }
      : {
        enabled: false,
        maxParallel: 1,
        entries: [],
      },
    notes: Array.isArray(rawPlan.notes) ? [...rawPlan.notes] : [],
    executorRegistry: Array.isArray(rawPlan.executorRegistry) ? [...rawPlan.executorRegistry] : [],
    executorDetails: Array.isArray(rawPlan.executorDetails)
      ? rawPlan.executorDetails.map((item) => ({
        ...item,
        executionModes: Array.isArray(item.executionModes) ? [...item.executionModes] : [],
        jobTypes: Array.isArray(item.jobTypes) ? [...item.jobTypes] : [],
        supportedRoles: Array.isArray(item.supportedRoles) ? [...item.supportedRoles] : [],
        outputTypes: Array.isArray(item.outputTypes) ? [...item.outputTypes] : [],
      }))
      : [],
    jobs: Array.isArray(rawPlan.jobs)
      ? rawPlan.jobs.map((job) => ({
        ...job,
        dependsOn: Array.isArray(job.dependsOn) ? [...job.dependsOn] : [],
        outputs: Array.isArray(job.outputs) ? [...job.outputs] : [],
        launchSpec: job.launchSpec
          ? {
            ...job.launchSpec,
            workItemRefs: Array.isArray(job.launchSpec.workItemRefs)
              ? job.launchSpec.workItemRefs.map((item) => normalizeText(item)).filter(Boolean)
              : [],
          }
          : {},
      }))
      : [],
  };
}

function normalizeDispatchRuntime(rawRuntime) {
  if (!rawRuntime || typeof rawRuntime !== 'object') {
    return null;
  }

  return {
    id: String(rawRuntime.id || '').trim(),
    manifestVersion: Number.isFinite(rawRuntime.manifestVersion) ? rawRuntime.manifestVersion : null,
    label: String(rawRuntime.label || '').trim(),
    description: String(rawRuntime.description || '').trim(),
    requiresModel: rawRuntime.requiresModel === true,
    executionMode: rawRuntime.executionMode ? String(rawRuntime.executionMode) : null,
  };
}

function normalizeDispatchRun(rawRun) {
  if (!rawRun || typeof rawRun !== 'object') {
    return null;
  }

  return {
    ...rawRun,
    runtime: normalizeDispatchRuntime(rawRun.runtime),
    executorRegistry: Array.isArray(rawRun.executorRegistry) ? [...rawRun.executorRegistry] : [],
    executorDetails: Array.isArray(rawRun.executorDetails)
      ? rawRun.executorDetails.map((item) => ({
        ...item,
        executionModes: Array.isArray(item.executionModes) ? [...item.executionModes] : [],
        jobTypes: Array.isArray(item.jobTypes) ? [...item.jobTypes] : [],
        supportedRoles: Array.isArray(item.supportedRoles) ? [...item.supportedRoles] : [],
        outputTypes: Array.isArray(item.outputTypes) ? [...item.outputTypes] : [],
      }))
      : [],
    finalOutputs: Array.isArray(rawRun.finalOutputs) ? rawRun.finalOutputs.map((item) => ({ ...item })) : [],
    jobRuns: Array.isArray(rawRun.jobRuns)
      ? rawRun.jobRuns.map((jobRun) => ({
        ...jobRun,
        dependsOn: Array.isArray(jobRun.dependsOn) ? [...jobRun.dependsOn] : [],
        inputSummary: jobRun.inputSummary ? { ...jobRun.inputSummary } : {},
        output: jobRun.output ? { ...jobRun.output } : null,
      }))
      : [],
  };
}

function normalizeDispatchEvidence(rawEvidence) {
  if (!rawEvidence || typeof rawEvidence !== 'object') {
    return null;
  }

  return {
    ...rawEvidence,
    persisted: rawEvidence.persisted === true,
    mode: rawEvidence.mode ? String(rawEvidence.mode) : null,
    reason: rawEvidence.reason ? String(rawEvidence.reason) : null,
    artifactPath: rawEvidence.artifactPath ? String(rawEvidence.artifactPath) : null,
    eventKind: rawEvidence.eventKind ? String(rawEvidence.eventKind) : null,
    eventId: rawEvidence.eventId ? String(rawEvidence.eventId) : null,
    checkpointId: rawEvidence.checkpointId ? String(rawEvidence.checkpointId) : null,
    checkpointStatus: rawEvidence.checkpointStatus ? String(rawEvidence.checkpointStatus) : null,
    error: rawEvidence.error ? String(rawEvidence.error) : null,
  };
}

function normalizeDispatchPolicy(rawPolicy) {
  if (!rawPolicy || typeof rawPolicy !== 'object') {
    return null;
  }

  return {
    status: rawPolicy.status ? String(rawPolicy.status) : 'caution',
    parallelism: rawPolicy.parallelism ? String(rawPolicy.parallelism) : 'parallel-with-merge-gate',
    blockerIds: Array.isArray(rawPolicy.blockerIds) ? rawPolicy.blockerIds.map((item) => String(item)) : [],
    advisoryIds: Array.isArray(rawPolicy.advisoryIds) ? rawPolicy.advisoryIds.map((item) => String(item)) : [],
    requiredActions: Array.isArray(rawPolicy.requiredActions)
      ? rawPolicy.requiredActions.map((item) => ({
        type: item?.type ? String(item.type) : 'command',
        action: String(item?.action || ''),
        sourceId: item?.sourceId ? String(item.sourceId) : null,
      }))
      : [],
    executorPreferences: Array.isArray(rawPolicy.executorPreferences)
      ? rawPolicy.executorPreferences.map((item) => ({
        executor: String(item?.executor || ''),
        confidence: item?.confidence ? String(item.confidence) : 'planned',
        observedCount: Number.isFinite(item?.observedCount) ? item.observedCount : 0,
        source: item?.source ? String(item.source) : 'dispatch-plan',
      }))
      : [],
    notes: Array.isArray(rawPolicy.notes) ? rawPolicy.notes.map((item) => String(item)) : [],
  };
}

function normalizeDispatchPreflight(rawPreflight) {
  if (!rawPreflight || typeof rawPreflight !== 'object') {
    return null;
  }

  return {
    mode: rawPreflight.mode ? String(rawPreflight.mode) : 'none',
    results: Array.isArray(rawPreflight.results)
      ? rawPreflight.results.map((item) => ({
        type: item?.type ? String(item.type) : 'command',
        sourceId: item?.sourceId ? String(item.sourceId) : null,
        action: String(item?.action || ''),
        status: item?.status ? String(item.status) : 'skipped',
        runner: item?.runner ? String(item.runner) : 'unsupported',
        summary: item?.summary ? String(item.summary) : '',
        exitCode: Number.isFinite(item?.exitCode) ? item.exitCode : null,
      }))
      : [],
  };
}

function normalizePathHint(value) {
  return normalizeText(value)
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '');
}

function normalizeOwnedPathHints(rawHints = []) {
  if (!Array.isArray(rawHints)) {
    return [];
  }

  const hints = [];
  const seen = new Set();
  for (const rawHint of rawHints) {
    let candidate = normalizeText(rawHint)
      .replace(/^[`"'([{<]+/, '')
      .replace(/[`"')\]}>.,;:!?]+$/, '');
    if (!candidate || /^[a-z]+:\/\//i.test(candidate)) {
      continue;
    }
    const normalized = normalizePathHint(candidate);
    if (!normalized || normalized.startsWith('../') || normalized.startsWith('~/') || /^[a-z]:\//i.test(normalized)) {
      continue;
    }
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    hints.push(normalized);
  }
  return hints;
}

function extractOwnedPathHintsFromSummary(summary = '') {
  const tokens = normalizeText(summary).split(/\s+/).filter(Boolean);
  const rawHints = [];
  for (const token of tokens) {
    if (!/[\\/]/.test(token)) {
      continue;
    }
    rawHints.push(token);
  }
  return normalizeOwnedPathHints(rawHints);
}

function inferOwnedPathHints(summary = '', type = 'general') {
  const explicitHints = extractOwnedPathHintsFromSummary(summary);
  if (explicitHints.length > 0) {
    return explicitHints;
  }

  const hints = [];
  const typeLabel = normalizeText(type).toLowerCase();
  if (typeLabel === 'docs') {
    hints.push('docs/');
  } else if (typeLabel === 'testing') {
    hints.push('scripts/tests/');
  }
  for (const entry of WORK_ITEM_OWNERSHIP_HINT_PATTERNS) {
    if (entry.pattern.test(summary)) {
      hints.push(...entry.hints);
    }
  }

  return normalizeOwnedPathHints(hints);
}

function inferWorkItemType(text = '') {
  const sample = normalizeText(text);
  if (!sample) {
    return 'general';
  }
  for (const entry of WORK_ITEM_TYPE_PATTERNS) {
    if (entry.pattern.test(sample)) {
      return entry.type;
    }
  }
  return 'general';
}

function normalizeWorkItem(rawItem = {}, index = 0) {
  const fallbackId = `wi.${index + 1}`;
  const itemId = normalizeText(rawItem.itemId) || fallbackId;
  const summary = normalizeText(rawItem.summary) || normalizeText(rawItem.title) || `Work item ${index + 1}`;
  const typeSeed = `${normalizeText(rawItem.type)} ${summary}`.trim();
  const type = inferWorkItemType(typeSeed);
  const title = normalizeText(rawItem.title)
    || (summary.length > 72 ? `${summary.slice(0, 71)}…` : summary);

  return {
    itemId,
    type,
    title,
    summary,
    source: normalizeText(rawItem.source) || 'decomposer-mvp',
    status: normalizeText(rawItem.status).toLowerCase() || 'queued',
    dependsOn: Array.isArray(rawItem.dependsOn)
      ? rawItem.dependsOn.map((item) => normalizeText(item)).filter(Boolean)
      : [],
    ownedPathHints: normalizeOwnedPathHints(rawItem.ownedPathHints),
  };
}

function normalizeWorkItems(rawItems = [], fallback = []) {
  const sourceItems = Array.isArray(rawItems) && rawItems.length > 0 ? rawItems : fallback;
  if (!Array.isArray(sourceItems) || sourceItems.length === 0) {
    return [];
  }

  const normalized = [];
  const seen = new Set();
  for (const [index, rawItem] of sourceItems.entries()) {
    const item = normalizeWorkItem(rawItem, index);
    if (!item.itemId) {
      continue;
    }
    let resolvedId = item.itemId;
    let suffix = 2;
    while (seen.has(resolvedId)) {
      resolvedId = `${item.itemId}-${suffix}`;
      suffix += 1;
    }
    seen.add(resolvedId);
    normalized.push({
      ...item,
      itemId: resolvedId,
      dependsOn: item.dependsOn.filter((depId) => depId !== resolvedId),
    });
  }

  return normalized;
}

function splitWorkItemCandidates(contextSummary = '') {
  const raw = String(contextSummary || '').replace(/\r/g, '\n');
  const lines = raw.split('\n').map((line) => line.trim()).filter(Boolean);
  const candidates = [];

  for (const line of lines) {
    const bulletMatch = /^[-*+]\s+(.+)$/.exec(line) || /^\d+[.)]\s+(.+)$/.exec(line);
    const normalizedLine = bulletMatch ? bulletMatch[1].trim() : line;
    const segments = normalizedLine.split(/[;；]+/).map((segment) => normalizeText(segment)).filter(Boolean);
    candidates.push(...segments);
  }

  return candidates;
}

function buildWorkItemFallback(taskTitle = '', contextSummary = '') {
  const summary = normalizeText(taskTitle) || normalizeText(contextSummary) || 'Deliver the orchestration task safely.';
  const type = inferWorkItemType(summary);
  return [{
    itemId: 'wi.1',
    title: summary.length > 72 ? `${summary.slice(0, 71)}…` : summary,
    summary,
    type,
    source: 'task-fallback',
    status: 'queued',
    dependsOn: [],
    ownedPathHints: inferOwnedPathHints(summary, type),
  }];
}

export function buildDecomposedWorkItems({ taskTitle = '', contextSummary = '', limit = DEFAULT_WORK_ITEM_LIMIT } = {}) {
  const maxItems = Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : DEFAULT_WORK_ITEM_LIMIT;
  const candidates = splitWorkItemCandidates(contextSummary);
  const deduped = [];
  const seen = new Set();

  for (const candidate of candidates) {
    const key = candidate.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(candidate);
    if (deduped.length >= maxItems) break;
  }

  if (deduped.length === 0) {
    return normalizeWorkItems([], buildWorkItemFallback(taskTitle, contextSummary));
  }

  const defaultHints = normalizeOwnedPathHints(['scripts/', 'mcp-server/']);
  const items = deduped.map((summary, index) => {
    const type = inferWorkItemType(summary);
    const hints = inferOwnedPathHints(summary, type);
    return {
      itemId: `wi.${index + 1}`,
      title: summary.length > 72 ? `${summary.slice(0, 71)}…` : summary,
      summary,
      type,
      source: 'planner-context',
      status: 'queued',
      dependsOn: [],
      ownedPathHints: hints.length > 0 ? hints : defaultHints,
    };
  });

  return normalizeWorkItems(items);
}

function collectExecutorDetails(jobs = []) {
  const usedExecutorIds = new Set(
    jobs.map((job) => String(job?.launchSpec?.executor || '').trim()).filter(Boolean)
  );

  return listLocalDispatchExecutors().filter((executor) => usedExecutorIds.has(executor.id));
}

function listPhaseExecutorIds() {
  return listLocalDispatchExecutors()
    .filter((executor) => Array.isArray(executor.jobTypes) && executor.jobTypes.includes('phase'))
    .map((executor) => executor.id);
}

function resolvePhaseExecutorSelection(rawPhaseExecutor = '') {
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

function deriveExecutorCapabilities({
  executorId = '',
  executionMode = 'none',
  jobCount = 0,
  hasEditableJobs = false,
} = {}) {
  const id = normalizeText(executorId);
  const mode = normalizeText(executionMode).toLowerCase() || 'none';
  const hasJobs = Number.isFinite(jobCount) ? Math.max(0, Math.floor(jobCount)) > 0 : false;

  if (!hasJobs) {
    return normalizeExecutorCapabilities({
      read: 'no',
      write: 'no',
      network: 'no',
      browser: 'no',
      sideEffect: 'no',
    });
  }

  if (id === LOCAL_MERGE_GATE_EXECUTOR) {
    return normalizeExecutorCapabilities({
      read: 'yes',
      write: 'no',
      network: 'no',
      browser: 'no',
      sideEffect: 'no',
    });
  }

  if (id === LOCAL_PHASE_EXECUTOR || id === LOCAL_CONTROL_EXECUTOR) {
    if (mode === 'live') {
      const writeLevel = hasEditableJobs ? 'yes' : 'no';
      return normalizeExecutorCapabilities({
        read: 'yes',
        write: writeLevel,
        network: 'unknown',
        browser: 'unknown',
        sideEffect: writeLevel === 'yes' ? 'yes' : 'unknown',
      });
    }

    return normalizeExecutorCapabilities({
      read: 'yes',
      write: 'no',
      network: 'no',
      browser: 'no',
      sideEffect: 'no',
    });
  }

  return normalizeExecutorCapabilities({
    read: mode === 'none' ? 'no' : 'unknown',
    write: mode === 'none' ? 'no' : 'unknown',
    network: mode === 'none' ? 'no' : 'unknown',
    browser: mode === 'none' ? 'no' : 'unknown',
    sideEffect: mode === 'none' ? 'no' : 'unknown',
  });
}

export function buildExecutorCapabilityManifest({
  dispatchPlan = null,
  executionMode = 'none',
  runtimeId = '',
} = {}) {
  const normalizedPlan = normalizeDispatchPlan(dispatchPlan);
  if (!normalizedPlan) return null;

  const jobs = Array.isArray(normalizedPlan.jobs) ? normalizedPlan.jobs : [];
  const executorRows = [];
  const executorDetails = Array.isArray(normalizedPlan.executorDetails) && normalizedPlan.executorDetails.length > 0
    ? normalizedPlan.executorDetails
    : (Array.isArray(normalizedPlan.executorRegistry)
      ? normalizedPlan.executorRegistry.map((id) => ({ id, label: id }))
      : []);

  const jobsByExecutor = new Map();
  for (const job of jobs) {
    const executorId = normalizeText(job?.launchSpec?.executor);
    if (!executorId) continue;
    const bucket = jobsByExecutor.get(executorId) || [];
    bucket.push(job);
    jobsByExecutor.set(executorId, bucket);
  }

  for (const entry of executorDetails) {
    const id = normalizeText(entry?.id);
    if (!id) continue;
    const matchedJobs = jobsByExecutor.get(id) || [];
    const jobCount = matchedJobs.length;
    const hasEditableJobs = matchedJobs.some((job) => job?.launchSpec?.canEditFiles === true);
    const capabilities = deriveExecutorCapabilities({
      executorId: id,
      executionMode,
      jobCount,
      hasEditableJobs,
    });
    const notes = [];
    const declaredModes = Array.isArray(entry?.executionModes) ? entry.executionModes.map((item) => normalizeText(item)).filter(Boolean) : [];
    if (executionMode === 'live' && (id === LOCAL_PHASE_EXECUTOR || id === LOCAL_CONTROL_EXECUTOR)) {
      notes.push('Live mode delegates phase execution to subagent-runtime; network/browser access depends on client tooling and prompt constraints.');
    }
    if (declaredModes.length > 0 && executionMode !== 'none' && !declaredModes.includes(executionMode)) {
      notes.push(`Declared executionModes=${declaredModes.join(',')} differ from requested mode=${executionMode}.`);
    }
    if (executionMode === 'dry-run') {
      notes.push('Dry-run mode is simulation-only and does not mutate workspace files.');
    }

    executorRows.push({
      id,
      label: normalizeText(entry?.label) || id,
      jobCount,
      capabilities,
      notes,
    });
  }

  const summary = normalizeExecutorCapabilities({
    read: aggregateExecutorCapabilityLevels(executorRows.map((entry) => entry.capabilities.read)),
    write: aggregateExecutorCapabilityLevels(executorRows.map((entry) => entry.capabilities.write)),
    network: aggregateExecutorCapabilityLevels(executorRows.map((entry) => entry.capabilities.network)),
    browser: aggregateExecutorCapabilityLevels(executorRows.map((entry) => entry.capabilities.browser)),
    sideEffect: aggregateExecutorCapabilityLevels(executorRows.map((entry) => entry.capabilities.sideEffect)),
  });

  return normalizeExecutorCapabilityManifest({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    executionMode: normalizeText(executionMode) || 'none',
    runtimeId: normalizeText(runtimeId),
    summary,
    executors: executorRows,
  });
}

export function buildOrchestrationPlan({
  blueprint = 'feature',
  taskTitle = '',
  contextSummary = '',
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

  return {
    blueprint: resolved.name,
    description: resolved.description,
    taskTitle: resolvedTaskTitle,
    contextSummary: resolvedContextSummary,
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

function createPhaseJob(
  plan,
  phase,
  dependsOn = [],
  handoffTarget = 'next-phase',
  modeOverride = null,
  phaseExecutor = LOCAL_PHASE_EXECUTOR,
  env = process.env
) {
  const contextSources = ['orchestration-plan'];
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

function resolveOwnedPathPrefixesForWorkItemRefs(plan, phase, workItemRefs = []) {
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

function normalizeJobIdSegment(value = '') {
  const normalized = normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'item';
}

function createPhaseJobWithOverrides(
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

function createMergeGateJob(groupName, dependsOn = []) {
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

function getDispatchParallelism(plan) {
  return plan?.dispatchPolicy?.parallelism === 'serial-only'
    ? 'serial-only'
    : 'parallel-with-merge-gate';
}

function assertEditableParallelOwnership(plan) {
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

function resolveWorkItemsForPhase(plan, phase) {
  if (!phase?.canEditFiles) {
    return [];
  }
  return normalizeWorkItems(plan?.workItems);
}

function buildBoundedWorkItemQueue({
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


export function createHandoffFromPhase(plan, phase, overrides = {}) {
  return normalizeHandoffPayload({
    fromRole: overrides.fromRole || phase.role,
    toRole: overrides.toRole || 'next-phase',
    taskTitle: plan.taskTitle,
    contextSummary: overrides.contextSummary || plan.contextSummary || phase.responsibility,
    findings: overrides.findings || [],
    filesTouched: overrides.filesTouched || [],
    openQuestions: overrides.openQuestions || [],
    recommendations: overrides.recommendations || [`Continue with ${phase.label.toLowerCase()}`],
    status: overrides.status || 'ready',
  });
}

export function mergeParallelHandoffs(handoffs = []) {
  const validated = handoffs.map((handoff) => {
    const result = validateHandoffPayload(handoff);
    if (!result.ok) {
      throw new Error(`Invalid handoff payload: ${result.errors.join('; ')}`);
    }
    return result.value;
  });

  const blocked = validated.filter((handoff) => handoff.status === 'blocked' || handoff.status === 'needs-input');
  const ownershipViolations = [];
  const fileOwners = new Map();
  const conflicts = [];

  const normalizeTouchedPath = (value) => normalizeText(value)
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '');

  const getRoleEditPolicy = (roleId) => {
    const key = normalizeText(roleId).toLowerCase();
    const card = ROLE_CARDS[key];
    return {
      canEditFiles: card?.canEditFiles === true,
      ownedPathPrefixes: Array.isArray(card?.ownedPathPrefixes) ? card.ownedPathPrefixes : [],
    };
  };

  const isAllowedByPrefixes = (filePath, prefixes = []) => {
    if (!Array.isArray(prefixes) || prefixes.length === 0) return false;
    if (prefixes.some((prefix) => prefix === '')) return true;
    return prefixes.some((prefix) => filePath.startsWith(prefix));
  };

  for (const handoff of validated) {
    const policy = getRoleEditPolicy(handoff.fromRole);
    for (const filePath of handoff.filesTouched) {
      const normalizedPath = normalizeTouchedPath(filePath);
      if (!normalizedPath) continue;

      if (!policy.canEditFiles) {
        ownershipViolations.push({ filePath: normalizedPath, fromRole: handoff.fromRole, rule: 'role is read-only' });
      } else if (!isAllowedByPrefixes(normalizedPath, policy.ownedPathPrefixes)) {
        ownershipViolations.push({
          filePath: normalizedPath,
          fromRole: handoff.fromRole,
          rule: `path not under owned prefixes (${policy.ownedPathPrefixes.join(', ') || 'none'})`,
        });
      }

      const previousOwner = fileOwners.get(normalizedPath);
      if (previousOwner && previousOwner !== handoff.fromRole) {
        conflicts.push({ filePath: normalizedPath, owners: [previousOwner, handoff.fromRole] });
        continue;
      }
      fileOwners.set(normalizedPath, handoff.fromRole);
    }
  }

  return {
    ok: blocked.length === 0 && conflicts.length === 0 && ownershipViolations.length === 0,
    blocked,
    ownershipViolations,
    conflicts,
    mergedFindings: validated.flatMap((handoff) => handoff.findings),
    mergedRecommendations: validated.flatMap((handoff) => handoff.recommendations),
    touchedFiles: [...fileOwners.keys()],
  };
}

function getPhaseForJob(plan, job) {
  return plan.phases.find((phase) => phase.id === job.phaseId);
}

function executePhaseJob(plan, job) {
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

function executeMergeGateJob(plan, job, dependencyRuns = []) {
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

function createLocalDryRunRuntimeInfo() {
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

function buildRequiredActions(recommendations = []) {
  const seen = new Set();
  const actions = [];

  for (const item of recommendations) {
    if (item?.nextCommand) {
      const key = `command:${item.nextCommand}`;
      if (!seen.has(key)) {
        seen.add(key);
        actions.push({ type: 'command', action: item.nextCommand, sourceId: item.targetId || null });
      }
    }

    if (item?.nextArtifact) {
      const key = `artifact:${item.nextArtifact}`;
      if (!seen.has(key)) {
        seen.add(key);
        actions.push({ type: 'artifact', action: item.nextArtifact, sourceId: item.targetId || null });
      }
    }
  }

  return actions;
}

function buildExecutorPreferences(dispatchPlan, dispatchSignals = {}, dispatchRun = null) {
  const normalizedPlan = normalizeDispatchPlan(dispatchPlan);
  if (!normalizedPlan) {
    return [];
  }

  const counts = new Map(
    (Array.isArray(dispatchSignals.executorUsage) ? dispatchSignals.executorUsage : [])
      .map((item) => [String(item.executor || '').trim(), Number(item.count) || 0])
      .filter(([executor]) => executor)
  );

  for (const jobRun of Array.isArray(dispatchRun?.jobRuns) ? dispatchRun.jobRuns : []) {
    const executor = String(jobRun?.executor || '').trim();
    if (!executor) continue;
    counts.set(executor, (counts.get(executor) || 0) + 1);
  }

  const executorIds = normalizedPlan.executorDetails.length > 0
    ? normalizedPlan.executorDetails.map((item) => item.id)
    : normalizedPlan.executorRegistry;

  return executorIds
    .map((executor) => {
      const observedCount = counts.get(executor) || 0;
      return {
        executor,
        confidence: observedCount > 0 ? 'observed' : 'planned',
        observedCount,
        source: observedCount > 0 ? 'dispatch-evidence' : 'dispatch-plan',
      };
    })
    .sort((left, right) => right.observedCount - left.observedCount || left.executor.localeCompare(right.executor));
}

export function buildEffectiveDispatchPolicy({ dispatchPolicy = null, dispatchPreflight = null, learnEvalReport = null } = {}) {
  const rawPolicy = normalizeDispatchPolicy(dispatchPolicy);
  if (!rawPolicy) {
    return null;
  }

  const preflight = normalizeDispatchPreflight(dispatchPreflight);
  if (!preflight || preflight.results.length === 0) {
    return rawPolicy;
  }

  const passedIds = new Set(
    preflight.results
      .filter((item) => item.status === 'passed' && item.sourceId)
      .map((item) => item.sourceId)
  );
  const failedIds = new Set(
    preflight.results
      .filter((item) => item.status === 'failed' && item.sourceId)
      .map((item) => item.sourceId)
  );
  const skippedIds = new Set(
    preflight.results
      .filter((item) => item.status === 'skipped' && item.sourceId)
      .map((item) => item.sourceId)
  );
  const unresolvedBlockers = rawPolicy.blockerIds.filter((item) => !passedIds.has(item));
  const resolvedBlockers = rawPolicy.blockerIds.filter((item) => passedIds.has(item));
  const unresolvedActions = rawPolicy.requiredActions.filter((item) => !item.sourceId || unresolvedBlockers.includes(item.sourceId));

  let status = 'caution';
  if (unresolvedBlockers.length > 0) {
    status = 'blocked';
  } else if ((Number(learnEvalReport?.signals?.dispatch?.runs) || 0) > 0) {
    status = 'ready';
  }

  const notes = [...rawPolicy.notes];
  if (resolvedBlockers.length > 0) {
    notes.push(`Preflight resolved blockers: ${resolvedBlockers.join(', ')}.`);
  }
  if (failedIds.size > 0) {
    notes.push(`Preflight still failing: ${[...failedIds].join(', ')}.`);
  }
  if (skippedIds.size > 0) {
    notes.push(`Preflight skipped: ${[...skippedIds].join(', ')}.`);
  }

  return normalizeDispatchPolicy({
    ...rawPolicy,
    status,
    parallelism: unresolvedBlockers.includes('runbook.dispatch-merge-triage') ? 'serial-only' : 'parallel-with-merge-gate',
    blockerIds: unresolvedBlockers,
    requiredActions: unresolvedActions,
    notes,
  });
}

export function buildDispatchPolicy({ learnEvalReport = null, learnEvalOverlay = null, dispatchPlan = null, dispatchRun = null } = {}) {
  if (!learnEvalReport && !learnEvalOverlay && !dispatchPlan && !dispatchRun) {
    return null;
  }

  const recommendations = Array.isArray(learnEvalOverlay?.appliedRecommendations)
    ? learnEvalOverlay.appliedRecommendations
    : Array.isArray(learnEvalReport?.recommendations?.all)
      ? learnEvalReport.recommendations.all
      : [];
  const fixRecommendations = recommendations.filter((item) => item?.kind === 'fix');
  const observeRecommendations = recommendations.filter((item) => item?.kind === 'observe');
  const dispatchSignals = learnEvalReport?.signals?.dispatch || {};
  const currentBlockedJobs = Array.isArray(dispatchRun?.jobRuns)
    ? dispatchRun.jobRuns.filter((item) => item?.status === 'blocked').length
    : 0;
  const blockedMergePath = fixRecommendations.some((item) => item?.targetId === 'runbook.dispatch-merge-triage')
    || (Number(dispatchSignals.blockedRuns) || 0) > 0
    || (Number(dispatchSignals.blockedJobs) || 0) > 0
    || currentBlockedJobs > 0;
  const sessionId = String(learnEvalReport?.session?.sessionId || learnEvalOverlay?.sourceSessionId || '').trim();
  const policyFixRecommendations = [...fixRecommendations];
  const dispatchRuntimeUnavailable = dispatchRun?.ok === false && !blockedMergePath;

  if (blockedMergePath && !policyFixRecommendations.some((item) => item?.targetId === 'runbook.dispatch-merge-triage')) {
    policyFixRecommendations.push({
      kind: 'fix',
      targetId: 'runbook.dispatch-merge-triage',
      nextCommand: sessionId
        ? `node scripts/aios.mjs orchestrate --session ${sessionId} --dispatch local --execute dry-run --format json`
        : 'node scripts/aios.mjs doctor',
      nextArtifact: dispatchSignals.latestArtifactPath || undefined,
    });
  }

  if (dispatchRuntimeUnavailable && !policyFixRecommendations.some((item) => item?.targetId === 'runbook.dispatch-runtime-unavailable')) {
    policyFixRecommendations.push({
      kind: 'fix',
      targetId: 'runbook.dispatch-runtime-unavailable',
      nextCommand: sessionId
        ? `node scripts/aios.mjs orchestrate --session ${sessionId} --dispatch local --execute dry-run --format json`
        : 'node scripts/aios.mjs orchestrate --dispatch local --execute dry-run --format json',
    });
  }

  let status = 'caution';
  if (policyFixRecommendations.length > 0) {
    status = 'blocked';
  } else if ((Number(dispatchSignals.runs) || 0) > 0 || Array.isArray(dispatchRun?.jobRuns)) {
    status = 'ready';
  }

  const notes = [];
  if (policyFixRecommendations.length > 0) {
    notes.push(`Blocked by ${policyFixRecommendations.length} fix recommendation${policyFixRecommendations.length === 1 ? '' : 's'}.`);
  } else if ((Number(dispatchSignals.runs) || 0) > 0 || Array.isArray(dispatchRun?.jobRuns)) {
    notes.push('Observed dispatch evidence is available for the current executor path.');
  } else {
    notes.push('No observed dispatch evidence yet; keep dispatch in caution mode.');
  }

  if (blockedMergePath) {
    notes.push('Observed merge-gate blockage suggests serial triage before parallel execution.');
  }
  if (dispatchRuntimeUnavailable) {
    notes.push(`Dispatch runtime execution is blocked: ${String(dispatchRun?.error || '').trim() || 'runtime returned ok=false'}.`);
  }

  return normalizeDispatchPolicy({
    status,
    parallelism: blockedMergePath ? 'serial-only' : 'parallel-with-merge-gate',
    blockerIds: policyFixRecommendations.map((item) => item.targetId),
    advisoryIds: observeRecommendations.map((item) => item.targetId),
    requiredActions: buildRequiredActions([...policyFixRecommendations, ...recommendations.filter((item) => item?.kind !== 'fix')]),
    executorPreferences: buildExecutorPreferences(dispatchPlan, dispatchSignals, dispatchRun),
    notes,
  });
}

function formatLearnEvalOverlay(overlay) {
  if (!overlay) {
    return [];
  }

  const lines = [
    'Learn-Eval Overlay:',
    `- session=${overlay.sourceSessionId || '(unknown)'}`,
    `- selected=${overlay.selectedRecommendationId || '(none)'}`,
  ];

  if (overlay.sourceGoal) {
    lines.push(`- goal=${overlay.sourceGoal}`);
  }

  if (overlay.appliedRecommendations.length > 0) {
    lines.push('- applied recommendations:');
    lines.push(...overlay.appliedRecommendations.map((item) => `  - [${item.kind}|${item.targetId}] ${item.title}`));
  } else {
    lines.push('- applied recommendations: (none)');
  }

  lines.push('');
  return lines;
}

function formatWorkItemPlan(workItems = []) {
  const items = normalizeWorkItems(workItems);
  if (items.length === 0) {
    return [];
  }

  const lines = [
    'Work-Item Plan:',
    `- items=${items.length}`,
  ];

  lines.push(...items.map((item) => {
    const depends = item.dependsOn.length > 0 ? item.dependsOn.join(', ') : '(none)';
    return `- [${item.type}] ${item.itemId} ${item.title} dependsOn=${depends}`;
  }));
  lines.push('');
  return lines;
}

function formatPolicySection(title, policy) {
  if (!policy) {
    return [];
  }

  const lines = [
    `${title}:`,
    `- status=${policy.status} parallelism=${policy.parallelism}`,
    `- blockers=${policy.blockerIds.length > 0 ? policy.blockerIds.join(', ') : '(none)'}`,
    `- advisories=${policy.advisoryIds.length > 0 ? policy.advisoryIds.join(', ') : '(none)'}`,
  ];

  if (Array.isArray(policy.requiredActions) && policy.requiredActions.length > 0) {
    lines.push('- required actions:');
    lines.push(...policy.requiredActions.map((item) => `  - [${item.type}] ${item.action}`));
  }

  if (Array.isArray(policy.executorPreferences) && policy.executorPreferences.length > 0) {
    lines.push('- executor preferences:');
    lines.push(...policy.executorPreferences.map((item) => `  - ${item.executor} confidence=${item.confidence} observed=${item.observedCount}`));
  }

  if (Array.isArray(policy.notes) && policy.notes.length > 0) {
    lines.push(...policy.notes.map((note) => `- note=${note}`));
  }

  lines.push('');
  return lines;
}

function formatDispatchPolicy(policy) {
  return formatPolicySection('Dispatch Policy', policy);
}

function formatEffectiveDispatchPolicy(policy) {
  return formatPolicySection('Effective Dispatch Policy', policy);
}


function formatReadiness(readiness) {
  if (!readiness || typeof readiness !== 'object') {
    return [];
  }
  const blockedReasons = Array.isArray(readiness.blockedReasons) ? readiness.blockedReasons : [];
  const warnings = Array.isArray(readiness.warnings) ? readiness.warnings : [];
  const nextActions = Array.isArray(readiness.nextActions) ? readiness.nextActions : [];
  const evidence = Array.isArray(readiness.evidence) ? readiness.evidence : [];
  const lines = [
    'Readiness:',
    `- verdict=${readiness.verdict || 'ready'} blockers=${blockedReasons.length > 0 ? blockedReasons.join(', ') : '(none)'}`,
  ];
  if (warnings.length > 0) {
    lines.push(...warnings.slice(0, 4).map((item) => `- warning=${item}`));
  }
  if (nextActions.length > 0) {
    lines.push('- next actions:');
    lines.push(...nextActions.slice(0, 4).map((item) => `  - ${item}`));
  }
  if (evidence.length > 0) {
    lines.push('- evidence:');
    lines.push(...evidence.slice(0, 4).map((item) => `  - [${item.type || 'evidence'}] ${item.path || '(inline)'} ${item.summary || ''}`));
  }
  lines.push('');
  return lines;
}

function formatDispatchPreflight(dispatchPreflight) {
  if (!dispatchPreflight) {
    return [];
  }

  const lines = [
    'Dispatch Preflight:',
    `- mode=${dispatchPreflight.mode} actions=${dispatchPreflight.results.length}`,
  ];

  if (dispatchPreflight.results.length > 0) {
    lines.push(...dispatchPreflight.results.map((item) => `- [${item.status}] ${item.runner} source=${item.sourceId || '(none)'} ${item.summary || item.action}`));
  }

  lines.push('');
  return lines;
}

function formatDispatchPlan(dispatchPlan) {
  if (!dispatchPlan) {
    return [];
  }

  const lines = [
    'Local Dispatch Skeleton:',
    `- mode=${dispatchPlan.mode} ready=${dispatchPlan.readyForExecution ? 'true' : 'false'} jobs=${dispatchPlan.jobs.length}`,
  ];

  if (Array.isArray(dispatchPlan.executorRegistry) && dispatchPlan.executorRegistry.length > 0) {
    lines.push(`- executors=${dispatchPlan.executorRegistry.join(', ')}`);
  }

  if (Array.isArray(dispatchPlan.notes) && dispatchPlan.notes.length > 0) {
    lines.push(...dispatchPlan.notes.map((note) => `- note=${note}`));
  }

  if (Array.isArray(dispatchPlan.workItems) && dispatchPlan.workItems.length > 0) {
    lines.push(`- workItems=${dispatchPlan.workItems.length}`);
  }
  if (dispatchPlan.workItemQueue?.enabled) {
    lines.push(`- workItemQueue maxParallel=${dispatchPlan.workItemQueue.maxParallel} entries=${dispatchPlan.workItemQueue.entries.length}`);
  }

  lines.push(...dispatchPlan.jobs.map((job) => {
    const dependsOn = job.dependsOn.length > 0 ? job.dependsOn.join(', ') : '(root)';
    return `- [${job.jobType}] ${job.jobId} role=${job.role} dependsOn=${dependsOn} executor=${job.launchSpec.executor}`;
  }));
  lines.push('');
  return lines;
}

function formatExecutorCapabilityManifest(manifest) {
  const normalized = normalizeExecutorCapabilityManifest(manifest);
  if (!normalized) {
    return [];
  }

  const summaryBits = EXECUTOR_CAPABILITY_KEYS
    .map((key) => `${key}=${normalized.summary[key]}`)
    .join(' ');
  const runtimeLabel = normalized.runtimeId || '(none)';
  const lines = [
    'Executor Capability Manifest:',
    `- mode=${normalized.executionMode} runtime=${runtimeLabel}`,
    `- summary ${summaryBits}`,
  ];

  if (normalized.executors.length > 0) {
    for (const entry of normalized.executors) {
      const capabilityBits = EXECUTOR_CAPABILITY_KEYS
        .map((key) => `${key}=${entry.capabilities[key]}`)
        .join(' ');
      lines.push(`- ${entry.id} jobs=${entry.jobCount} ${capabilityBits}`);
      if (Array.isArray(entry.notes) && entry.notes.length > 0) {
        lines.push(...entry.notes.map((note) => `  - note=${note}`));
      }
    }
  } else {
    lines.push('- (no executors)');
  }

  lines.push('');
  return lines;
}

function formatDispatchRun(dispatchRun) {
  if (!dispatchRun) {
    return [];
  }

  const lines = [
    'Local Dispatch Run:',
    `- mode=${dispatchRun.mode} ok=${dispatchRun.ok ? 'true' : 'false'} jobs=${dispatchRun.jobRuns.length}`,
  ];

  if (dispatchRun.runtime?.id) {
    lines.push(`- runtime=${dispatchRun.runtime.id} executionMode=${dispatchRun.runtime.executionMode || dispatchRun.mode}`);
  }

  if (Array.isArray(dispatchRun.executorRegistry) && dispatchRun.executorRegistry.length > 0) {
    lines.push(`- executors=${dispatchRun.executorRegistry.join(', ')}`);
  }

  if (dispatchRun.error) {
    lines.push(`- error=${dispatchRun.error}`);
  }

  lines.push(...dispatchRun.jobRuns.map((jobRun) => `- [${jobRun.status}] ${jobRun.jobId} output=${jobRun.output?.outputType || 'unknown'}`), '');

  return lines;
}

function formatDispatchEvidence(dispatchEvidence) {
  if (!dispatchEvidence) {
    return [];
  }

  const lines = [
    'Dispatch Evidence:',
    `- persisted=${dispatchEvidence.persisted ? 'true' : 'false'}`,
  ];

  if (dispatchEvidence.mode) {
    lines.push(`- mode=${dispatchEvidence.mode}`);
  }
  if (dispatchEvidence.reason) {
    lines.push(`- reason=${dispatchEvidence.reason}`);
  }
  if (dispatchEvidence.artifactPath) {
    lines.push(`- artifact=${dispatchEvidence.artifactPath}`);
  }
  if (dispatchEvidence.eventId) {
    lines.push(`- event=${dispatchEvidence.eventId}`);
  }
  if (dispatchEvidence.checkpointId) {
    lines.push(`- checkpoint=${dispatchEvidence.checkpointId}`);
  }
  if (dispatchEvidence.error) {
    lines.push(`- error=${dispatchEvidence.error}`);
  }

  lines.push('');
  return lines;
}

function normalizeWorkItemStatus(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'done' || normalized === 'completed' || normalized === 'simulated') return 'done';
  if (normalized === 'running') return 'running';
  if (normalized === 'blocked' || normalized === 'needs-input') return 'blocked';
  if (normalized === 'queued' || normalized === 'pending') return 'queued';
  return 'queued';
}

function summarizeWorkItemTotals(items = []) {
  const totals = {
    total: items.length,
    queued: 0,
    running: 0,
    blocked: 0,
    done: 0,
  };
  for (const item of items) {
    const status = normalizeWorkItemStatus(item?.status);
    if (status in totals) {
      totals[status] += 1;
    }
  }
  return totals;
}

function formatCountMap(map) {
  return Array.from(map.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([key, count]) => `${key}=${count}`)
    .join(', ');
}

function formatWorkItemTelemetry(workItemTelemetry) {
  if (!workItemTelemetry || typeof workItemTelemetry !== 'object') {
    return [];
  }

  const items = Array.isArray(workItemTelemetry.items) ? workItemTelemetry.items : [];
  const rawTotals = workItemTelemetry.totals && typeof workItemTelemetry.totals === 'object'
    ? workItemTelemetry.totals
    : summarizeWorkItemTotals(items);
  const totals = {
    total: Number.isFinite(rawTotals.total) ? Math.max(0, Math.floor(rawTotals.total)) : items.length,
    queued: Number.isFinite(rawTotals.queued) ? Math.max(0, Math.floor(rawTotals.queued)) : 0,
    running: Number.isFinite(rawTotals.running) ? Math.max(0, Math.floor(rawTotals.running)) : 0,
    blocked: Number.isFinite(rawTotals.blocked) ? Math.max(0, Math.floor(rawTotals.blocked)) : 0,
    done: Number.isFinite(rawTotals.done) ? Math.max(0, Math.floor(rawTotals.done)) : 0,
  };

  const lines = [
    'Work-Item Telemetry:',
    `- schemaVersion=${Number.isFinite(workItemTelemetry.schemaVersion) ? Math.floor(workItemTelemetry.schemaVersion) : 1}`,
    `- totals total=${totals.total} queued=${totals.queued} running=${totals.running} blocked=${totals.blocked} done=${totals.done}`,
  ];

  if (items.length > 0) {
    const blockedByType = new Map();
    const failureCounts = new Map();
    const retryCounts = new Map();

    for (const item of items) {
      const itemType = String(item?.itemType || 'unknown').trim() || 'unknown';
      const status = normalizeWorkItemStatus(item?.status);
      const typeCounts = blockedByType.get(itemType) || { total: 0, blocked: 0 };
      typeCounts.total += 1;
      if (status === 'blocked') {
        typeCounts.blocked += 1;
      }
      blockedByType.set(itemType, typeCounts);

      const failureClass = String(item?.failureClass || 'none').trim();
      if (status === 'blocked' && failureClass && failureClass !== 'none') {
        failureCounts.set(failureClass, (failureCounts.get(failureClass) || 0) + 1);
      }

      const retryClass = String(item?.retryClass || 'none').trim();
      if (retryClass && retryClass !== 'none') {
        retryCounts.set(retryClass, (retryCounts.get(retryClass) || 0) + 1);
      }
    }

    const byTypeText = Array.from(blockedByType.entries())
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([itemType, counts]) => `${itemType}=${counts.blocked}/${counts.total}`)
      .join(', ');
    lines.push(`- blockedByType ${byTypeText || '(none)'}`);

    if (failureCounts.size > 0) {
      lines.push(`- failureClasses ${formatCountMap(failureCounts)}`);
    }
    if (retryCounts.size > 0) {
      lines.push(`- retryClasses ${formatCountMap(retryCounts)}`);
    }
  }

  lines.push('');
  return lines;
}

function formatDispatchInsights(dispatchInsights) {
  if (!dispatchInsights || typeof dispatchInsights !== 'object') {
    return [];
  }

  const runtime = dispatchInsights.runtime && typeof dispatchInsights.runtime === 'object'
    ? dispatchInsights.runtime
    : {};
  const signals = Array.isArray(dispatchInsights.signals) ? dispatchInsights.signals : [];
  const actions = Array.isArray(dispatchInsights.suggestedActions) ? dispatchInsights.suggestedActions : [];
  const lines = [
    'Dispatch Insights:',
    `- status=${String(dispatchInsights.status || 'attention')} score=${Number.isFinite(dispatchInsights.score) ? Math.max(0, Math.floor(dispatchInsights.score)) : 0}`,
    `- runtime=${String(runtime.id || 'unknown')} executionMode=${String(runtime.executionMode || 'none')} mode=${String(runtime.mode || 'none')}`,
  ];

  if (signals.length > 0) {
    lines.push(...signals.map((signal) => {
      const count = Number.isFinite(signal?.count) ? ` count=${Math.max(0, Math.floor(signal.count))}` : '';
      const evidence = signal?.evidence ? ` evidence=${signal.evidence}` : '';
      return `- signal ${signal?.severity || 'info'} ${signal?.id || 'unknown'}${count}: ${signal?.message || ''}${evidence}`;
    }));
  } else {
    lines.push('- signals=(none)');
  }

  if (actions.length > 0) {
    lines.push(...actions.map((action) => {
      const command = action?.command ? ` command=${action.command}` : '';
      return `- action ${action?.id || 'unknown'}: ${action?.label || ''}${command}`;
    }));
  }

  lines.push('');
  return lines;
}

export function renderOrchestrationReport(input = {}) {
  const plan = Array.isArray(input.phases)
    ? input
    : {
      ...buildOrchestrationPlan(input),
      ...(Object.prototype.hasOwnProperty.call(input, 'workItemTelemetry') ? { workItemTelemetry: input.workItemTelemetry } : {}),
      ...(Object.prototype.hasOwnProperty.call(input, 'dispatchInsights') ? { dispatchInsights: input.dispatchInsights } : {}),
      ...(Object.prototype.hasOwnProperty.call(input, 'readiness') ? { readiness: input.readiness } : {}),
    };
  return [
    `ORCHESTRATION BLUEPRINT: ${plan.blueprint}`,
    `Task: ${plan.taskTitle}`,
    `Description: ${plan.description}`,
    ...(plan.contextSummary ? ['', `Context: ${plan.contextSummary}`] : []),
    '',
    'Phases:',
    ...plan.phases.map((phase) => `- [${phase.mode}] ${phase.label}: ${phase.responsibility}`),
    '',
    ...formatWorkItemPlan(plan.workItems),
    ...formatLearnEvalOverlay(plan.learnEvalOverlay),
    ...formatDispatchPolicy(plan.dispatchPolicy),
    ...formatDispatchPreflight(plan.dispatchPreflight),
    ...formatReadiness(plan.readiness),
    ...formatEffectiveDispatchPolicy(plan.effectiveDispatchPolicy),
    ...formatExecutorCapabilityManifest(plan.executorCapabilityManifest),
    ...formatDispatchPlan(plan.dispatchPlan),
    ...formatDispatchRun(plan.dispatchRun),
    ...formatDispatchEvidence(plan.dispatchEvidence),
    ...formatWorkItemTelemetry(plan.workItemTelemetry),
    ...formatDispatchInsights(plan.dispatchInsights),
    'Merge Gate:',
    '- Block on handoff status = blocked|needs-input',
    '- Block when read-only roles report filesTouched',
    '- Block on overlapping file ownership across parallel outputs',
    '- Merge only findings and recommendations when ownership is clean',
    '',
  ].join('\n');
}
