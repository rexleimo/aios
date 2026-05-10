import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

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
  return path.join(
    path.resolve(workspaceRoot || process.cwd()),
    'memory',
    'workspace'
  );
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

export async function buildAgentView(workspaceRoot, sessionId, taskType = '') {
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
      workspaceVersion: 0,
      projectContext: '',
      relevantSkills: [],
      activeTasks: [],
      continuity: null,
    };
  }

  const { readSkillIndex, findSkillsByTaskType } = await import('./skill-index.mjs');
  const { readHandoffPacket } = await import('./handoff.mjs');

  const index = await readSkillIndex(workspaceRoot);
  const relevantSkills = taskType
    ? findSkillsByTaskType(index, taskType)
    : index.skills;

  let continuity = null;
  try {
    const sessionsDir = path.join(path.resolve(workspaceRoot), 'memory', 'context-db', 'sessions');
    const entries = await fs.readdir(sessionsDir, { withFileTypes: true });
    let latestSessionId = '';
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
          latestSessionId = entry.name;
        }
      } catch {
        // skip
      }
    }
    if (latestSessionId) {
      continuity = await readHandoffPacket(workspaceRoot, latestSessionId);
    }
  } catch {
    // no sessions
  }

  return {
    sessionId,
    workspaceVersion: meta.workspaceVersion,
    projectContext,
    relevantSkills,
    activeTasks: [],
    continuity,
  };
}
