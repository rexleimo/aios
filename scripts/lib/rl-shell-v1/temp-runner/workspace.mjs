import { access, cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { validateTaskManifest } from '../schema.mjs';

export function createEnv() {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  return env;
}

export function isWithinRoot(rootPath, candidatePath) {
  const resolvedRoot = path.resolve(rootPath);
  const resolvedCandidate = path.resolve(candidatePath);
  return resolvedCandidate === resolvedRoot || resolvedCandidate.startsWith(`${resolvedRoot}${path.sep}`);
}

export function resolveWorkspacePath(workspace, relativePath) {
  if (path.isAbsolute(relativePath)) {
    throw new Error('Path must stay inside the temp workspace root');
  }
  const resolvedPath = path.resolve(workspace.repoPath, relativePath);
  if (!isWithinRoot(workspace.repoPath, resolvedPath)) {
    throw new Error('Resolved path escapes the temp workspace root');
  }
  return resolvedPath;
}

export function assertWorkspaceState(workspace) {
  if (!workspace || typeof workspace !== 'object') {
    throw new Error('Workspace is required');
  }
  if (!workspace.repoPath || !workspace.workspacePath) {
    throw new Error('Unsafe runner state: workspace paths are missing');
  }
}

export async function ensureWorkspaceReadable(workspace) {
  assertWorkspaceState(workspace);
  try {
    await access(workspace.repoPath);
  } catch {
    throw new Error('Workspace repo is unreadable');
  }
}

export async function createEpisodeWorkspace({ taskManifest, rootDir }) {
  const manifest = validateTaskManifest(taskManifest);
  const resolvedRoot = path.resolve(rootDir);
  const sourceRepoPath = path.isAbsolute(manifest.repo_source_path)
    ? manifest.repo_source_path
    : path.join(resolvedRoot, manifest.repo_source_path);
  await access(sourceRepoPath);

  const episodeRoot = path.join(resolvedRoot, 'episodes');
  await mkdir(episodeRoot, { recursive: true });
  const workspacePath = await mkdtemp(path.join(episodeRoot, `${manifest.task_id}-`));
  const repoPath = path.join(workspacePath, 'repo');
  await cp(sourceRepoPath, repoPath, { recursive: true });

  const observationTracePath = path.join(workspacePath, 'observation-trace.jsonl');
  await writeFile(observationTracePath, '', 'utf8');

  return {
    taskManifest: manifest,
    workspacePath,
    repoPath,
    observationTracePath,
    observations: [],
    startedAt: Date.now(),
  };
}

export async function destroyEpisodeWorkspace(workspace) {
  assertWorkspaceState(workspace);
  await rm(workspace.workspacePath, { recursive: true, force: true });
}
