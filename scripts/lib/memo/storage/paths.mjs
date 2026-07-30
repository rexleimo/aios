import path from 'node:path';
import { resolveMemoRoot } from '../../aios/state-root.mjs';
import {
  CONFIG_FILE,
  FILE_EVENTS_SEGMENTS,
} from './constants.mjs';

export function workspacePath(workspaceRoot, ...segments) {
  return path.join(path.resolve(workspaceRoot || process.cwd()), ...segments);
}

export function memoRoot(workspaceRoot, { env = process.env } = {}) {
  return resolveMemoRoot(workspaceRoot, { env });
}

export function configPath(workspaceRoot, options = {}) {
  return path.join(memoRoot(workspaceRoot, options), CONFIG_FILE);
}

export function fileEventsPath(workspaceRoot, options = {}) {
  return path.join(memoRoot(workspaceRoot, options), ...FILE_EVENTS_SEGMENTS);
}

export function filePinnedPath(workspaceRoot, safeSpace, options = {}) {
  return path.join(memoRoot(workspaceRoot, options), 'file', 'pinned', `${safeSpace}.md`);
}

export function splitEventsRoot(workspaceRoot, options = {}) {
  return path.join(memoRoot(workspaceRoot, options), 'split', 'events');
}

export function splitEventDir(workspaceRoot, safeSpace, options = {}) {
  return path.join(splitEventsRoot(workspaceRoot, options), safeSpace);
}

export function splitPinnedPath(workspaceRoot, safeSpace, options = {}) {
  return path.join(memoRoot(workspaceRoot, options), 'split', 'pinned', `${safeSpace}.md`);
}

export function derivedDir(workspaceRoot, storage, options = {}) {
  return path.join(memoRoot(workspaceRoot, options), 'derived', storage);
}

export function derivedManifestPath(workspaceRoot, storage, options = {}) {
  return path.join(derivedDir(workspaceRoot, storage, options), 'manifest.json');
}

export function derivedDocsPath(workspaceRoot, storage, options = {}) {
  return path.join(derivedDir(workspaceRoot, storage, options), 'docs.jsonl');
}
