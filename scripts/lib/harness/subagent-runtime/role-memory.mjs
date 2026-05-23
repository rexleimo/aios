import { promises as fs } from 'node:fs';
import path from 'node:path';

import { runContextDbCli } from '../../contextdb-cli.mjs';
import {
  workspaceMemorySessionId,
  workspaceMemorySessionDir,
  workspaceMemoryMetaPath,
  workspaceMemoryPinnedPath,
} from '../../memo/workspace-memory.mjs';
import { normalizeText } from './text.mjs';

function normalizeRoleMemoryKey(role) {
  return normalizeText(role).toLowerCase().replace(/[^a-z0-9_-]/g, '-');
}

export async function loadRolePinnedMemory(role, rootDir) {
  const normalizedRole = normalizeRoleMemoryKey(role);
  if (!normalizedRole || !rootDir) return '';

  const space = `workspace-memory--${normalizedRole}`;
  const sessionId = workspaceMemorySessionId(space);
  const pinnedPath = workspaceMemoryPinnedPath(rootDir, sessionId);

  try {
    const content = await fs.readFile(pinnedPath, 'utf8');
    return String(content || '').trim();
  } catch {
    return '';
  }
}

export async function appendJobFindingsToRoleMemory({ role, rootDir, jobId, taskTitle, findings, contextSummary }) {
  const normalizedRole = normalizeRoleMemoryKey(role);
  if (!normalizedRole || !rootDir) return;

  const space = `workspace-memory--${normalizedRole}`;
  const sessionId = workspaceMemorySessionId(space);
  const dir = workspaceMemorySessionDir(rootDir, sessionId);
  const metaPath = workspaceMemoryMetaPath(rootDir, sessionId);

  try {
    await fs.access(metaPath);
  } catch {
    try {
      await fs.mkdir(dir, { recursive: true });
      runContextDbCli([
        'init', '--workspace', rootDir,
      ]);
      runContextDbCli([
        'session:new', '--workspace', rootDir,
        '--agent', 'workspace-memory',
        '--project', path.basename(rootDir),
        '--goal', `Workspace memory space "${space}"`,
        '--session-id', sessionId,
        '--tags', `space:${space}`,
      ]);
    } catch { /* skip on session creation failure */ }
  }

  const findingsText = Array.isArray(findings) && findings.length > 0
    ? findings.slice(0, 3).map(f => `- ${normalizeText(f)}`).join('\n')
    : 'no findings reported';
  const memoText = `[${jobId || 'job'}] ${normalizeText(taskTitle)}: ${normalizeText(contextSummary || 'completed')}\n${findingsText}`;

  const turnId = `memo:${normalizedRole}:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    runContextDbCli([
      'event:add', '--workspace', rootDir,
      '--session', sessionId,
      '--role', 'user',
      '--kind', 'memo',
      '--text', memoText.slice(0, 1400),
      '--turn-id', turnId,
      '--turn-type', 'side',
      '--environment', 'memo',
      '--hindsight-status', 'na',
      '--outcome', 'success',
    ]);
  } catch { /* skip event write on failure */ }

  const pinnedPath = workspaceMemoryPinnedPath(rootDir, sessionId);
  let existingPinned = '';
  try {
    existingPinned = await fs.readFile(pinnedPath, 'utf8');
  } catch { /* no existing pinned */ }
  const pinnedEntry = `- [${new Date().toISOString()}] ${jobId}: ${normalizeText(contextSummary || taskTitle)}`;
  const newPinned = existingPinned.trim()
    ? `${existingPinned.trim()}\n${pinnedEntry}`
    : `# ${normalizedRole} Role Memory\n\n${pinnedEntry}`;
  const clipped = newPinned.length > 5000
    ? newPinned.slice(newPinned.length - 4500)
    : newPinned;
  try {
    await fs.writeFile(pinnedPath, `${clipped.trim()}\n`, 'utf8');
  } catch { /* skip pinned write on failure */ }
}
