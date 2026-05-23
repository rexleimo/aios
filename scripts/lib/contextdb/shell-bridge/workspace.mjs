import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { AIOS_MARKERS, BLOCKED_SUBCOMMANDS } from './constants.mjs';
import { normalizeForCompare, parseBoolEnv } from './shared.mjs';

export function runGit(cwd, args) {
  return spawnSync('git', ['-C', cwd, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

export function detectWorkspaceRoot(cwd) {
  const result = runGit(cwd, ['rev-parse', '--show-toplevel']);
  if (result.status === 0) {
    const workspace = (result.stdout || '').trim();
    if (workspace) return workspace;
  }
  return path.resolve(cwd);
}

export function shouldWrapWorkspace(workspace, env) {
  const mode = (env.CTXDB_WRAP_MODE || 'repo-only').trim().toLowerCase();

  switch (mode) {
    case 'all':
      return true;
    case 'repo-only': {
      const rootpath = env.ROOTPATH;
      if (!rootpath) return false;
      return normalizeForCompare(rootpath) === normalizeForCompare(workspace);
    }
    case 'opt-in': {
      const marker = env.CTXDB_MARKER_FILE || '.contextdb-enable';
      return existsSync(path.join(workspace, marker));
    }
    case 'off':
    case 'disabled':
    case 'none':
      return false;
    default:
      // 未知模式保持历史行为：倾向包装，避免旧环境变量导致功能静默失效。
      return true;
  }
}

export function isBlockedSubcommand(command, firstArg) {
  if (!firstArg) return false;
  const blocked = BLOCKED_SUBCOMMANDS[command];
  if (!blocked) return false;
  return blocked.has(firstArg);
}

export function detectAiosMarker(workspace) {
  const configFiles = ['CLAUDE.md', 'AGENTS.md', 'GEMINI.md'];
  for (const file of configFiles) {
    try {
      const content = readFileSync(path.join(workspace, file), 'utf8');
      if (AIOS_MARKERS.some((marker) => content.includes(marker))) return { found: true, file };
    } catch {
      // 配置文件不存在时继续检查其他客户端配置。
    }
  }
  return { found: false, file: '' };
}

export function detectRunner(env) {
  if (env.CTXDB_RUNNER && existsSync(env.CTXDB_RUNNER)) {
    return { command: env.CTXDB_RUNNER, args: [] };
  }

  const rootPathCandidates = [env.AIOS_ROOT_DIR, env.AIOS_ROOT, env.ROOTPATH];
  for (const rootpath of rootPathCandidates) {
    if (!rootpath) continue;
    const candidate = path.join(rootpath, 'scripts', 'ctx-agent.mjs');
    if (existsSync(candidate)) {
      return { command: 'node', args: [candidate] };
    }
  }

  return null;
}

export function shouldAutoCreateMarker(env) {
  return parseBoolEnv(env.CTXDB_AUTO_CREATE_MARKER, true);
}

export function tryEnsureOptInMarker(workspace, env) {
  const marker = env.CTXDB_MARKER_FILE || '.contextdb-enable';
  const markerPath = path.join(workspace, marker);

  if (existsSync(markerPath)) {
    return { created: false, error: '' };
  }

  if (!shouldAutoCreateMarker(env)) {
    return { created: false, error: '' };
  }

  try {
    writeFileSync(markerPath, '', { encoding: 'utf8', flag: 'wx' });
    return { created: true, error: '' };
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST') {
      return { created: false, error: '' };
    }
    const message = error instanceof Error ? error.message : String(error);
    return { created: false, error: message };
  }
}
