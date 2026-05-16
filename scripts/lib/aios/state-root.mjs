import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const AIOS_STATE_DIRNAME = '.aios';
export const CONTEXT_DB_DIRNAME = 'context-db';
export const TASKS_DIRNAME = 'tasks';
export const WORKSPACE_DIRNAME = 'workspace';
export const LEGACY_CONTEXT_DB_RELATIVE_PATH = path.join('memory', 'context-db');
export const LEGACY_TASKS_RELATIVE_PATH = 'tasks';
export const LEGACY_WORKSPACE_RELATIVE_PATH = path.join('memory', 'workspace');

function expandHome(inputPath, homeDir = os.homedir()) {
  if (!inputPath) return inputPath;
  if (inputPath === '~') return homeDir;
  if (inputPath.startsWith('~/')) return path.join(homeDir, inputPath.slice(2));
  return inputPath;
}

function normalizeWorkspaceRoot(workspaceRoot) {
  return path.resolve(workspaceRoot || process.cwd());
}

function resolveConfiguredStateRoot(workspaceRoot, env = process.env) {
  const raw = String(env.AIOS_PROJECT_STATE_DIR || '').trim();
  if (!raw) return '';
  const expanded = expandHome(raw);
  return path.isAbsolute(expanded)
    ? path.resolve(expanded)
    : path.resolve(normalizeWorkspaceRoot(workspaceRoot), expanded);
}

export function resolveAiosStateRoot(workspaceRoot, { env = process.env } = {}) {
  return resolveConfiguredStateRoot(workspaceRoot, env) || path.join(normalizeWorkspaceRoot(workspaceRoot), AIOS_STATE_DIRNAME);
}

export function resolveLegacyContextDbRoot(workspaceRoot) {
  return path.join(normalizeWorkspaceRoot(workspaceRoot), LEGACY_CONTEXT_DB_RELATIVE_PATH);
}

export function resolveContextDbRoot(workspaceRoot, { env = process.env, preferLegacyExisting = false } = {}) {
  const legacyRoot = resolveLegacyContextDbRoot(workspaceRoot);
  if (preferLegacyExisting && existsSync(legacyRoot) && !existsSync(path.join(resolveAiosStateRoot(workspaceRoot, { env }), CONTEXT_DB_DIRNAME))) {
    return legacyRoot;
  }
  return path.join(resolveAiosStateRoot(workspaceRoot, { env }), CONTEXT_DB_DIRNAME);
}

export function resolveContextDbPath(workspaceRoot, ...segments) {
  return path.join(resolveContextDbRoot(workspaceRoot), ...segments);
}

export function resolveLegacyTasksRoot(workspaceRoot) {
  return path.join(normalizeWorkspaceRoot(workspaceRoot), LEGACY_TASKS_RELATIVE_PATH);
}

export function resolveTasksRoot(workspaceRoot, { env = process.env, preferLegacyExisting = false } = {}) {
  const legacyRoot = resolveLegacyTasksRoot(workspaceRoot);
  if (preferLegacyExisting && existsSync(legacyRoot) && !existsSync(path.join(resolveAiosStateRoot(workspaceRoot, { env }), TASKS_DIRNAME))) {
    return legacyRoot;
  }
  return path.join(resolveAiosStateRoot(workspaceRoot, { env }), TASKS_DIRNAME);
}

export function resolveLegacyWorkspaceRoot(workspaceRoot) {
  return path.join(normalizeWorkspaceRoot(workspaceRoot), LEGACY_WORKSPACE_RELATIVE_PATH);
}

export function resolveWorkspaceStateRoot(workspaceRoot, { env = process.env, preferLegacyExisting = false } = {}) {
  const legacyRoot = resolveLegacyWorkspaceRoot(workspaceRoot);
  if (preferLegacyExisting && existsSync(legacyRoot) && !existsSync(path.join(resolveAiosStateRoot(workspaceRoot, { env }), WORKSPACE_DIRNAME))) {
    return legacyRoot;
  }
  return path.join(resolveAiosStateRoot(workspaceRoot, { env }), WORKSPACE_DIRNAME);
}

export function toWorkspaceRelative(workspaceRoot, absolutePath) {
  const relative = path.relative(normalizeWorkspaceRoot(workspaceRoot), path.resolve(absolutePath));
  return relative.split(path.sep).join('/');
}

export function contextDbRelativePath(workspaceRoot, ...segments) {
  return toWorkspaceRelative(workspaceRoot, path.join(resolveContextDbRoot(workspaceRoot), ...segments));
}

export function tasksRelativePath(workspaceRoot, ...segments) {
  return toWorkspaceRelative(workspaceRoot, path.join(resolveTasksRoot(workspaceRoot), ...segments));
}

export function workspaceStateRelativePath(workspaceRoot, ...segments) {
  return toWorkspaceRelative(workspaceRoot, path.join(resolveWorkspaceStateRoot(workspaceRoot), ...segments));
}
