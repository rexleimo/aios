import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_MEMO_STORAGE,
  JSONL_PARSE_ERROR_CODE,
  JSON_PARSE_ERROR_CODE,
} from './constants.mjs';
import { getActiveMemoStorage } from './config.mjs';
import {
  collectRecursiveFiles,
  createParseError,
  readTextIfExists,
} from './fs-io.mjs';
import {
  normalizeEventRows,
  normalizeMemoStorageName,
  sanitizeSpace,
} from './normalizers.mjs';
import {
  fileEventsPath,
  splitEventDir,
  splitEventsRoot,
} from './paths.mjs';

export async function readJsonlEvents(filePath, { tolerateMalformed = false } = {}) {
  const raw = await readTextIfExists(filePath);
  if (!raw.trim()) {
    return { events: [], malformed: [], raw };
  }
  const events = [];
  const malformed = [];
  const lines = raw.split(/\r?\n/u);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line);
      events.push(parsed);
    } catch (error) {
      const detail = {
        path: filePath,
        line: index + 1,
        message: error.message,
      };
      malformed.push(detail);
      if (!tolerateMalformed) {
        throw createParseError(
          `Malformed memo JSONL at ${filePath}:${index + 1}: ${error.message}`,
          JSONL_PARSE_ERROR_CODE,
          detail,
        );
      }
    }
  }
  return { events, malformed, raw };
}

export async function readSplitEvents(workspaceRoot, { space, tolerateMalformed = false } = {}) {
  const requestedSpace = space ? sanitizeSpace(space) : '';
  const roots = [];
  if (requestedSpace) {
    roots.push({ safeSpace: requestedSpace, dir: splitEventDir(workspaceRoot, requestedSpace) });
  } else {
    let entries = [];
    try {
      entries = await fs.readdir(splitEventsRoot(workspaceRoot), { withFileTypes: true });
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        roots.push({ safeSpace: entry.name, dir: path.join(splitEventsRoot(workspaceRoot), entry.name) });
      }
    }
  }

  roots.sort((a, b) => a.safeSpace.localeCompare(b.safeSpace));
  const events = [];
  const malformed = [];
  for (const root of roots) {
    const files = await collectRecursiveFiles(root.dir, (filePath) => filePath.endsWith('.json'));
    for (const filePath of files) {
      const raw = await readTextIfExists(filePath);
      try {
        events.push(JSON.parse(raw));
      } catch (error) {
        const detail = { path: filePath, message: error.message };
        malformed.push(detail);
        if (!tolerateMalformed) {
          throw createParseError(
            `Malformed memo JSON at ${filePath}: ${error.message}`,
            JSON_PARSE_ERROR_CODE,
            detail,
          );
        }
      }
    }
  }
  return { events, malformed };
}

export async function collectEvents(workspaceRoot, { storage, space, tolerateMalformed = false } = {}) {
  const resolvedStorage = storage ? normalizeMemoStorageName(storage) : await getActiveMemoStorage(workspaceRoot);
  if (resolvedStorage === 'file') {
    const { events, malformed } = await readJsonlEvents(fileEventsPath(workspaceRoot), { tolerateMalformed });
    return {
      events: normalizeEventRows(events, { fallbackStorage: resolvedStorage }).filter((event) => !space || event.spaceKey === sanitizeSpace(space)),
      malformed,
    };
  }
  const { events, malformed } = await readSplitEvents(workspaceRoot, { space, tolerateMalformed });
  return {
    events: normalizeEventRows(events, { fallbackStorage: resolvedStorage || DEFAULT_MEMO_STORAGE }),
    malformed,
  };
}
