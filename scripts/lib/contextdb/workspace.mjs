import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { resolveContextDbRoot, resolveWorkspaceStateRoot } from '../aios/state-root.mjs';
import { evaluateHandoffLineage } from './handoff.mjs';

export class OptimisticLockError extends Error {
  constructor(expected, actual) {
    super(`Optimistic lock failed: expected version ${expected}, actual ${actual}`);
    this.name = 'OptimisticLockError';
    this.code = 'OPTIMISTIC_LOCK_FAILED';
    this.expected = expected;
    this.actual = actual;
  }
}

export function workspaceDir(workspaceRoot) {
  return resolveWorkspaceStateRoot(path.resolve(workspaceRoot || process.cwd()), { preferLegacyExisting: true });
}

async function writeAtomicFile(filePath, content) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.tmp.${process.pid}.${crypto.randomUUID().slice(0, 8)}`
  );
  await fs.writeFile(tmpPath, content, 'utf8');
  try {
    await fs.rename(tmpPath, filePath);
  } catch (error) {
    await fs.unlink(tmpPath).catch(() => {});
    throw error;
  }
}

function createDefaultMeta() {
  return {
    schemaVersion: 1,
    workspaceVersion: 1,
    lastUpdatedAt: new Date().toISOString(),
    lastUpdatedBy: '',
    projectName: 'aios'
  };
}

export async function initWorkspace(workspaceRoot) {
  const dir = workspaceDir(workspaceRoot);
  const metaPath = path.join(dir, 'meta.json');

  try {
    const existing = await fs.readFile(metaPath, 'utf8');
    return {
      created: false,
      meta: JSON.parse(existing)
    };
  } catch {
    const meta = createDefaultMeta();
    await writeAtomicFile(metaPath, `${JSON.stringify(meta, null, 2)}\n`);
    return {
      created: true,
      meta
    };
  }
}

export async function readWorkspaceMeta(workspaceRoot) {
  const metaPath = path.join(workspaceDir(workspaceRoot), 'meta.json');
  const content = await fs.readFile(metaPath, 'utf8');
  return JSON.parse(content);
}

const KNOWLEDGE_SNAPSHOT_FILENAME = 'knowledge-snapshot.json';

export async function writeKnowledgeSnapshot(workspaceRoot, snapshot) {
  const snapPath = path.join(workspaceDir(workspaceRoot), KNOWLEDGE_SNAPSHOT_FILENAME);
  await writeAtomicFile(snapPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  return snapshot;
}

export async function readKnowledgeSnapshot(workspaceRoot) {
  const snapPath = path.join(workspaceDir(workspaceRoot), KNOWLEDGE_SNAPSHOT_FILENAME);
  try {
    const raw = await fs.readFile(snapPath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

const CONFLICTS_DIRNAME = 'conflicts';

function conflictsDir(workspaceRoot) {
  return path.join(workspaceDir(workspaceRoot), CONFLICTS_DIRNAME);
}

export async function writeConflictMarker(workspaceRoot, conflict) {
  const dir = conflictsDir(workspaceRoot);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filePath = path.join(dir, `${timestamp}.json`);
  await writeAtomicFile(filePath, `${JSON.stringify({
    ...conflict,
    detectedAt: new Date().toISOString(),
  }, null, 2)}\n`);
  return filePath;
}

export async function readConflictMarkers(workspaceRoot) {
  const dir = conflictsDir(workspaceRoot);
  try {
    const entries = await fs.readdir(dir);
    const markers = [];
    for (const entry of entries) {
      if (!entry.endsWith('.json')) continue;
      try {
        const raw = await fs.readFile(path.join(dir, entry), 'utf8');
        markers.push(JSON.parse(raw));
      } catch {}
    }
    return markers;
  } catch {
    return [];
  }
}

export async function writeWorkspaceMeta(workspaceRoot, updates = {}) {
  const metaPath = path.join(workspaceDir(workspaceRoot), 'meta.json');

  const current = await readWorkspaceMeta(workspaceRoot);

  if (updates.expectedVersion !== undefined && updates.expectedVersion !== current.workspaceVersion) {
    // F1: a rejected optimistic write must leave an auditable marker so the
    // loser can see who holds the version and reconcile, instead of only
    // getting a thrown error nobody records.
    await writeConflictMarker(workspaceRoot, {
      kind: 'workspace-meta-conflict',
      file: 'meta.json',
      expectedVersion: updates.expectedVersion,
      actualVersion: current.workspaceVersion,
      requestedUpdates: updates,
    });
    throw new OptimisticLockError(updates.expectedVersion, current.workspaceVersion);
  }

  const updated = {
    ...current,
    ...updates,
    workspaceVersion: current.workspaceVersion + 1,
    lastUpdatedAt: new Date().toISOString()
  };

  delete updated.expectedVersion;

  await writeAtomicFile(metaPath, `${JSON.stringify(updated, null, 2)}\n`);
  return updated;
}

/* H1 AgentView tiered loading (2026-05-10 design §2). T0 = meta + project
 * context (startup floor); T1 = + relevant skill summaries and a continuity
 * pointer (task routing); T2 = + the active skill's full text (execution);
 * T3 = + full continuity packet, lineage and knowledge snapshot (legacy
 * full load, on-demand lookups). Default tier is T3 so existing callers
 * keep the old whole-view behavior; production entry points pass a tier
 * explicitly. Every view reports a per-section char budget so tier costs
 * are observable instead of guessed. */
const AGENT_VIEW_TIERS = new Set(['T0', 'T1', 'T2', 'T3']);

function viewBudget(tier) {
  return { tier, sections: {} };
}

function accountChars(budget, section, value) {
  const text = value == null ? '' : typeof value === 'string' ? value : JSON.stringify(value);
  budget.sections[section] = String(text).length;
  return budget.sections[section];
}

function skillFileOf(entry) {
  return String(entry?.skill?.file || entry?.file || '');
}

export async function buildAgentView(workspaceRoot, sessionId, taskType = '', { tier = 'T3', env = process.env } = {}) {
  const normalizedTier = AGENT_VIEW_TIERS.has(String(tier).toUpperCase())
    ? String(tier).toUpperCase()
    : 'T3';
  const budget = viewBudget(normalizedTier);

  let meta;
  let projectContext = '';

  try {
    meta = await readWorkspaceMeta(workspaceRoot);
    const contextPath = path.join(workspaceDir(workspaceRoot), 'project-context.md');
    try {
      projectContext = await fs.readFile(contextPath, 'utf8');
    } catch {
      projectContext = '';
    }
  } catch {
    return {
      sessionId,
      tier: normalizedTier,
      workspaceVersion: 0,
      projectContext: '',
      relevantSkills: [],
      activeSkill: null,
      activeTasks: [],
      continuity: null,
      continuityPointer: null,
      continuityLineage: null,
      knowledge: null,
      budget,
    };
  }
  accountChars(budget, 'meta', meta);
  accountChars(budget, 'projectContext', projectContext);

  const view = {
    sessionId,
    tier: normalizedTier,
    workspaceVersion: meta.workspaceVersion,
    projectContext,
    relevantSkills: [],
    activeSkill: null,
    activeTasks: [],
    continuity: null,
    continuityPointer: null,
    continuityLineage: null,
    knowledge: null,
    budget,
  };
  if (normalizedTier === 'T0') return view;

  const { readSkillIndex, findSkillsByTaskType } = await import('./skill-index.mjs');
  const { readHandoffPacket, evaluateHandoffLineage } = await import('./handoff.mjs');

  const index = await readSkillIndex(workspaceRoot);
  view.relevantSkills = taskType
    ? findSkillsByTaskType(index, taskType)
    : index.skills;
  accountChars(budget, 'skillSummaries', view.relevantSkills);

  // Continuity pointer: locate the latest other session's handoff without
  // paying for its full packet until T2/T3 asks for it.
  let continuitySessionId = '';
  try {
    const sessionsDir = path.join(
      resolveContextDbRoot(path.resolve(workspaceRoot), { preferLegacyExisting: true }),
      'sessions'
    );
    const entries = await fs.readdir(sessionsDir, { withFileTypes: true });
    let latestMtime = 0;
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const metaPath = path.join(sessionsDir, entry.name, 'meta.json');
      try {
        const raw = await fs.readFile(metaPath, 'utf8');
        const m = JSON.parse(raw);
        const mtime = new Date(m.updated_at || m.updatedAt || m.created_at || m.createdAt || 0).getTime();
        if (mtime > latestMtime && entry.name !== sessionId) {
          latestMtime = mtime;
          continuitySessionId = entry.name;
        }
      } catch {
        // skip
      }
    }
    if (continuitySessionId) {
      view.continuityPointer = { sessionId: continuitySessionId, updatedAt: new Date(latestMtime).toISOString() };
      accountChars(budget, 'continuityPointer', view.continuityPointer);
    }
  } catch {
    // no sessions
  }
  if (normalizedTier === 'T1') return view;

  if (normalizedTier === 'T2' || normalizedTier === 'T3') {
    const activeSkillFile = skillFileOf(view.relevantSkills[0]);
    if (activeSkillFile) {
      try {
        view.activeSkill = {
          file: activeSkillFile,
          content: await fs.readFile(path.resolve(workspaceRoot, activeSkillFile), 'utf8'),
        };
        accountChars(budget, 'activeSkill', view.activeSkill.content);
      } catch {
        view.activeSkill = null;
      }
    }
  }
  if (normalizedTier === 'T2') return view;

  if (continuitySessionId) {
    try {
      view.continuity = await readHandoffPacket(workspaceRoot, continuitySessionId);
      if (view.continuity) {
        view.continuityLineage = evaluateHandoffLineage(view.continuity);
        accountChars(budget, 'continuity', view.continuity);
      }
    } catch {
      // no readable handoff
    }
  }
  try {
    view.knowledge = await readKnowledgeSnapshot(workspaceRoot);
    if (view.knowledge) accountChars(budget, 'knowledge', view.knowledge);
  } catch {
    view.knowledge = null;
  }
  return view;
}
