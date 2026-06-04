import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { getActiveMemoStorage } from './config.mjs';
import { appendText, atomicWriteText, collectRecursiveFiles } from './fs-io.mjs';
import { readJsonlEvents } from './events-read.mjs';
import {
  normalizeMemoStorageName,
  normalizeMemoScope,
  normalizeMemoAgent,
  normalizeSpaceName,
  sanitizeSpace,
  sortEventsAscending,
  toRefs,
} from './normalizers.mjs';
import {
  fileEventsPath,
  splitEventDir,
} from './paths.mjs';

async function nextFileSeq(workspaceRoot) {
  const { events } = await readJsonlEvents(fileEventsPath(workspaceRoot), { tolerateMalformed: false });
  const maxSeq = events.reduce((max, event) => Math.max(max, Number.isFinite(event?.seq) ? event.seq : 0), 0);
  return maxSeq + 1;
}

async function nextSplitSeq(workspaceRoot, safeSpace) {
  const files = await collectRecursiveFiles(splitEventDir(workspaceRoot, safeSpace), (filePath) => /^\d+\.json$/u.test(path.basename(filePath)));
  const maxSeq = files.reduce((max, filePath) => {
    const parsed = Number.parseInt(path.basename(filePath, '.json'), 10);
    return Number.isFinite(parsed) ? Math.max(max, parsed) : max;
  }, 0);
  return maxSeq + 1;
}

function paddedSeq(seq) {
  return String(seq).padStart(12, '0');
}

export function createMemoEvent({ storage, space, text, refs, turn, seq, eventId, ts, legacy, scope, agent }) {
  const normalizedSpace = normalizeSpaceName(space);
  const safeSpace = sanitizeSpace(normalizedSpace);
  const timestamp = ts ? String(ts) : new Date().toISOString();
  const id = eventId || `memo:${safeSpace}:${timestamp.replace(/[-:.TZ]/gu, '')}-${randomUUID().slice(0, 8)}`;
  return {
    schemaVersion: 1,
    eventId: id,
    storage,
    space: normalizedSpace,
    spaceKey: safeSpace,
    seq,
    ts: timestamp,
    role: 'user',
    kind: 'memo',
    text: String(text ?? '').trim(),
    refs: toRefs(refs),
    scope: normalizeMemoScope(scope),
    agent: normalizeMemoAgent(agent),
    ...(turn && typeof turn === 'object' ? { turn } : {}),
    ...(legacy && typeof legacy === 'object' ? { legacy } : {}),
  };
}

async function writeEventToFile(workspaceRoot, event) {
  await appendText(fileEventsPath(workspaceRoot), `${JSON.stringify(event)}\n`);
}

async function writeEventToSplit(workspaceRoot, event) {
  const safeSpace = event.spaceKey || sanitizeSpace(event.space);
  const seq = Number.isFinite(event.seq) && event.seq > 0 ? event.seq : await nextSplitSeq(workspaceRoot, safeSpace);
  const filePath = path.join(splitEventDir(workspaceRoot, safeSpace), `${paddedSeq(seq)}.json`);
  const normalized = { ...event, seq };
  await atomicWriteText(filePath, `${JSON.stringify(normalized, null, 2)}\n`);
  return normalized;
}

export async function writeExistingEvents(workspaceRoot, storage, events) {
  const normalizedStorage = normalizeMemoStorageName(storage);
  const sorted = sortEventsAscending(events);
  if (normalizedStorage === 'file') {
    for (let index = 0; index < sorted.length; index += 1) {
      const event = createMemoEvent({
        ...sorted[index],
        storage: normalizedStorage,
        seq: index + 1,
        eventId: sorted[index].eventId,
      });
      await writeEventToFile(workspaceRoot, event);
    }
    return;
  }

  const nextBySpace = new Map();
  for (const sourceEvent of sorted) {
    const safeSpace = sourceEvent.spaceKey || sanitizeSpace(sourceEvent.space);
    if (!nextBySpace.has(safeSpace)) {
      nextBySpace.set(safeSpace, await nextSplitSeq(workspaceRoot, safeSpace));
    }
    const seq = nextBySpace.get(safeSpace);
    nextBySpace.set(safeSpace, seq + 1);
    const event = createMemoEvent({
      ...sourceEvent,
      storage: normalizedStorage,
      seq,
      eventId: sourceEvent.eventId,
    });
    await writeEventToSplit(workspaceRoot, event);
  }
}

export async function appendMemoEvent({ workspaceRoot, storage, space = 'default', text, refs = [], turn = undefined, scope = 'project_shared', agent = '' } = {}) {
  const resolvedStorage = storage ? normalizeMemoStorageName(storage) : await getActiveMemoStorage(workspaceRoot);
  const content = String(text ?? '').trim();
  if (!content) {
    throw new Error('memo text is required');
  }

  const safeSpace = sanitizeSpace(space);
  const seq = resolvedStorage === 'file'
    ? await nextFileSeq(workspaceRoot)
    : await nextSplitSeq(workspaceRoot, safeSpace);
  const event = createMemoEvent({
    storage: resolvedStorage,
    space,
    text: content,
    refs,
    turn,
    scope,
    agent,
    seq,
  });

  if (resolvedStorage === 'file') {
    await writeEventToFile(workspaceRoot, event);
    return event;
  }
  return await writeEventToSplit(workspaceRoot, event);
}
