import blueprintSpec from '../../specs/orchestrator-blueprints.json' with { type: 'json' };
import { hasWildcardOwnedPrefix, normalizeOwnedPathPrefixes, normalizeText } from './shared.mjs';

export const ORCHESTRATOR_ROLE_IDS = ['planner', 'implementer', 'reviewer', 'security-reviewer'];
export const ORCHESTRATOR_BLUEPRINT_NAMES = ['feature', 'bugfix', 'refactor', 'security'];
export const ORCHESTRATOR_FORMATS = ['text', 'json'];
export const RL_ORCHESTRATOR_DECISION_TYPES = ['dispatch', 'retry', 'stop', 'handoff', 'preflight'];
export const MERGE_GATE_BLOCK_STATUSES = normalizeMergeGateBlockStatuses(blueprintSpec?.mergeGate?.blockStatuses);
export const MERGE_GATE_CONFLICT_RULE = normalizeText(blueprintSpec?.mergeGate?.conflictRule)
  || 'Parallel handoffs must not edit the same file unless the merge gate explicitly resolves ownership.';

export function normalizeMergeGateBlockStatuses(raw) {
  const fallback = ['blocked', 'needs-input'];
  if (!Array.isArray(raw)) {
    return fallback;
  }
  const values = raw.map((item) => normalizeText(item)).filter(Boolean);
  return values.length > 0 ? values : fallback;
}

export function titleCase(value = '') {
  return String(value)
    .split(/[\s_-]+/)
    .map((part) => part ? part[0].toUpperCase() + part.slice(1) : '')
    .filter(Boolean)
    .join(' ');
}

export function normalizeRoleLabel(roleId) {
  return titleCase(String(roleId || '').trim());
}

export function normalizeRoleCards(rawRoles = {}) {
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

export function normalizePhaseMode(rawMode) {
  const value = normalizeText(rawMode).toLowerCase();
  return value === 'parallel' ? 'parallel' : 'sequential';
}

export function normalizeBlueprintPhase(rawPhase, index, blueprintName) {
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

export function normalizeOrchestratorBlueprints(rawBlueprints = {}) {
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
