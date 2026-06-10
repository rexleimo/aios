import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { resolveContextDbRoot } from '../aios/state-root.mjs';

export const DEFAULT_WORKSPACE_MEMORY_SPACE = 'default';
export const WORKSPACE_MEMORY_AGENT = 'workspace-memory';
export const WORKSPACE_MEMORY_SESSION_PREFIX = 'workspace-memory--';

export function normalizeWorkspaceMemorySpace(raw) {
  const value = String(raw || '').trim();
  return value ? value : DEFAULT_WORKSPACE_MEMORY_SPACE;
}

function normalizeWorkspaceMemoryOptions(input) {
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    return {
      space: normalizeWorkspaceMemorySpace(input.space),
    };
  }
  return {
    space: normalizeWorkspaceMemorySpace(input),
  };
}

export function sanitizeWorkspaceMemorySpaceForSessionId(space) {
  const trimmed = normalizeWorkspaceMemorySpace(space);
  const normalized = trimmed
    .toLowerCase()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (normalized) return normalized;
  const hash = createHash('sha256').update(trimmed, 'utf8').digest('hex').slice(0, 10);
  return `space-${hash}`;
}

export function workspaceMemorySessionId(space) {
  return `${WORKSPACE_MEMORY_SESSION_PREFIX}${sanitizeWorkspaceMemorySpaceForSessionId(normalizeWorkspaceMemoryOptions(space).space)}`;
}

export function workspaceMemoryStatePath(workspaceRoot) {
  return path.join(resolveContextDbRoot(workspaceRoot), '.workspace-memory.json');
}

export function workspaceMemorySessionDir(workspaceRoot, sessionId) {
  return path.join(resolveContextDbRoot(workspaceRoot), 'sessions', sessionId);
}

export function workspaceMemoryMetaPath(workspaceRoot, sessionId) {
  return path.join(workspaceMemorySessionDir(workspaceRoot, sessionId), 'meta.json');
}

export function workspaceMemoryPinnedPath(workspaceRoot, sessionId) {
  return path.join(workspaceMemorySessionDir(workspaceRoot, sessionId), 'pinned.md');
}

export function workspaceMemoryEventsPath(workspaceRoot, sessionId) {
  return path.join(workspaceMemorySessionDir(workspaceRoot, sessionId), 'l2-events.jsonl');
}

export function ensureWorkspaceMemorySession(workspaceRoot, space = 'default') {
  const options = normalizeWorkspaceMemoryOptions(space);
  const sessionId = workspaceMemorySessionId(options.space);
  const dir = workspaceMemorySessionDir(workspaceRoot, sessionId);
  const metaPath = workspaceMemoryMetaPath(workspaceRoot, sessionId);

  if (existsSync(metaPath)) {
    return { created: false, sessionId, dir };
  }

  const now = new Date().toISOString();
  mkdirSync(dir, { recursive: true });
  writeFileSync(metaPath, JSON.stringify({
    schemaVersion: 1,
    sessionId,
    agent: WORKSPACE_MEMORY_AGENT,
    project: WORKSPACE_MEMORY_AGENT,
    goal: `Workspace memory for space: ${options.space}`,
    tags: [],
    status: 'running',
    createdAt: now,
    updatedAt: now,
  }, null, 2) + '\n', 'utf8');

  const statePath = path.join(dir, 'state.json');
  if (!existsSync(statePath)) {
    writeFileSync(statePath, JSON.stringify({
      sessionId,
      lastEventAt: null,
      lastEventSeq: 0,
      lastCheckpointAt: null,
      lastCheckpointSeq: 0,
      status: 'running',
      nextActions: [],
    }, null, 2) + '\n', 'utf8');
  }

  const pinnedPath = workspaceMemoryPinnedPath(workspaceRoot, sessionId);
  if (!existsSync(pinnedPath)) {
    writeFileSync(pinnedPath, '', 'utf8');
  }

  const eventsPath = workspaceMemoryEventsPath(workspaceRoot, sessionId);
  if (!existsSync(eventsPath)) {
    writeFileSync(eventsPath, '', 'utf8');
  }

  return { created: true, sessionId, dir };
}
