import { promises as fs } from 'node:fs';
import path from 'node:path';
import { contextDbRelativePath } from '../aios/state-root.mjs';

const SNAPSHOT_KIND = 'orchestration.pre-mutation-snapshot';
const SNAPSHOT_DIR_PREFIX = 'pre-mutation-';
const DEFAULT_GLOBAL_SNAPSHOT_ROOT = path.join('.aios', 'subagent-snapshots');

function normalizeText(value) {
  return String(value ?? '').trim();
}

function toPosixPath(filePath = '') {
  return String(filePath || '').replace(/\\/g, '/');
}

function normalizeWorkspaceRelativePath(value = '') {
  const normalized = toPosixPath(normalizeText(value)).replace(/^\.\//, '').replace(/^\/+/, '');
  if (!normalized || normalized === '.') return '';
  if (normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) return '';
  return normalized;
}

function ensureWithinRoot(rootDir, absPath, label = 'path') {
  const root = path.resolve(rootDir);
  const candidate = path.resolve(absPath);
  const relative = path.relative(root, candidate);
  if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
    return candidate;
  }
  throw new Error(`${label} escapes workspace root: ${absPath}`);
}

function parseSnapshotTimeMs(manifest = {}, manifestRelPath = '') {
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

function normalizeManifestRecord(manifest = {}, manifestRelPath = '') {
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

function scoreManifestCandidate(manifest = {}, manifestRelPath = '') {
  return parseSnapshotTimeMs(manifest, manifestRelPath);
}

async function readSnapshotManifestCandidate(rootDir, manifestAbsPath) {
  const manifestAbs = ensureWithinRoot(rootDir, manifestAbsPath, 'manifest');
  const manifestRelPath = toPosixPath(path.relative(rootDir, manifestAbs));
  const raw = JSON.parse(await fs.readFile(manifestAbs, 'utf8'));
  const normalized = normalizeManifestRecord(raw, manifestRelPath);
  if (normalized.kind !== SNAPSHOT_KIND) {
    throw new Error(`Unsupported snapshot manifest kind: ${normalized.kind || '(missing)'}`);
  }
  return {
    manifestAbsPath: manifestAbs,
    manifestRelPath,
    manifestRaw: raw,
    manifest: normalized,
    score: scoreManifestCandidate(normalized, manifestRelPath),
  };
}

async function listSnapshotCandidates({
  rootDir,
  searchRootRelPath,
  jobId = '',
} = {}) {
  const normalizedSearchRoot = normalizeWorkspaceRelativePath(searchRootRelPath);
  if (!normalizedSearchRoot) return [];
  const searchAbs = ensureWithinRoot(rootDir, path.join(rootDir, normalizedSearchRoot), 'snapshot search root');

  let entries = [];
  try {
    entries = await fs.readdir(searchAbs, { withFileTypes: true });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  const normalizedJobId = normalizeText(jobId);
  const candidates = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!String(entry.name || '').startsWith(SNAPSHOT_DIR_PREFIX)) continue;
    const manifestAbsPath = path.join(searchAbs, entry.name, 'manifest.json');
    try {
      const candidate = await readSnapshotManifestCandidate(rootDir, manifestAbsPath);
      if (normalizedJobId && candidate.manifest.jobId !== normalizedJobId) {
        continue;
      }
      candidates.push(candidate);
    } catch {
      // Ignore malformed or partial snapshot directories.
    }
  }

  return candidates.sort((left, right) => (
    right.score - left.score
    || right.manifestRelPath.localeCompare(left.manifestRelPath)
  ));
}

async function resolveSnapshotManifest(options = {}, { rootDir } = {}) {
  const manifestPath = normalizeText(options.manifestPath);
  const sessionId = normalizeText(options.sessionId);
  const jobId = normalizeText(options.jobId);

  if (manifestPath) {
    const absPath = path.isAbsolute(manifestPath)
      ? manifestPath
      : path.join(rootDir, manifestPath);
    return await readSnapshotManifestCandidate(rootDir, absPath);
  }

  if (sessionId) {
    const searchRootRelPath = contextDbRelativePath(rootDir, 'sessions', sessionId, 'artifacts');
    const candidates = await listSnapshotCandidates({ rootDir, searchRootRelPath, jobId });
    if (candidates.length > 0) return candidates[0];
    throw new Error(`No pre-mutation snapshot manifest found for session "${sessionId}"${jobId ? ` and job "${jobId}"` : ''}.`);
  }

  const candidates = await listSnapshotCandidates({
    rootDir,
    searchRootRelPath: DEFAULT_GLOBAL_SNAPSHOT_ROOT,
    jobId,
  });
  if (candidates.length > 0) return candidates[0];
  throw new Error('No pre-mutation snapshot manifest found. Provide --manifest <path> or --session <id>.');
}

function buildRestorePlan({ rootDir, manifest }) {
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

async function verifyRestorePlan(plan = []) {
  for (const item of plan) {
    if (item.action !== 'restore') continue;
    const details = await fs.lstat(item.backupAbsPath).catch((error) => {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
        return null;
      }
      throw error;
    });
    if (!details) {
      throw new Error(`Snapshot backup is missing: ${item.path}`);
    }
    if (item.type === 'dir' && !details.isDirectory()) {
      throw new Error(`Snapshot backup type mismatch (expected directory): ${item.path}`);
    }
    if (item.type === 'file' && details.isDirectory()) {
      throw new Error(`Snapshot backup type mismatch (expected file): ${item.path}`);
    }
  }
}

async function applyRestorePlan(plan = [], { dryRun = false } = {}) {
  const entries = [];
  for (const item of plan) {
    if (!dryRun) {
      await fs.rm(item.destinationAbsPath, { recursive: true, force: true });
      if (item.action === 'restore') {
        if (item.type === 'dir') {
          await fs.cp(item.backupAbsPath, item.destinationAbsPath, { recursive: true, force: true, errorOnExist: false });
        } else {
          await fs.mkdir(path.dirname(item.destinationAbsPath), { recursive: true });
          await fs.copyFile(item.backupAbsPath, item.destinationAbsPath);
        }
      }
    }
    entries.push({
      path: item.path,
      action: item.action,
      type: item.type,
    });
  }
  return entries;
}

function summarizeRollback(entries = []) {
  const total = Array.isArray(entries) ? entries.length : 0;
  const restored = entries.filter((entry) => entry.action === 'restore').length;
  const removed = entries.filter((entry) => entry.action === 'remove').length;
  return { total, restored, removed };
}

async function appendRollbackHistory({ manifestAbsPath, manifestRaw, dryRun = false, summary }) {
  if (dryRun) return;
  const history = Array.isArray(manifestRaw.rollbackHistory) ? [...manifestRaw.rollbackHistory] : [];
  history.push({
    rolledBackAt: new Date().toISOString(),
    mode: 'apply',
    summary: {
      total: Number(summary?.total || 0),
      restored: Number(summary?.restored || 0),
      removed: Number(summary?.removed || 0),
    },
  });
  const nextPayload = {
    ...manifestRaw,
    rollbackHistory: history,
  };
  await fs.writeFile(manifestAbsPath, `${JSON.stringify(nextPayload, null, 2)}\n`, 'utf8');
}

function normalizeFormat(raw = 'text') {
  const value = normalizeText(raw).toLowerCase();
  return value === 'json' ? 'json' : 'text';
}

function renderTextResult(result = {}) {
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

function buildJsonFailure(error, options = {}) {
  return {
    ok: false,
    error: normalizeText(error),
    manifestPath: normalizeText(options.manifestPath),
    sessionId: normalizeText(options.sessionId),
    jobId: normalizeText(options.jobId),
    dryRun: options.dryRun === true,
  };
}

export async function runSnapshotRollback(rawOptions = {}, { rootDir, io = console } = {}) {
  const options = {
    manifestPath: normalizeText(rawOptions.manifestPath),
    sessionId: normalizeText(rawOptions.sessionId),
    jobId: normalizeText(rawOptions.jobId),
    dryRun: rawOptions.dryRun === true,
    format: normalizeFormat(rawOptions.format),
  };

  try {
    const resolved = await resolveSnapshotManifest(options, { rootDir });
    const plan = buildRestorePlan({
      rootDir,
      manifest: resolved.manifest,
    });
    if (!options.dryRun) {
      await verifyRestorePlan(plan);
    }
    const entries = await applyRestorePlan(plan, { dryRun: options.dryRun });
    const summary = summarizeRollback(entries);
    await appendRollbackHistory({
      manifestAbsPath: resolved.manifestAbsPath,
      manifestRaw: resolved.manifestRaw,
      dryRun: options.dryRun,
      summary,
    });

    const result = {
      ok: true,
      dryRun: options.dryRun,
      manifestPath: resolved.manifestRelPath,
      backupPath: resolved.manifest.backupPath,
      sessionId: resolved.manifest.sessionId || '',
      jobId: resolved.manifest.jobId || '',
      createdAt: resolved.manifest.createdAt || '',
      restoreHint: resolved.manifest.restoreHint || '',
      summary,
      entries,
    };
    if (options.format === 'json') {
      io.log(JSON.stringify(result, null, 2));
    } else {
      io.log(renderTextResult(result));
    }
    return { exitCode: 0, ...result };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (options.format === 'json') {
      io.log(JSON.stringify(buildJsonFailure(message, options), null, 2));
    } else {
      io.log(`[error] snapshot rollback failed: ${message}`);
    }
    return { exitCode: 1, ok: false, error: message };
  }
}
