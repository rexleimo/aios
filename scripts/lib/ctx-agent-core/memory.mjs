import { promises as fs } from 'node:fs';
import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  ensureWorkspaceMemorySession,
  normalizeWorkspaceMemorySpace,
  workspaceMemoryEventsPath,
  workspaceMemoryMetaPath,
  workspaceMemoryPinnedPath,
  workspaceMemorySessionId,
  workspaceMemoryStatePath,
} from '../../lib/memo/workspace-memory.mjs';
import { getActiveMemoStorage, listMemoEvents, readPinnedMemo } from '../../lib/memo/storage.mjs';
import { buildPersonaOverlay, ensurePersonaLayer } from '../../lib/memo/persona.mjs';
import { scanWorkspaceMemoryContent } from '../../lib/memo/safety.mjs';
import { buildPerceptionSummary } from '../../lib/perception/perception-summary.mjs';
import { resolveContextDbRoot, resolveMemoRoot } from '../../lib/aios/state-root.mjs';
import { generateFacadeFromSession } from '../../lib/contextdb/facade.mjs';
import { parseBoolEnv, parseBoundedIntegerEnv } from './common.mjs';

export function shouldInjectWorkspaceMemory(env = process.env) {
  return parseBoolEnv(env.CTXDB_WORKSPACE_MEMORY, true);
}

async function readActiveSpaceFromState(workspaceRoot) {
  try {
    const raw = await fs.readFile(workspaceMemoryStatePath(workspaceRoot), 'utf8');
    if (!raw) return '';
    const parsed = JSON.parse(raw);
    return typeof parsed?.activeSpace === 'string' ? parsed.activeSpace.trim() : '';
  } catch {
    return '';
  }
}

async function resolveWorkspaceMemorySpace(workspaceRoot, env = process.env) {
  const envSpace = String(env.WORKSPACE_MEMORY_SPACE || '').trim();
  if (envSpace) return normalizeWorkspaceMemorySpace(envSpace);
  const stored = await readActiveSpaceFromState(workspaceRoot);
  if (stored) return normalizeWorkspaceMemorySpace(stored);
  return 'default';
}

async function readTailText(filePath, maxBytes) {
  try {
    const stats = await fs.stat(filePath);
    const size = Number(stats.size) || 0;
    if (size <= 0) return '';
    const readSize = Math.min(size, maxBytes);
    const start = size - readSize;
    const handle = await fs.open(filePath, 'r');
    try {
      const buffer = Buffer.alloc(readSize);
      await handle.read(buffer, 0, readSize, start);
      let text = buffer.toString('utf8');
      if (start > 0) {
        const newline = text.indexOf('\n');
        text = newline >= 0 ? text.slice(newline + 1) : '';
      }
      return text;
    } finally {
      await handle.close();
    }
  } catch {
    return '';
  }
}

function formatWorkspaceMemoRefs(refs) {
  if (!Array.isArray(refs) || refs.length === 0) return '';
  const tokens = refs.map((ref) => String(ref || '').trim()).filter(Boolean).slice(0, 8).map((ref) => `#${ref}`);
  return tokens.length > 0 ? ` ${tokens.join(' ')}` : '';
}

function formatWorkspaceMemoLine(event) {
  const ts = event?.ts ? String(event.ts) : '';
  const rawText = event?.text ? String(event.text) : '';
  const text = rawText.replace(/\s+/g, ' ').trim();
  const refsLabel = formatWorkspaceMemoRefs(event?.refs);
  return ts ? `- [${ts}]${refsLabel}: ${text}` : `- ${text}`;
}

function formatWorkspaceMemorySafetyLine({ target, reason, id }) {
  const normalizedTarget = String(target || 'entry').trim() || 'entry';
  const normalizedReason = String(reason || '').trim() || 'blocked by safety policy';
  const normalizedId = String(id || '').trim();
  return normalizedId
    ? `- Skipped unsafe ${normalizedTarget}: ${normalizedReason} (${normalizedId})`
    : `- Skipped unsafe ${normalizedTarget}: ${normalizedReason}`;
}

function formatSafetyScanLine(scan, target) {
  return formatWorkspaceMemorySafetyLine({ target, reason: scan?.reason, id: scan?.id });
}

async function loadRecentMemoEvents(eventsPath, limit) {
  if (limit <= 0) return [];
  const tail = await readTailText(eventsPath, 1_000_000);
  if (!tail.trim()) return [];
  const lines = tail.split('\n');
  const results = [];
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = String(lines[index] || '').trim();
    if (!line) continue;
    try {
      const event = JSON.parse(line);
      if (event?.kind !== 'memo') continue;
      if (event?.role && String(event.role) !== 'user') continue;
      results.push(event);
      if (results.length >= limit) break;
    } catch {
      // 忽略损坏的 memo 行，避免单条历史记录阻断启动。
    }
  }
  return results;
}

async function loadCanonicalWorkspaceMemory(workspaceRoot, space, recentLimit) {
  try {
    const storage = await getActiveMemoStorage(workspaceRoot);
    const [pinned, memos] = await Promise.all([
      readPinnedMemo(workspaceRoot, { storage, space }),
      listMemoEvents(workspaceRoot, { storage, space, limit: recentLimit }),
    ]);
    return {
      pinned: String(pinned || ''),
      memos: Array.isArray(memos) ? memos : [],
      available: Boolean(String(pinned || '').trim()) || (Array.isArray(memos) && memos.length > 0),
    };
  } catch (error) {
    if (existsSync(resolveMemoRoot(workspaceRoot))) {
      const reason = error instanceof Error ? error.message : String(error);
      console.warn(`[warn] canonical memo storage overlay skipped: ${reason}`);
    }
    return { pinned: '', memos: [], available: false };
  }
}

export async function buildWorkspaceMemoryOverlay(workspaceRoot, env = process.env) {
  if (!shouldInjectWorkspaceMemory(env)) return '';
  const space = await resolveWorkspaceMemorySpace(workspaceRoot, env);
  const maxChars = parseBoundedIntegerEnv(env.WORKSPACE_MEMORY_MAX_CHARS, 4000, { min: 256, max: 20000 });
  const recentLimit = parseBoundedIntegerEnv(env.WORKSPACE_MEMORY_RECENT_LIMIT, 10, { min: 0, max: 50 });
  const sessionId = workspaceMemorySessionId(space);
  const canonical = await loadCanonicalWorkspaceMemory(workspaceRoot, space, recentLimit);
  const hasLegacySession = existsSync(workspaceMemoryMetaPath(workspaceRoot, sessionId));
  if (!canonical.available && !hasLegacySession) return '';

  let pinned = canonical.available ? canonical.pinned : '';
  let memos = canonical.available ? canonical.memos : [];
  if (!canonical.available && hasLegacySession) {
    try {
      pinned = await fs.readFile(workspaceMemoryPinnedPath(workspaceRoot, sessionId), 'utf8');
    } catch {
      pinned = '';
    }
    memos = await loadRecentMemoEvents(workspaceMemoryEventsPath(workspaceRoot, sessionId), recentLimit);
  }

  const safetyNotices = [];
  const pinnedScan = scanWorkspaceMemoryContent(pinned, { target: 'pinned memory' });
  if (!pinnedScan.ok) {
    safetyNotices.push(formatSafetyScanLine(pinnedScan, 'pinned memory'));
    pinned = '';
  }

  const memoLines = [];
  for (const memo of memos.slice(0, recentLimit)) {
    const line = formatWorkspaceMemoLine(memo);
    const scan = scanWorkspaceMemoryContent(line, { target: 'memo entry' });
    if (!scan.ok) {
      safetyNotices.push(formatSafetyScanLine(scan, 'memo entry'));
      continue;
    }
    memoLines.push(line);
  }

  const sections = ['## Workspace Memory', `Space: ${space}`];
  if (pinned.trim()) sections.push(`### Pinned\n${pinned.trim()}`);
  if (memoLines.length > 0) sections.push(`### Recent Memos\n${memoLines.join('\n')}`);
  if (safetyNotices.length > 0) sections.push(`### Safety\n${safetyNotices.join('\n')}`);
  const overlay = sections.join('\n\n').trim();
  if (overlay.length <= maxChars) return overlay;
  const suffix = '\n...[workspace memory truncated]';
  return `${overlay.slice(0, Math.max(0, maxChars - suffix.length))}${suffix}`;
}

export async function buildMemoryPrelude(workspaceRoot, env = process.env) {
  const [personaOverlay, userOverlay, workspaceMemoryOverlay, perceptionSummary] = await Promise.all([
    buildPersonaOverlay('persona', { workspaceRoot, env }),
    buildPersonaOverlay('user', { workspaceRoot, env }),
    buildWorkspaceMemoryOverlay(workspaceRoot, env),
    buildPerceptionSummary(workspaceRoot),
  ]);
  const sections = [personaOverlay, userOverlay, workspaceMemoryOverlay, perceptionSummary].map((value) => String(value || '').trim()).filter(Boolean);
  return sections.join('\n\n');
}

export async function ensureMemoryLayers(workspaceRoot, { agent, project }) {
  try {
    await ensurePersonaLayer('persona');
    await ensurePersonaLayer('user');
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[warn] persona layer init skipped: ${reason}`);
  }

  try {
    await ensureWorkspaceMemorySession(workspaceRoot, { space: 'default', project, agent });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[warn] workspace memory init skipped: ${reason}`);
  }

  try {
    const facadePath = path.join(resolveContextDbRoot(workspaceRoot), '.facade.json');
    const facade = await generateFacadeFromSession(workspaceRoot, agent, project);
    await fs.writeFile(facadePath, `${JSON.stringify(facade, null, 2)}\n`, 'utf8');
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[warn] facade refresh skipped: ${reason}`);
  }
}
