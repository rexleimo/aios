import { existsSync } from 'node:fs';
import { prepareSoloWorktree } from '../../harness/solo-worktree.mjs';

export async function resolveResumeWorktree({ rootDir, summary } = {}) {
  const existing = summary?.worktree && typeof summary.worktree === 'object'
    ? summary.worktree
    : null;
  if (!existing?.enabled) {
    return existing || { enabled: false, baseRef: 'HEAD', path: '', preserved: false, cleanupReason: '' };
  }

  if (existing.path && existsSync(existing.path)) {
    return existing;
  }

  try {
    const prepared = await prepareSoloWorktree({
      rootDir,
      sessionId: summary.sessionId,
      objective: summary.objective,
      enabled: true,
      baseRef: existing.baseRef || 'HEAD',
    });
    return {
      enabled: true,
      baseRef: prepared.baseRef,
      path: prepared.path,
      workspacePath: prepared.workspacePath,
      preserved: false,
      cleanupReason: '',
      initialHead: prepared.initialHead,
    };
  } catch {
    return {
      ...existing,
      enabled: false,
      preserved: false,
      cleanupReason: 'resume-worktree-unavailable',
    };
  }
}
