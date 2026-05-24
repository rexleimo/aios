/* 中文注释：solo journal 路径规则集中在这里，业务模块只拿语义化路径。 */
import path from 'node:path';

import {
  CONTROL_FILENAME,
  HOOK_EVENTS_FILENAME,
  OBJECTIVE_FILENAME,
  OPERATOR_NOTES_FILENAME,
  RUN_SUMMARY_FILENAME,
  SOLO_HARNESS_DIRNAME,
} from './constants.mjs';
import { normalizeText } from './normalizers.mjs';

export function sessionDir(rootDir, sessionId) {
  return path.join(
    path.resolve(rootDir || process.cwd()),
    'memory',
    'context-db',
    'sessions',
    normalizeText(sessionId)
  );
}

export function soloHarnessDir(rootDir, sessionId) {
  return path.join(sessionDir(rootDir, sessionId), 'artifacts', SOLO_HARNESS_DIRNAME);
}

export function iterationFileName(iteration) {
  const value = Number.isFinite(iteration) ? Math.max(1, Math.floor(iteration)) : 1;
  return `iteration-${String(value).padStart(4, '0')}.json`;
}

export function iterationLogFileName(iteration) {
  const value = Number.isFinite(iteration) ? Math.max(1, Math.floor(iteration)) : 1;
  return `iteration-${String(value).padStart(4, '0')}.log.jsonl`;
}

export function getSoloHarnessPaths({ rootDir, sessionId } = {}) {
  const dir = soloHarnessDir(rootDir, sessionId);
  const iterationDir = dir;
  return {
    dir,
    objectivePath: path.join(dir, OBJECTIVE_FILENAME),
    operatorNotesPath: path.join(dir, OPERATOR_NOTES_FILENAME),
    summaryPath: path.join(dir, RUN_SUMMARY_FILENAME),
    controlPath: path.join(dir, CONTROL_FILENAME),
    hookEventsPath: path.join(dir, HOOK_EVENTS_FILENAME),
    iterationDir,
  };
}
