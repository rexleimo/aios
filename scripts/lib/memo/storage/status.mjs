import path from 'node:path';
import {
  DEFAULT_MEMO_STORAGE,
  SUPPORTED_MEMO_STORAGES,
} from './constants.mjs';
import { readConfig } from './config.mjs';
import { readJsonlEvents, readSplitEvents } from './events-read.mjs';
import { pathExists } from './fs-io.mjs';
import { normalizeEventRows } from './normalizers.mjs';
import {
  configPath,
  derivedDir,
  derivedManifestPath,
  fileEventsPath,
  memoRoot,
  splitEventsRoot,
} from './paths.mjs';

async function countFileRecords(workspaceRoot) {
  const { events, malformed } = await readJsonlEvents(fileEventsPath(workspaceRoot), { tolerateMalformed: true });
  return { records: normalizeEventRows(events, { fallbackStorage: 'file' }).length, malformed: malformed.length };
}

async function countSplitRecords(workspaceRoot) {
  const { events, malformed } = await readSplitEvents(workspaceRoot, { tolerateMalformed: true });
  return { records: normalizeEventRows(events, { fallbackStorage: 'split' }).length, malformed: malformed.length };
}

export async function getMemoStorageStatus(workspaceRoot) {
  let active = DEFAULT_MEMO_STORAGE;
  let config = { exists: false, path: configPath(workspaceRoot) };
  try {
    const parsed = await readConfig(workspaceRoot);
    active = parsed.active;
    config = { exists: parsed.exists, path: parsed.path };
  } catch (error) {
    config = { exists: await pathExists(configPath(workspaceRoot)), path: configPath(workspaceRoot), error: error.message };
  }

  const fileExists = await pathExists(fileEventsPath(workspaceRoot));
  const splitEventsExist = await pathExists(splitEventsRoot(workspaceRoot));
  const fileCounts = await countFileRecords(workspaceRoot);
  const splitCounts = await countSplitRecords(workspaceRoot);

  return {
    active,
    supported: [...SUPPORTED_MEMO_STORAGES],
    config,
    available: {
      split: {
        exists: splitEventsExist,
        records: splitCounts.records,
        malformed: splitCounts.malformed,
        path: path.join(memoRoot(workspaceRoot), 'split'),
      },
      file: {
        exists: fileExists,
        records: fileCounts.records,
        malformed: fileCounts.malformed,
        path: path.join(memoRoot(workspaceRoot), 'file'),
      },
    },
    derived: {
      split: {
        exists: await pathExists(derivedManifestPath(workspaceRoot, 'split')),
        path: derivedDir(workspaceRoot, 'split'),
      },
      file: {
        exists: await pathExists(derivedManifestPath(workspaceRoot, 'file')),
        path: derivedDir(workspaceRoot, 'file'),
      },
    },
  };
}
