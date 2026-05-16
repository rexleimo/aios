import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const AIOS_STATE_DIRNAME = '.aios';
export const CONTEXT_DB_DIRNAME = 'context-db';
export const CONTEXT_DB_RELATIVE_PATH = path.join(AIOS_STATE_DIRNAME, CONTEXT_DB_DIRNAME);
export const LEGACY_CONTEXT_DB_RELATIVE_PATH = path.join('memory', 'context-db');

function expandHome(inputPath: string, homeDir: string = os.homedir()): string {
  if (inputPath === '~') return homeDir;
  if (inputPath.startsWith('~/')) return path.join(homeDir, inputPath.slice(2));
  return inputPath;
}

function normalizeWorkspaceRoot(workspaceRoot: string): string {
  return path.resolve(workspaceRoot || process.cwd());
}

export function resolveAiosStateRoot(workspaceRoot: string, env: NodeJS.ProcessEnv = process.env): string {
  const raw = String(env.AIOS_PROJECT_STATE_DIR || '').trim();
  if (raw) {
    const expanded = expandHome(raw);
    return path.isAbsolute(expanded)
      ? path.resolve(expanded)
      : path.resolve(normalizeWorkspaceRoot(workspaceRoot), expanded);
  }
  return path.join(normalizeWorkspaceRoot(workspaceRoot), AIOS_STATE_DIRNAME);
}

export function resolveLegacyContextDbRoot(workspaceRoot: string): string {
  return path.join(normalizeWorkspaceRoot(workspaceRoot), LEGACY_CONTEXT_DB_RELATIVE_PATH);
}

export function resolveContextDbRoot(
  workspaceRoot: string,
  options: { preferLegacyExisting?: boolean; env?: NodeJS.ProcessEnv } = {}
): string {
  const root = normalizeWorkspaceRoot(workspaceRoot);
  const dotdirRoot = path.join(resolveAiosStateRoot(root, options.env), CONTEXT_DB_DIRNAME);
  const legacyRoot = resolveLegacyContextDbRoot(root);
  if (options.preferLegacyExisting === true && existsSync(legacyRoot) && !existsSync(dotdirRoot)) {
    return legacyRoot;
  }
  return dotdirRoot;
}

export function toWorkspaceRelative(workspaceRoot: string, absolutePath: string): string {
  return path.relative(normalizeWorkspaceRoot(workspaceRoot), path.resolve(absolutePath)).replace(/\\/g, '/');
}
