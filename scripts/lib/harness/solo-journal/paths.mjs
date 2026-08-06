/* 中文注释：solo journal 路径规则集中在这里，业务模块只拿语义化路径。 */
import fs from 'node:fs';
import path from 'node:path';

import { resolveContextDbRoot } from '../../aios/state-root.mjs';
import {
  CONTROL_FILENAME,
  HOOK_EVENTS_FILENAME,
  OBJECTIVE_FILENAME,
  OPERATOR_NOTES_FILENAME,
  RUN_SUMMARY_FILENAME,
  SOLO_HARNESS_DIRNAME,
} from './constants.mjs';
import { normalizeText } from './normalizers.mjs';

/* 中文注释：旧目录名 solo-harness → worker-journal 的一次性迁移。路径模块保持轻量：
   只在读取路径时做一次存在性检查，命中旧名且新名不存在时 rename，随后总是返回新路径。 */
const LEGACY_SOLO_HARNESS_DIRNAME = 'solo-harness';

export function sessionDir(rootDir, sessionId) {
  return path.join(
    resolveContextDbRoot(rootDir, { preferLegacyExisting: true }),
    'sessions',
    normalizeText(sessionId)
  );
}

export function soloHarnessDir(rootDir, sessionId) {
  return path.join(sessionDir(rootDir, sessionId), 'artifacts', SOLO_HARNESS_DIRNAME);
}

function migrateLegacyDir(dir) {
  const legacyDir = path.join(path.dirname(dir), LEGACY_SOLO_HARNESS_DIRNAME);
  try {
    if (fs.existsSync(legacyDir) && !fs.existsSync(dir)) {
      fs.renameSync(legacyDir, dir);
    }
  } catch {
    // 迁移失败不阻断读取：调用方拿到新路径，旧目录由清理流程兜底。
  }
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
  migrateLegacyDir(dir);
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
