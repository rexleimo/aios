import agentSpec from '../../../memory/specs/orchestrator-agents.json' with { type: 'json' };

import {
  ORCHESTRATOR_AGENT_MARKER,
  renderManagedAgentContent,
} from '../agents/emitters/shared.mjs';
import { resolveAgentTargets, syncCanonicalAgents } from '../agents/sync.mjs';

const LEGACY_TARGET_MAP = {
  '.claude/agents': 'claude',
  '.codex/agents': 'codex',
};

function normalizeId(value) {
  return String(value || '').trim();
}

function normalizeRoleId(value) {
  return normalizeId(value).toLowerCase();
}

function normalizeAgentId(value) {
  const id = normalizeId(value).toLowerCase();
  return id.length > 0 ? id : '';
}

function normalizeTools(value) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeId(item)).filter(Boolean);
  }
  const text = normalizeId(value);
  return text ? [text] : [];
}

export { ORCHESTRATOR_AGENT_MARKER };

export function resolveEffectiveModel(agent, env = process.env) {
  if (!agent) return '';
  const role = normalizeRoleId(agent.role);
  if (role) {
    const envKey = `AIOS_MODEL_${role.toUpperCase().replace(/-/g, '_')}`;
    const envModel = String(env?.[envKey] || '').trim();
    if (envModel) return envModel;
  }
  return normalizeId(agent.preferredModel) || normalizeId(agent.model);
}

export function normalizeOrchestratorAgentSpec(raw = {}) {
  const schemaVersion = Number(raw?.schemaVersion) || 1;
  const roleMap = raw?.roleMap && typeof raw.roleMap === 'object' ? { ...raw.roleMap } : {};
  const agents = raw?.agents && typeof raw.agents === 'object' ? { ...raw.agents } : {};

  const normalizedAgents = {};
  for (const [agentId, agent] of Object.entries(agents)) {
    const id = normalizeAgentId(agentId);
    if (!id) continue;
    normalizedAgents[id] = {
      name: normalizeAgentId(agent?.name || id) || id,
      description: normalizeId(agent?.description),
      tools: normalizeTools(agent?.tools),
      model: normalizeId(agent?.model),
      preferredModel: normalizeId(agent?.preferredModel),
      role: normalizeRoleId(agent?.role),
      handoffTarget: normalizeId(agent?.handoffTarget || 'next-phase'),
      systemPrompt: normalizeId(agent?.systemPrompt),
    };
  }

  const normalizedRoleMap = {};
  for (const [roleId, agentId] of Object.entries(roleMap)) {
    const role = normalizeRoleId(roleId);
    const mapped = normalizeAgentId(agentId);
    if (!role || !mapped) continue;
    normalizedRoleMap[role] = mapped;
  }

  return {
    schemaVersion,
    roleMap: normalizedRoleMap,
    agents: normalizedAgents,
  };
}

export function resolveAgentRefIdForRole(roleId, spec = agentSpec) {
  const normalized = normalizeRoleId(roleId);
  const resolvedSpec = normalizeOrchestratorAgentSpec(spec);
  const mapped = normalizeAgentId(resolvedSpec.roleMap[normalized]);
  if (mapped) return mapped;

  const fallback = normalizeAgentId(normalized);
  return fallback || null;
}

export function renderAgentMarkdown(agent) {
  return renderManagedAgentContent(agent);
}

function normalizeLegacyTargets(targets) {
  if (!Array.isArray(targets) || targets.length === 0) {
    return ['claude', 'codex'];
  }

  const selected = [];
  for (const rawTarget of targets) {
    const value = String(rawTarget || '').trim();
    if (!value) continue;

    if (LEGACY_TARGET_MAP[value]) {
      selected.push(LEGACY_TARGET_MAP[value]);
      continue;
    }

    if (value === 'claude' || value === 'codex') {
      selected.push(value);
      continue;
    }

    selected.push(...resolveAgentTargets(value));
  }

  return [...new Set(selected)];
}

function isUninstallSpec(spec) {
  if (!spec || typeof spec !== 'object') return false;
  return Object.keys(spec.roleMap || {}).length === 0 && Object.keys(spec.agents || {}).length === 0;
}

export async function syncGeneratedAgents({ rootDir, spec = agentSpec, io = console, targets = null } = {}) {
  const selectedTargets = normalizeLegacyTargets(targets);
  const result = await syncCanonicalAgents({
    rootDir,
    targets: selectedTargets,
    mode: isUninstallSpec(spec) ? 'uninstall' : 'install',
    writeCompatibilityExport: !isUninstallSpec(spec),
    io,
  });

  return {
    ...result,
    targets: result.results.map((item) => item.targetRel),
  };
}
