import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getActiveMemoStorage, setActiveMemoStorage } from './config.mjs';
import { rebuildMemoStorage } from './derived.mjs';
import { collectEvents, readJsonlEvents } from './events-read.mjs';
import { createMemoEvent, writeExistingEvents } from './events-write.mjs';
import { readTextIfExists } from './fs-io.mjs';
import { normalizeMemoStorageName, sanitizeSpace } from './normalizers.mjs';
import {
  readPinnedByStorage,
  writePinnedByStorage,
} from './pinned.mjs';
import { workspacePath } from './paths.mjs';
import { WORKSPACE_MEMORY_SESSION_PREFIX } from './constants.mjs';

async function hasStorageData(workspaceRoot, storage) {
  const resolvedStorage = normalizeMemoStorageName(storage);
  const { events } = await collectEvents(workspaceRoot, { storage: resolvedStorage, tolerateMalformed: true });
  if (events.length > 0) return true;
  const pinned = await readPinnedByStorage(workspaceRoot, resolvedStorage);
  return pinned.some((entry) => String(entry.content || '').trim());
}

async function convertStorage(workspaceRoot, { source, target }) {
  const sourceStorage = normalizeMemoStorageName(source);
  const targetStorage = normalizeMemoStorageName(target);
  const { events } = await collectEvents(workspaceRoot, { storage: sourceStorage });
  const pinned = await readPinnedByStorage(workspaceRoot, sourceStorage);
  await writeExistingEvents(workspaceRoot, targetStorage, events);
  await writePinnedByStorage(workspaceRoot, targetStorage, pinned);
  return { events: events.length, pinned: pinned.length };
}

async function legacySessionRoots(workspaceRoot) {
  const roots = [
    workspacePath(workspaceRoot, '.aios', 'context-db', 'sessions'),
    workspacePath(workspaceRoot, 'memory', 'context-db', 'sessions'),
  ];
  const output = [];
  for (const root of roots) {
    let entries = [];
    try {
      entries = await fs.readdir(root, { withFileTypes: true });
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.startsWith(WORKSPACE_MEMORY_SESSION_PREFIX)) {
        output.push({
          sessionId: entry.name,
          dir: path.join(root, entry.name),
          space: entry.name.slice(WORKSPACE_MEMORY_SESSION_PREFIX.length) || 'default',
        });
      }
    }
  }
  output.sort((a, b) => a.sessionId.localeCompare(b.sessionId));
  return output;
}

async function importLegacyWorkspaceMemoEvents(workspaceRoot, targetStorage) {
  const sessions = await legacySessionRoots(workspaceRoot);
  const events = [];
  const pinned = [];
  for (const session of sessions) {
    const pinnedContent = await readTextIfExists(path.join(session.dir, 'pinned.md'));
    if (pinnedContent) {
      pinned.push({ safeSpace: sanitizeSpace(session.space), content: pinnedContent });
    }

    const { events: rawEvents } = await readJsonlEvents(path.join(session.dir, 'l2-events.jsonl'));
    for (const raw of rawEvents) {
      if (!raw || raw.kind !== 'memo') continue;
      const legacySeq = Number.isFinite(raw.seq) ? raw.seq : events.length + 1;
      events.push(createMemoEvent({
        storage: targetStorage,
        space: session.space,
        text: raw.text,
        refs: raw.refs || [],
        turn: raw.turn,
        ts: raw.ts,
        eventId: raw.eventId || `legacy:${session.sessionId}#${legacySeq}`,
        legacy: {
          sessionId: session.sessionId,
          seq: legacySeq,
        },
      }));
    }
  }

  await writeExistingEvents(workspaceRoot, targetStorage, events);
  await writePinnedByStorage(workspaceRoot, targetStorage, pinned);
  return { events: events.length, pinned: pinned.length };
}

export async function switchMemoStorage(workspaceRoot, { target } = {}) {
  const targetStorage = normalizeMemoStorageName(target);
  const activeStorage = await getActiveMemoStorage(workspaceRoot);
  let migrated = { events: 0, pinned: 0, source: 'none' };

  if (!await hasStorageData(workspaceRoot, targetStorage)) {
    if (activeStorage !== targetStorage && await hasStorageData(workspaceRoot, activeStorage)) {
      const result = await convertStorage(workspaceRoot, { source: activeStorage, target: targetStorage });
      migrated = { ...result, source: activeStorage };
    } else {
      const result = await importLegacyWorkspaceMemoEvents(workspaceRoot, targetStorage);
      migrated = { ...result, source: 'legacy' };
    }
  }

  const manifest = await rebuildMemoStorage(workspaceRoot, { storage: targetStorage });
  await setActiveMemoStorage(workspaceRoot, targetStorage);
  return {
    active: targetStorage,
    previous: activeStorage,
    migrated,
    manifest,
  };
}
