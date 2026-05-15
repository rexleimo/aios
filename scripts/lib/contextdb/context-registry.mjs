import { existsSync, promises as fs, statSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// --- Path helpers ---

export function registryPath(workspaceRoot) {
  return path.join(path.resolve(workspaceRoot || process.cwd()), 'memory', 'context-db', 'index.json');
}

// --- Source definitions ---

const SOURCE_DEFS = [
  {
    id: 'handoff',
    cost: '~1KB',
    priority: 'high',
    pathTemplate: 'memory/context-db/sessions/{sessionId}/handoff.json',
    description: 'Previous session intent, progress, blockers, next actions',
    tags: ['continuity', 'all-tasks'],
  },
  {
    id: 'workspace-memory',
    cost: '~2KB',
    priority: 'medium',
    pathTemplate: 'memory/workspace-memory/{space}/pinned.md',
    description: 'Pinned memos and recent workspace notes',
    tags: ['memory', 'workspace'],
  },
  {
    id: 'perception',
    cost: '~3KB',
    priority: 'low',
    pathTemplate: 'memory/context-db/exports/latest-perception.md',
    description: 'Content analytics and strategy recommendations',
    tags: ['analytics', 'xhs'],
  },
  {
    id: 'task-router',
    cost: '~2KB',
    priority: 'medium',
    pathTemplate: 'memory/context-db/exports/latest-router.md',
    description: 'AIOS task routing guide with trigger commands',
    tags: ['routing', 'aios', 'all-tasks'],
  },
  {
    id: 'session-history',
    cost: '~20KB',
    priority: 'low',
    pathTemplate: 'memory/context-db/exports/latest-{agent}-context.md',
    description: 'Full session events, checkpoints, and assistant responses',
    tags: ['history', 'debugging'],
  },
];

// --- Source resolution ---

function resolveSourcePath(sourceDef, { sessionId, space, agent } = {}) {
  let p = sourceDef.pathTemplate;
  if (sessionId) p = p.replace(/\{sessionId\}/g, sessionId);
  if (space) p = p.replace(/\{space\}/g, space);
  if (agent) p = p.replace(/\{agent\}/g, agent);
  return p;
}

export function resolveSources({ sessionId, space, agent, workspaceRoot } = {}) {
  const root = path.resolve(workspaceRoot || process.cwd());
  return SOURCE_DEFS.map((def) => ({
    ...def,
    path: resolveSourcePath(def, { sessionId, space, agent }),
    absPath: path.join(root, resolveSourcePath(def, { sessionId, space, agent })),
  }));
}

// --- Index building ---

export function buildIndex({ sessionId, status, space, agent, workspaceRoot } = {}) {
  const resolvedSources = resolveSources({ sessionId, space, agent, workspaceRoot });
  const available = [];
  for (const src of resolvedSources) {
    try {
      if (statSync(src.absPath).isFile()) {
        available.push({
          id: src.id,
          cost: src.cost,
          priority: src.priority,
          path: src.path,
          description: src.description,
          tags: src.tags,
        });
      }
    } catch {
      // source not available, skip
    }
  }
  return {
    session: sessionId || '(new)',
    status: status || 'running',
    updated: new Date().toISOString(),
    space: space || 'default',
    agent: agent || '',
    sources: available,
  };
}

// --- I/O ---

async function writeAtomicFile(filePath, content) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.tmp.${process.pid}.${crypto.randomUUID().slice(0, 8)}`
  );
  await fs.writeFile(tmp, content, 'utf8');
  try {
    await fs.rename(tmp, filePath);
  } catch (error) {
    await fs.unlink(tmp).catch(() => {});
    throw error;
  }
}

export async function writeIndex({ sessionId, status, space, agent, workspaceRoot } = {}) {
  const index = buildIndex({ sessionId, status, space, agent, workspaceRoot });
  const absPath = registryPath(workspaceRoot || process.cwd());
  await writeAtomicFile(absPath, `${JSON.stringify(index, null, 2)}\n`);
  return { ok: true, path: absPath, index, byteLength: Buffer.byteLength(JSON.stringify(index), 'utf8') };
}

export async function readIndex(workspaceRoot) {
  const absPath = registryPath(workspaceRoot);
  const raw = await fs.readFile(absPath, 'utf8');
  return JSON.parse(raw);
}

// --- Injection text ---

export function renderRegistryInjection(index) {
  const sourcesList = index.sources
    .sort((a, b) => {
      const prio = { high: 0, medium: 1, low: 2 };
      return (prio[a.priority] ?? 1) - (prio[b.priority] ?? 1);
    })
    .map((s) => `  ${s.id} (${s.cost}): ${s.path}`)
    .join('\n');

  return [
    `Session: ${index.session} | Status: ${index.status}`,
    `Context registry: memory/context-db/index.json`,
    `Available sources:`,
    sourcesList || '  (none — fresh session)',
    '',
    'Read the registry index.json, then load only the sources relevant to the current task.',
    'Default: load "handoff" for continuity. Skip "perception" for coding tasks.',
  ].join('\n');
}
