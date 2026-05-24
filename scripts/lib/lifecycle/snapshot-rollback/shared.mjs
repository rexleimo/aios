import path from 'node:path';

export const SNAPSHOT_KIND = 'orchestration.pre-mutation-snapshot';
export const SNAPSHOT_DIR_PREFIX = 'pre-mutation-';
export const DEFAULT_GLOBAL_SNAPSHOT_ROOT = path.join('.aios', 'subagent-snapshots');

// 纯函数：统一规整文本，避免命令层到处重复处理空值和空白。
export function normalizeText(value) {
  return String(value ?? '').trim();
}

// 纯函数：统一把路径转换成 POSIX 片段，便于跨平台比较和排序。
export function toPosixPath(filePath = '') {
  return String(filePath || '').replace(/\\/g, '/');
}

// 纯函数：把工作区相对路径规整成安全的标准形式。
export function normalizeWorkspaceRelativePath(value = '') {
  const normalized = toPosixPath(normalizeText(value)).replace(/^\.\//, '').replace(/^\/+/, '');
  if (!normalized || normalized === '.') return '';
  if (normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) return '';
  return normalized;
}

// 纯函数：校验路径必须落在工作区内，避免回滚误写到外部目录。
export function ensureWithinRoot(rootDir, absPath, label = 'path') {
  const root = path.resolve(rootDir);
  const candidate = path.resolve(absPath);
  const relative = path.relative(root, candidate);
  if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
    return candidate;
  }
  throw new Error(`${label} escapes workspace root: ${absPath}`);
}

// 纯函数：从清单内容或目录名里解析快照时间，保证候选排序稳定。
export function parseSnapshotTimeMs(manifest = {}, manifestRelPath = '') {
  const createdAtMs = Date.parse(normalizeText(manifest?.createdAt));
  if (Number.isFinite(createdAtMs) && createdAtMs > 0) {
    return createdAtMs;
  }

  const parts = toPosixPath(manifestRelPath).split('/');
  const dirName = parts.length >= 2 ? parts[parts.length - 2] : '';
  const match = /^pre-mutation-(\d{8}T\d{6}Z)-/u.exec(dirName);
  if (!match) return 0;

  const stamp = match[1];
  const iso = `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}T${stamp.slice(9, 11)}:${stamp.slice(11, 13)}:${stamp.slice(13, 15)}Z`;
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? parsed : 0;
}

// 纯函数：把原始清单规整为可比较、可恢复的统一结构。
export function normalizeManifestRecord(manifest = {}, manifestRelPath = '') {
  const normalizedTargets = Array.isArray(manifest?.targets)
    ? manifest.targets
      .map((target) => ({
        path: normalizeWorkspaceRelativePath(target?.path),
        existed: target?.existed === true,
        type: target?.type === 'dir' ? 'dir' : 'file',
      }))
      .filter((target) => target.path)
    : [];

  const fallbackBackupPath = toPosixPath(path.join(path.dirname(manifestRelPath), 'backup'));
  const backupPath = normalizeWorkspaceRelativePath(manifest?.backupPath) || fallbackBackupPath;

  return {
    kind: normalizeText(manifest?.kind),
    createdAt: normalizeText(manifest?.createdAt),
    sessionId: normalizeText(manifest?.sessionId),
    jobId: normalizeText(manifest?.jobId),
    phaseId: normalizeText(manifest?.phaseId),
    role: normalizeText(manifest?.role),
    restoreHint: normalizeText(manifest?.restoreHint),
    targets: normalizedTargets,
    backupPath,
    rollbackHistory: Array.isArray(manifest?.rollbackHistory) ? [...manifest.rollbackHistory] : [],
  };
}

// 纯函数：把清单转换成排序分值，主流程只关心候选优先级。
export function scoreManifestCandidate(manifest = {}, manifestRelPath = '') {
  return parseSnapshotTimeMs(manifest, manifestRelPath);
}

// 纯函数：把目标清单展开成具体的恢复计划。
export function buildRestorePlan({ rootDir, manifest }) {
  const backupRootAbsPath = ensureWithinRoot(rootDir, path.join(rootDir, manifest.backupPath), 'snapshot backup path');
  const targets = Array.isArray(manifest.targets) ? manifest.targets : [];
  return targets.map((target) => {
    const targetPath = normalizeWorkspaceRelativePath(target.path);
    if (!targetPath) {
      throw new Error('Snapshot manifest target path is invalid.');
    }
    const destinationAbsPath = ensureWithinRoot(rootDir, path.join(rootDir, targetPath), 'target path');
    const backupAbsPath = ensureWithinRoot(rootDir, path.join(backupRootAbsPath, targetPath), 'backup path');
    const type = target.type === 'dir' ? 'dir' : 'file';
    return {
      path: targetPath,
      existed: target.existed === true,
      type,
      action: target.existed === true ? 'restore' : 'remove',
      destinationAbsPath,
      backupAbsPath,
    };
  });
}

// 纯函数：汇总回滚结果，便于 text/json 输出复用同一份统计。
export function summarizeRollback(entries = []) {
  const total = Array.isArray(entries) ? entries.length : 0;
  const restored = entries.filter((entry) => entry.action === 'restore').length;
  const removed = entries.filter((entry) => entry.action === 'remove').length;
  return { total, restored, removed };
}

// 纯函数：统一解析输出模式，避免命令层分散处理别名。
export function normalizeFormat(raw = 'text') {
  const value = normalizeText(raw).toLowerCase();
  return value === 'json' ? 'json' : 'text';
}

// 纯函数：把成功结果渲染成可读文本，主流程只负责填充数据。
export function renderTextResult(result = {}) {
  const lines = [
    `Snapshot rollback ${result.dryRun ? 'dry-run' : 'applied'}:`,
    `- manifest: ${result.manifestPath}`,
    `- backup: ${result.backupPath}`,
    `- session: ${result.sessionId || '(none)'}`,
    `- job: ${result.jobId || '(none)'}`,
    `- summary: total=${result.summary.total} restored=${result.summary.restored} removed=${result.summary.removed}`,
  ];
  if (result.restoreHint) {
    lines.push(`- hint: ${result.restoreHint}`);
  }
  return `${lines.join('\n')}\n`;
}

// 纯函数：把失败信息整理成 JSON 输出，便于 CLI 统一错误格式。
export function buildJsonFailure(error, options = {}) {
  return {
    ok: false,
    error: normalizeText(error),
    manifestPath: normalizeText(options.manifestPath),
    sessionId: normalizeText(options.sessionId),
    jobId: normalizeText(options.jobId),
    dryRun: options.dryRun === true,
  };
}
