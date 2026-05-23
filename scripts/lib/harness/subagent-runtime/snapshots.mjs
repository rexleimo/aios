import { promises as fs } from 'node:fs';
import path from 'node:path';

import { resolveOwnedPathPrefixes } from './file-policy.mjs';
import {
  normalizeText,
  normalizeWorkspaceRelativePath,
  safeFileSlug,
  toPosixPath,
} from './text.mjs';

export function formatSnapshotTimestamp(ts = new Date()) {
  return ts.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

async function readPathState(absPath) {
  try {
    const details = await fs.lstat(absPath);
    if (details.isDirectory()) {
      return { exists: true, type: 'dir' };
    }
    return { exists: true, type: 'file' };
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return { exists: false, type: 'missing' };
    }
    throw error;
  }
}

async function copySnapshotTarget(sourceAbsPath, backupAbsPath, type) {
  if (type === 'dir') {
    await fs.cp(sourceAbsPath, backupAbsPath, { recursive: true, force: true, errorOnExist: false });
    return;
  }
  await fs.mkdir(path.dirname(backupAbsPath), { recursive: true });
  await fs.copyFile(sourceAbsPath, backupAbsPath);
}

function buildPreMutationRestoreHint(manifestPath, backupPath) {
  const manifest = normalizeText(manifestPath);
  const backup = normalizeText(backupPath);
  if (!manifest || !backup) return '';
  return `Restore manually from ${backup} using ${manifest} target metadata.`;
}

function resolveSnapshotDirectory({ sessionId, stamp, jobId }) {
  const slug = safeFileSlug(jobId || 'job');
  const dirName = `pre-mutation-${stamp}-${slug}`;
  if (sessionId) {
    return path.join('.aios', 'context-db', 'sessions', sessionId, 'artifacts', dirName);
  }
  return path.join('.aios', 'subagent-snapshots', dirName);
}

export async function createPreMutationSnapshot({ rootDir, sessionId, job, phase, io }) {
  const rawTargets = resolveOwnedPathPrefixes(phase, job);
  const targets = [...new Set(rawTargets
    .map((item) => normalizeWorkspaceRelativePath(item))
    .filter(Boolean))];
  if (targets.length === 0) {
    return null;
  }

  const createdAt = new Date();
  const stamp = formatSnapshotTimestamp(createdAt);
  const snapshotRelDir = toPosixPath(resolveSnapshotDirectory({
    sessionId: normalizeText(sessionId),
    stamp,
    jobId: normalizeText(job?.jobId),
  }));
  const backupRelDir = toPosixPath(path.join(snapshotRelDir, 'backup'));
  const manifestRelPath = toPosixPath(path.join(snapshotRelDir, 'manifest.json'));
  const backupAbsDir = path.join(rootDir, backupRelDir);
  const manifestAbsPath = path.join(rootDir, manifestRelPath);

  await fs.mkdir(backupAbsDir, { recursive: true });
  const targetStates = [];
  for (const target of targets) {
    const sourceAbsPath = path.join(rootDir, target);
    const state = await readPathState(sourceAbsPath);
    targetStates.push({
      path: target,
      existed: state.exists,
      type: state.type,
    });
    if (state.exists) {
      const backupTargetPath = path.join(backupAbsDir, target);
      await copySnapshotTarget(sourceAbsPath, backupTargetPath, state.type);
    }
  }

  const manifest = {
    schemaVersion: 1,
    kind: 'orchestration.pre-mutation-snapshot',
    createdAt: createdAt.toISOString(),
    sessionId: normalizeText(sessionId),
    jobId: normalizeText(job?.jobId),
    phaseId: normalizeText(phase?.id),
    role: normalizeText(job?.role) || normalizeText(phase?.role),
    targets: targetStates,
    backupPath: backupRelDir,
    restoreHint: buildPreMutationRestoreHint(manifestRelPath, backupRelDir),
  };

  await fs.mkdir(path.dirname(manifestAbsPath), { recursive: true });
  await fs.writeFile(manifestAbsPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  io?.log?.(`[subagent-runtime] pre-mutation snapshot created job=${normalizeText(job?.jobId)} targets=${targets.length} manifest=${manifestRelPath}`);

  return {
    enabled: true,
    createdAt: manifest.createdAt,
    targetCount: targetStates.length,
    manifestPath: manifestRelPath,
    backupPath: backupRelDir,
    restoreHint: manifest.restoreHint,
  };
}

export function withPreMutationSnapshot(jobRun, snapshot = null) {
  if (!snapshot || !jobRun || typeof jobRun !== 'object') {
    return jobRun;
  }
  return {
    ...jobRun,
    preMutationSnapshot: snapshot,
  };
}
