import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function runGit(rootDir, args) {
  const result = spawnSync('git', args, {
    windowsHide: true,
    cwd: rootDir,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `git ${args.join(' ')} failed`);
  }
  return result.stdout.trim();
}

export async function createEpisodeWorktree({ rootDir, runId, taskId, ref = 'HEAD' }) {
  const baseDir = await mkdtemp(path.join(os.tmpdir(), `aios-rl-shadow-${runId}-${taskId}-`));
  const worktreePath = path.join(baseDir, 'repo');
  await mkdir(baseDir, { recursive: true });
  runGit(rootDir, ['worktree', 'add', '--detach', worktreePath, ref]);

  const observationTracePath = path.join(baseDir, 'observation-trace.jsonl');
  await writeFile(observationTracePath, '', 'utf8');

  return {
    rootDir,
    workspacePath: baseDir,
    worktreePath,
    repoPath: worktreePath,
    observationTracePath,
    observations: [],
    startedAt: Date.now(),
    worktree_ref: ref,
    run_id: runId,
    task_id: taskId,
  };
}

export async function destroyEpisodeWorktree(workspace) {
  if (!workspace?.worktreePath) {
    return;
  }
  runGit(workspace.rootDir, ['worktree', 'remove', '--force', workspace.worktreePath]);
  await rm(workspace.workspacePath, { recursive: true, force: true });
}
