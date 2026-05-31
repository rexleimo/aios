import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_SNAPSHOT = {
  active_checkpoint_id: null,
  pre_update_ref_checkpoint_id: null,
  last_stable_checkpoint_id: null,
  mode: 'collection',
  applied_event_ids: [],
  last_event_id: null,
};

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function assertEventId(value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('event.event_id must be a non-empty string');
  }
}

export async function createControlStateStore({ rootDir, namespace = 'rl-core' }) {
  return {
    rootDir,
    namespace,
    filePath: path.join(rootDir, '.aios', 'experiments', namespace, 'control-state', 'snapshot.json'),
  };
}

export async function readControlSnapshot(store) {
  const snapshot = await readJson(store.filePath, DEFAULT_SNAPSHOT);
  return {
    ...DEFAULT_SNAPSHOT,
    ...snapshot,
    applied_event_ids: Array.isArray(snapshot.applied_event_ids) ? snapshot.applied_event_ids : [],
  };
}

export async function writeControlSnapshot(store, snapshot) {
  const next = {
    ...DEFAULT_SNAPSHOT,
    ...snapshot,
    applied_event_ids: Array.isArray(snapshot.applied_event_ids) ? snapshot.applied_event_ids : [],
  };
  await writeJson(store.filePath, next);
  return next;
}

export async function applyControlEvent(store, event) {
  assertEventId(event?.event_id);
  const snapshot = await readControlSnapshot(store);
  if (snapshot.applied_event_ids.includes(event.event_id)) {
    return {
      applied: false,
      snapshot,
    };
  }
  const next = {
    ...snapshot,
    ...(event.snapshot_patch || {}),
    applied_event_ids: [...snapshot.applied_event_ids, event.event_id],
    last_event_id: event.event_id,
  };
  await writeControlSnapshot(store, next);
  return {
    applied: true,
    snapshot: next,
  };
}
