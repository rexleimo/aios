import fs from 'node:fs';
import path from 'node:path';
import { ensureParentDir, readTextIfExists, writeText } from '../../platform/fs.mjs';
import {
  DEFAULT_WORKSPACE_MEMORY_SPACE,
  WORKSPACE_MEMORY_AGENT,
  normalizeWorkspaceMemorySpace,
  workspaceMemoryEventsPath,
  workspaceMemoryMetaPath,
  workspaceMemoryPinnedPath,
  workspaceMemorySessionDir,
  workspaceMemorySessionId,
  workspaceMemoryStatePath,
} from '../workspace-memory.mjs';
import { workspaceProjectName } from './shared.mjs';

export function statePath(workspaceRoot) {
  return workspaceMemoryStatePath(workspaceRoot);
}

export function readActiveSpaceFromState(workspaceRoot) {
  const raw = readTextIfExists(statePath(workspaceRoot)).trim();
  if (!raw) return '';
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed?.activeSpace === 'string' ? parsed.activeSpace.trim() : '';
  } catch {
    return '';
  }
}

export function writeActiveSpaceToState(workspaceRoot, space) {
  const filePath = statePath(workspaceRoot);
  ensureParentDir(filePath);
  fs.writeFileSync(filePath, `${JSON.stringify({ activeSpace: space }, null, 2)}\n`, 'utf8');
}

export function normalizeSpace(raw) {
  return normalizeWorkspaceMemorySpace(raw);
}

export function resolveActiveSpace(workspaceRoot, env = process.env) {
  const envSpace = String(env.WORKSPACE_MEMORY_SPACE || '').trim();
  if (envSpace) return normalizeSpace(envSpace);
  const stored = readActiveSpaceFromState(workspaceRoot);
  if (stored) return normalizeSpace(stored);
  return DEFAULT_WORKSPACE_MEMORY_SPACE;
}

export function sessionDir(workspaceRoot, sessionId) {
  return workspaceMemorySessionDir(workspaceRoot, sessionId);
}

export function sessionMetaPath(workspaceRoot, sessionId) {
  return workspaceMemoryMetaPath(workspaceRoot, sessionId);
}

export function ensureWorkspaceMemorySession(workspaceRoot, space) {
  const sessionId = workspaceMemorySessionId(space);
  if (fs.existsSync(sessionMetaPath(workspaceRoot, sessionId))) {
    return { sessionId, dir: sessionDir(workspaceRoot, sessionId) };
  }

  const dir = sessionDir(workspaceRoot, sessionId);
  const now = new Date().toISOString();
  fs.mkdirSync(dir, { recursive: true });
  writeText(sessionMetaPath(workspaceRoot, sessionId), `${JSON.stringify({
    schemaVersion: 1,
    sessionId,
    agent: WORKSPACE_MEMORY_AGENT,
    project: workspaceProjectName(workspaceRoot),
    goal: `Workspace memory space "${normalizeSpace(space)}"`,
    tags: [`space:${normalizeSpace(space)}`],
    status: 'running',
    createdAt: now,
    updatedAt: now,
  }, null, 2)}\n`);

  const stateFile = path.join(dir, 'state.json');
  if (!fs.existsSync(stateFile)) {
    writeText(stateFile, `${JSON.stringify({
      sessionId,
      lastEventAt: null,
      lastEventSeq: 0,
      lastCheckpointAt: null,
      lastCheckpointSeq: 0,
      status: 'running',
      nextActions: [],
    }, null, 2)}\n`);
  }
  if (!fs.existsSync(pinnedPath(workspaceRoot, sessionId))) {
    writeText(pinnedPath(workspaceRoot, sessionId), '');
  }
  if (!fs.existsSync(workspaceMemoryEventsPath(workspaceRoot, sessionId))) {
    writeText(workspaceMemoryEventsPath(workspaceRoot, sessionId), '');
  }

  return { sessionId, dir };
}

export function pinnedPath(workspaceRoot, sessionId) {
  return workspaceMemoryPinnedPath(workspaceRoot, sessionId);
}

export function readPinned(workspaceRoot, sessionId) {
  return readTextIfExists(pinnedPath(workspaceRoot, sessionId));
}

export function writePinned(workspaceRoot, sessionId, content) {
  const normalized = String(content ?? '').trimEnd();
  writeText(pinnedPath(workspaceRoot, sessionId), normalized ? `${normalized}\n` : '');
}
