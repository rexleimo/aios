import { normalizeHandoffPayload, validateHandoffPayload } from '../handoff.mjs';
import { ROLE_CARDS } from './blueprints.mjs';
import { normalizeText } from './shared.mjs';

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
