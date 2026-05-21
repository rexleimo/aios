import path from 'node:path';
import { readFile } from 'node:fs/promises';

const WORKSPACE_SCOPED_COMMANDS = new Set([
  'harness',
  'hud',
  'memo',
  'orchestrate',
  'team',
  'quality-gate',
  'snapshot-rollback',
  'entropy-gc',
  'learn-eval',
  'release-status',
  'perception',
  'refs',
  'canvas',
]);

export function resolveRuntimeWorkspace(command, options = {}, { rootDir, projectRoot } = {}) {
  if (!WORKSPACE_SCOPED_COMMANDS.has(command)) return rootDir;
  const explicit = String(options.workspaceRoot || options.rootDir || '').trim();
  if (explicit) return path.resolve(explicit);
  return projectRoot;
}

export async function loadWorkspaceConfig(workspaceRoot) {
  const settingsPath = path.join(workspaceRoot, 'config', 'settings.json');
  try {
    return JSON.parse(await readFile(settingsPath, 'utf8'));
  } catch {
    return {};
  }
}

export async function getRuntimeVersion(rootDir) {
  try {
    return (await readFile(path.join(rootDir, 'VERSION'), 'utf8')).trim();
  } catch {
    return 'unknown';
  }
}

export function buildTeamRuntimeEnv(options = {}, baseEnv = process.env) {
  const runtimeEnv = { ...baseEnv };
  const clientId = String(options.clientId || '').trim();
  if (clientId) {
    runtimeEnv.AIOS_SUBAGENT_CLIENT = clientId;
  }
  if (runtimeEnv.AIOS_MODEL_ROUTER === undefined) {
    runtimeEnv.AIOS_MODEL_ROUTER = '1';
  }
  const workers = Number.parseInt(String(options.workers ?? '').trim(), 10);
  if (Number.isFinite(workers) && workers > 0) {
    runtimeEnv.AIOS_SUBAGENT_CONCURRENCY = String(workers);
  }
  if (String(options.executionMode || '').trim().toLowerCase() === 'live') {
    runtimeEnv.AIOS_EXECUTE_LIVE = '1';
  }
  return runtimeEnv;
}
