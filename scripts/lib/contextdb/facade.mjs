import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { resolveContextDbRoot, toWorkspaceRelative } from '../aios/state-root.mjs';
import { readContinuitySummary } from './continuity.mjs';

export const FACADE_FILENAME = '.facade.json';
export const DEFAULT_TTL_SECONDS = 3600;

// Tiered context loading constants (inspired by OpenViking L0/L1/L2)
export const CONTEXT_TIERS = Object.freeze({
  L0: { name: 'core', tokenBudget: 2000, description: 'Always loaded: current task, active plan, recent checkpoint' },
  L1: { name: 'relevant', tokenBudget: 5000, description: 'On-demand: related history, similar task experience, project knowledge' },
  L2: { name: 'background', tokenBudget: 10000, description: 'Optional: long-term memory, archived history, background knowledge' },
});

export const TIER_BUDGET_MAP = Object.freeze({
  low: ['L0'],
  medium: ['L0', 'L1'],
  high: ['L0', 'L1', 'L2'],
});

export function classifyMemoryTier(memory) {
  const kind = String(memory?.kind || '').toLowerCase();
  const ageMs = memory?.timestamp ? Date.now() - new Date(memory.timestamp).getTime() : Infinity;
  const accessCount = Number(memory?.accessCount ?? 0);
  // L0: current task instructions, active plans, recent checkpoints (<1h old)
  if (['task.instruction', 'plan', 'checkpoint', 'harness.objective'].includes(kind) || ageMs < 3600000) {
    return 'L0';
  }
  // L2: archived or rarely accessed (>7 days old, <2 accesses)
  if (ageMs > 604800000 || accessCount < 2) {
    return 'L2';
  }
  // L1: everything else
  return 'L1';
}

export function filterMemoriesByBudget(memories, budget = 'medium') {
  const allowedTiers = TIER_BUDGET_MAP[budget] || TIER_BUDGET_MAP.medium;
  let totalTokens = 0;
  const result = [];
  for (const tier of allowedTiers) {
    const tierBudget = CONTEXT_TIERS[tier].tokenBudget;
    const tierMemories = memories
      .filter((m) => (m._tier || classifyMemoryTier(m)) === tier)
      .sort((a, b) => (b.accessCount || 0) - (a.accessCount || 0));
    for (const m of tierMemories) {
      const estimatedTokens = Math.ceil((m.text?.length || 0) / 4);
      if (totalTokens + estimatedTokens > tierBudget) break;
      totalTokens += estimatedTokens;
      result.push({ ...m, _tier: tier, _estimatedTokens: estimatedTokens });
    }
  }
  return { memories: result, totalTokens, budget, tierCounts: { L0: result.filter((m) => m._tier === 'L0').length, L1: result.filter((m) => m._tier === 'L1').length, L2: result.filter((m) => m._tier === 'L2').length } };
}

async function overlayContinuity(workspaceRoot, facade) {
  const continuity = await readContinuitySummary({ workspaceRoot, sessionId: facade?.sessionId });
  if (!continuity) return facade;
  return {
    ...facade,
    continuitySummary: continuity.summary,
    continuityNextActions: continuity.nextActions,
    continuityUpdatedAt: continuity.updatedAt,
  };
}

export async function loadFacade(workspaceRoot) {
  const root = path.resolve(workspaceRoot || process.cwd());
  const contextDbRoot = resolveContextDbRoot(root, { preferLegacyExisting: true });
  const facadePath = path.join(contextDbRoot, FACADE_FILENAME);
  try {
    const text = await readFile(facadePath, 'utf8');
    const facade = JSON.parse(text);
    if (!isValidFacade(facade)) {
      return { ok: false, facade: null, reason: 'invalid schema' };
    }
    const generatedAt = new Date(facade.generatedAt).getTime();
    const ttlMs = (facade.ttlSeconds ?? DEFAULT_TTL_SECONDS) * 1000;
    if (Date.now() - generatedAt > ttlMs) {
      return { ok: false, facade: null, reason: 'expired' };
    }
    return { ok: true, facade: await overlayContinuity(workspaceRoot, facade) };
  } catch {
    return { ok: false, facade: null, reason: 'missing' };
  }
}

export async function generateFacadeFromSession(workspaceRoot, agent, project) {
  const root = path.resolve(workspaceRoot || process.cwd());
  const contextDbRoot = resolveContextDbRoot(root, { preferLegacyExisting: true });
  const sessionsDir = path.join(contextDbRoot, 'sessions');
  const contextPacketPath = toWorkspaceRelative(
    root,
    path.join(contextDbRoot, 'exports', `latest-${agent}-context.md`)
  );
  let latestSessionId = '';
  let latestMtime = 0;

  try {
    const entries = await readdir(sessionsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const metaPath = path.join(sessionsDir, entry.name, 'meta.json');
      try {
        const metaText = await readFile(metaPath, 'utf8');
        const meta = JSON.parse(metaText);
        const mtime = new Date(meta.updated_at || meta.created_at || 0).getTime();
        if (mtime > latestMtime) {
          latestMtime = mtime;
          latestSessionId = entry.name;
        }
      } catch {
        // ignore unreadable session dirs
      }
    }
  } catch {
    // no sessions dir yet
  }

  if (!latestSessionId) {
    return {
      version: 1,
      generatedAt: new Date().toISOString(),
      ttlSeconds: DEFAULT_TTL_SECONDS,
      sessionId: '',
      goal: `Shared context session for ${agent} on ${project}`,
      status: 'new',
      lastCheckpointSummary: 'No prior sessions',
      keyRefs: [],
      contextPacketPath,
      hasStalePack: false,
    };
  }

  const metaPath = path.join(sessionsDir, latestSessionId, 'meta.json');
  let meta = {};
  try {
    meta = JSON.parse(await readFile(metaPath, 'utf8'));
  } catch {
    // use defaults
  }

  const continuity = await readContinuitySummary({ workspaceRoot, sessionId: latestSessionId });

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    ttlSeconds: DEFAULT_TTL_SECONDS,
    sessionId: latestSessionId,
    goal: meta.goal || `Shared context session for ${agent} on ${project}`,
    status: meta.status || 'running',
    lastCheckpointSummary: meta.lastCheckpoint?.summary || '',
    keyRefs: meta.lastCheckpoint?.refs || [],
    contextPacketPath,
    hasStalePack: false,
    continuitySummary: continuity?.summary || '',
    continuityNextActions: continuity?.nextActions || [],
    continuityUpdatedAt: continuity?.updatedAt || '',
  };
}

function isValidFacade(f) {
  return (
    f &&
    typeof f === 'object' &&
    typeof f.version === 'number' &&
    typeof f.generatedAt === 'string' &&
    typeof f.sessionId === 'string' &&
    typeof f.goal === 'string'
  );
}

export function buildTieredContextPrompt(memories, budget = 'medium') {
  const filtered = filterMemoriesByBudget(memories, budget);
  if (!filtered.memories.length) return '';

  const tiers = ['L0', 'L1', 'L2'];
  const allowedTiers = TIER_BUDGET_MAP[budget] || TIER_BUDGET_MAP.medium;
  const sections = [];

  for (const tier of tiers) {
    if (!allowedTiers.includes(tier)) continue;
    const tierMemories = filtered.memories.filter((m) => m._tier === tier);
    if (!tierMemories.length) continue;
    const tierInfo = CONTEXT_TIERS[tier];
    const items = tierMemories.map((m) => {
      const label = m.kind || m.type || 'memory';
      const text = m.text || m.summary || '';
      return `- [${label}] ${text}`.slice(0, 500);
    });
    sections.push([
      `## Context (${tier} — ${tierInfo.name}, <${tierInfo.tokenBudget} tokens)`,
      ...items,
    ].join('\n'));
  }

  const stats = `_${filtered.totalTokens} tokens, ${filtered.memories.length} items (${filtered.tierCounts.L0}L0/${filtered.tierCounts.L1}L1/${filtered.tierCounts.L2}L2), budget=${budget}_`;
  return [...sections, stats].join('\n\n');
}
