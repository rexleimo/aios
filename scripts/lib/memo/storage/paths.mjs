import path from 'node:path';
import { resolveMemoRoot } from '../../aios/state-root.mjs';
import {
  CONFIG_FILE,
  FILE_EVENTS_SEGMENTS,
} from './constants.mjs';

export function workspacePath(workspaceRoot, ...segments) {
  return path.join(path.resolve(workspaceRoot || process.cwd()), ...segments);
}

export function memoRoot(workspaceRoot) {
  return resolveMemoRoot(workspaceRoot);
}

export function configPath(workspaceRoot) {
  return path.join(memoRoot(workspaceRoot), CONFIG_FILE);
}

export function fileEventsPath(workspaceRoot) {
  return path.join(memoRoot(workspaceRoot), ...FILE_EVENTS_SEGMENTS);
}

export function filePinnedPath(workspaceRoot, safeSpace) {
  return path.join(memoRoot(workspaceRoot), 'file', 'pinned', `${safeSpace}.md`);
}

export function splitEventsRoot(workspaceRoot) {
  return path.join(memoRoot(workspaceRoot), 'split', 'events');
}

export function splitEventDir(workspaceRoot, safeSpace) {
  return path.join(splitEventsRoot(workspaceRoot), safeSpace);
}

export function splitPinnedPath(workspaceRoot, safeSpace) {
  return path.join(memoRoot(workspaceRoot), 'split', 'pinned', `${safeSpace}.md`);
}

export function derivedDir(workspaceRoot, storage) {
  return path.join(memoRoot(workspaceRoot), 'derived', storage);
}

export function derivedManifestPath(workspaceRoot, storage) {
  return path.join(derivedDir(workspaceRoot, storage), 'manifest.json');
}

export function derivedDocsPath(workspaceRoot, storage) {
  return path.join(derivedDir(workspaceRoot, storage), 'docs.jsonl');
}
