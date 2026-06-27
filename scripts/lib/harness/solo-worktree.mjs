import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { normalizeText } from '../../../src/shared/normalize.mjs';

function runGit(rootDir, args) {
  const result = spawnSync('git', args, {
    cwd: rootDir,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `git ${args.join(' ')} failed`);
  }
  return String(result.stdout || '').trim();
}

function shouldPreserveForStatus(finalStatus = '') {
  const normalized = normalizeText(finalStatus).toLowerCase();
  return normalized === 'blocked'
    || normalized === 'human-gate'
    || normalized === 'stopped'
    || normalized === 'failed'
    || normalized === 'backoff';
}

export async function prepareSoloWorktree({
  rootDir,
  sessionId = '',
  objective = '',
  enabled = false,
  baseRef = 'HEAD',
} = {}) {
  if (enabled !== true) {
    return {
      enabled: false,
      baseRef: normalizeText(baseRef, 'HEAD'),
      path: '',
      workspacePath: '',
      preserved: false,
      cleanupReason: '',
      initialHead: '',
      sessionId: normalizeText(sessionId),
      objective: normalizeText(objective),
    };
  }

  const prefix = `aios-solo-harness-${normalizeText(sessionId, 'session')}-`;
  const workspacePath = await mkdtemp(path.join(os.tmpdir(), prefix));
  await mkdir(workspacePath, { recursive: true });
  const worktreePath = path.join(workspacePath, 'repo');

  runGit(rootDir, ['worktree', 'add', '--detach', worktreePath, normalizeText(baseRef, 'HEAD')]);
  const initialHead = runGit(worktreePath, ['rev-parse', 'HEAD']);

  return {
    enabled: true,
    baseRef: normalizeText(baseRef, 'HEAD'),
    path: worktreePath,
    workspacePath,
    preserved: false,
    cleanupReason: '',
    initialHead,
    sessionId: normalizeText(sessionId),
    objective: normalizeText(objective),
  };
}

export async function detectSoloWorktreeChanges({ worktree } = {}) {
  if (!worktree?.enabled || !worktree?.path) {
    return {
      changed: false,
      hasDirtyFiles: false,
      headChanged: false,
      statusShort: '',
      currentHead: '',
    };
  }

  const statusShort = runGit(worktree.path, ['status', '--short']);
  const currentHead = runGit(worktree.path, ['rev-parse', 'HEAD']);
  const hasDirtyFiles = Boolean(normalizeText(statusShort));
  const headChanged = Boolean(normalizeText(worktree.initialHead)) && currentHead !== worktree.initialHead;

  return {
    changed: hasDirtyFiles || headChanged,
    hasDirtyFiles,
    headChanged,
    statusShort,
    currentHead,
  };
}

export async function finalizeSoloWorktree({
  rootDir,
  worktree,
  preserveOnChange = true,
  finalStatus = '',
  forceCleanup = false,
} = {}) {
  if (!worktree?.enabled || !worktree?.path) {
    return {
      enabled: false,
      baseRef: normalizeText(worktree?.baseRef, 'HEAD'),
      path: '',
      workspacePath: '',
      preserved: false,
      cleanupReason: '',
    };
  }

  const changes = await detectSoloWorktreeChanges({ worktree });
  const preserve = forceCleanup !== true
    && (
      (preserveOnChange === true && changes.changed)
      || shouldPreserveForStatus(finalStatus)
    );

  if (preserve) {
    return {
      ...worktree,
      preserved: true,
      cleanupReason: changes.changed ? 'changes-detected' : `status-${normalizeText(finalStatus, 'preserved')}`,
    };
  }

  try {
    runGit(rootDir || worktree.path, ['worktree', 'remove', '--force', worktree.path]);
  } finally {
    if (worktree.workspacePath) {
      await rm(worktree.workspacePath, { recursive: true, force: true });
    }
  }

  return {
    ...worktree,
    path: '',
    workspacePath: '',
    preserved: false,
    cleanupReason: forceCleanup === true ? 'force-cleanup' : 'no-output',
  };
}
