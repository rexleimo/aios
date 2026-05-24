/* 中文注释：artifact 模块只负责发现、筛选和移动 dispatch-run 文件。 */
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { DISPATCH_ARTIFACT_RE } from './constants.mjs';
import { buildCandidateRecord, normalizePath, toRelativePath } from './shared.mjs';

// 纯函数：最近 checkpoint 引用过的 dispatch artifact 必须保留，避免破坏可追溯证据。
export function collectRecentReferencedArtifacts(checkpoints = [], limit = 20) {
  const selected = checkpoints.slice(Math.max(0, checkpoints.length - limit));
  const refs = new Set();
  for (const checkpoint of selected) {
    for (const artifact of Array.isArray(checkpoint?.artifacts) ? checkpoint.artifacts : []) {
      const normalized = normalizePath(String(artifact || ''));
      if (DISPATCH_ARTIFACT_RE.test(path.basename(normalized))) {
        refs.add(normalized);
      }
    }
  }
  return refs;
}

export async function listDispatchArtifacts(artifactsDir) {
  const entries = await fs.readdir(artifactsDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && DISPATCH_ARTIFACT_RE.test(entry.name))
    .map((entry) => entry.name);

  const records = [];
  for (const fileName of files) {
    const absolutePath = path.join(artifactsDir, fileName);
    const stats = await fs.stat(absolutePath);
    records.push({
      fileName,
      absolutePath,
      mtimeMs: stats.mtimeMs,
      sizeBytes: stats.size,
    });
  }

  records.sort((left, right) => right.mtimeMs - left.mtimeMs || left.fileName.localeCompare(right.fileName));
  return records;
}

export async function moveFileSafe(sourcePath, targetPath) {
  try {
    await fs.rename(sourcePath, targetPath);
    return;
  } catch (error) {
    if (!error || typeof error !== 'object' || error.code !== 'EXDEV') {
      throw error;
    }
  }

  await fs.copyFile(sourcePath, targetPath);
  await fs.unlink(sourcePath);
}

// 纯函数：从扫描结果中划分候选、保留、引用跳过和新鲜跳过四类。
export function selectEntropyCandidates({ rootDir, records = [], referenced = new Set(), retain = 5, minAgeHours = 24, now = Date.now() } = {}) {
  const keepSet = new Set(records.slice(0, retain).map((item) => toRelativePath(rootDir, item.absolutePath)));
  const minAgeMs = minAgeHours * 60 * 60 * 1000;
  const cutoffMs = now - minAgeMs;
  const candidates = [];
  const skippedReferenced = [];
  const skippedFresh = [];

  for (const record of records) {
    const relativePath = toRelativePath(rootDir, record.absolutePath);
    if (keepSet.has(relativePath)) {
      continue;
    }
    if (referenced.has(relativePath)) {
      skippedReferenced.push(buildCandidateRecord(rootDir, record));
      continue;
    }
    if (record.mtimeMs > cutoffMs) {
      skippedFresh.push(buildCandidateRecord(rootDir, record));
      continue;
    }
    candidates.push(record);
  }

  return { keepSet, candidates, skippedReferenced, skippedFresh };
}
