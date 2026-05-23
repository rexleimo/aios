import fs from 'node:fs';
import path from 'node:path';
import { resolveContextDbRoot } from '../../../aios/state-root.mjs';
import {
  WORKSPACE_MEMORY_SESSION_PREFIX,
  sanitizeWorkspaceMemorySpaceForSessionId,
} from '../../workspace-memory.mjs';
import { usageError } from '../shared.mjs';

export function handleMemoSpaceCommand({ secondary, workspaceRoot, activeSpace, io }) {
  if ((secondary || '').toLowerCase() !== 'list') {
    throw usageError('Usage: memo space list');
  }
  const sessionsRoot = path.join(resolveContextDbRoot(workspaceRoot, { preferLegacyExisting: true }), 'sessions');
  const entries = fs.existsSync(sessionsRoot)
    ? fs.readdirSync(sessionsRoot, { withFileTypes: true })
    : [];
  const spaces = entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(WORKSPACE_MEMORY_SESSION_PREFIX))
    .map((entry) => entry.name.slice(WORKSPACE_MEMORY_SESSION_PREFIX.length))
    .sort((a, b) => a.localeCompare(b));
  if (spaces.length === 0) {
    io.log('(none)');
    return true;
  }
  const activeSuffix = sanitizeWorkspaceMemorySpaceForSessionId(activeSpace);
  for (const spaceSuffix of spaces) {
    const marker = spaceSuffix === activeSuffix ? '*' : ' ';
    io.log(`${marker} ${spaceSuffix}`);
  }
  return true;
}
