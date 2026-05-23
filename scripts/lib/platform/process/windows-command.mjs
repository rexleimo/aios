import fs from 'node:fs';
import path from 'node:path';

import { resolveClientCommandNames } from '../../clients/registry.mjs';

import { getEnvCaseInsensitive, splitWindowsPathEntries, splitWindowsPathExt } from './env.mjs';

const WINDOWS_SHELL_COMMANDS = new Set(resolveClientCommandNames('all'));
const WINDOWS_LAUNCHER_TARGET_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.exe', '.com']);
const WINDOWS_NODE_SCRIPT_EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);
const WINDOWS_NATIVE_EXTENSIONS = new Set(['.exe', '.com']);

function normalizeWindowsLauncherPath(rawPath, launcherDir) {
  const normalized = String(rawPath || '')
    .trim()
    .replace(/%~dp0/giu, '')
    .replace(/%dp0%/giu, '')
    .replace(/\$basedir/giu, '')
    .replace(/^[/\\]+/u, '')
    .replace(/\\/gu, path.sep)
    .replace(/\//gu, path.sep);

  if (!normalized) return '';
  return path.resolve(launcherDir, normalized);
}

// 纯函数：从 Windows 启动器里解析可直达的真实入口，避免把原生 exe 也误判成 shell fallback。
export function resolveWindowsLauncherTarget(launcherPath, { execPath = process.execPath } = {}) {
  const ext = path.extname(launcherPath).toLowerCase();
  if (!['.cmd', '.bat', '.ps1'].includes(ext)) {
    return null;
  }

  let content = '';
  try {
    content = fs.readFileSync(launcherPath, 'utf8');
  } catch {
    return null;
  }

  const launcherDir = path.dirname(launcherPath);
  const quotedPathRegex = /["']([^"'\r\n]+?)["']/gu;
  const candidates = [];

  for (const match of content.matchAll(quotedPathRegex)) {
    const candidatePath = normalizeWindowsLauncherPath(match[1], launcherDir);
    if (!candidatePath) continue;

    const targetExt = path.extname(candidatePath).toLowerCase();
    if (!WINDOWS_LAUNCHER_TARGET_EXTENSIONS.has(targetExt)) continue;
    if (!fs.existsSync(candidatePath)) continue;

    candidates.push({ path: candidatePath, ext: targetExt });
  }

  const nodeScript = candidates.find((candidate) => WINDOWS_NODE_SCRIPT_EXTENSIONS.has(candidate.ext));
  if (nodeScript) return { kind: 'node', command: execPath, argsPrefix: [nodeScript.path] };

  const nativeExecutable = candidates.find((candidate) => WINDOWS_NATIVE_EXTENSIONS.has(candidate.ext));
  if (nativeExecutable) return { kind: 'native', command: nativeExecutable.path, argsPrefix: [] };

  return null;
}

export function resolveWindowsCommandExt(command, env = process.env) {
  const base = path.basename(command).trim();
  if (!base) return '';

  const directExt = path.extname(base).toLowerCase();
  if (directExt) return directExt;

  const pathValue = getEnvCaseInsensitive(env, 'PATH') || '';
  const pathExtValue = getEnvCaseInsensitive(env, 'PATHEXT') || '.COM;.EXE;.BAT;.CMD';
  const dirs = splitWindowsPathEntries(pathValue);
  const exts = splitWindowsPathExt(pathExtValue);

  for (const dir of dirs) {
    for (const ext of exts) {
      const candidate = path.join(dir, `${base}${ext}`);
      if (fs.existsSync(candidate)) {
        return ext;
      }
    }
  }

  return '';
}

export function resolveWindowsCommandPath(command, env = process.env) {
  const raw = String(command || '').trim();
  if (!raw) return '';

  const hasExplicitPath = raw.includes('\\') || raw.includes('/') || raw.includes(':');
  if (hasExplicitPath) {
    if (fs.existsSync(raw)) {
      return path.resolve(raw);
    }
    return '';
  }

  const pathValue = getEnvCaseInsensitive(env, 'PATH') || '';
  const pathExtValue = getEnvCaseInsensitive(env, 'PATHEXT') || '.COM;.EXE;.BAT;.CMD';
  const dirs = splitWindowsPathEntries(pathValue);
  const exts = splitWindowsPathExt(pathExtValue);

  const directExt = path.extname(raw).toLowerCase();
  if (directExt) {
    for (const dir of dirs) {
      const candidate = path.join(dir, raw);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
    return '';
  }

  for (const dir of dirs) {
    for (const ext of exts) {
      const candidate = path.join(dir, `${raw}${ext}`);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }

  return '';
}

export function findFirstExisting(paths) {
  for (const candidate of paths) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

export function resolveNodeScriptFromWindowsLauncher(launcherPath) {
  const target = resolveWindowsLauncherTarget(launcherPath);
  if (target?.kind === 'node') return target.argsPrefix[0] || '';
  return '';
}

export function getWindowsDirectCli(command, { platform = process.platform, execPath = process.execPath, env = process.env } = {}) {
  if (platform !== 'win32' || !fs.existsSync(execPath)) {
    return null;
  }

  const nodeDir = path.dirname(execPath);
  const npmCli = findFirstExisting([
    path.join(nodeDir, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    path.join(nodeDir, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ]);

  const npxCli = findFirstExisting([
    path.join(nodeDir, 'node_modules', 'npm', 'bin', 'npx-cli.js'),
    path.join(nodeDir, '..', 'lib', 'node_modules', 'npm', 'bin', 'npx-cli.js'),
  ]);

  if (command === 'npm' && npmCli) {
    return { command: execPath, argsPrefix: [npmCli] };
  }

  if (command === 'npx') {
    if (npxCli) {
      return { command: execPath, argsPrefix: [npxCli] };
    }

    if (npmCli) {
      return { command: execPath, argsPrefix: [npmCli, 'exec', '--'] };
    }
  }

  const commandBase = path.basename(String(command || ''), path.extname(String(command || ''))).toLowerCase();
  if (WINDOWS_SHELL_COMMANDS.has(commandBase)) {
    const launcherPath = resolveWindowsCommandPath(command, env);
    if (launcherPath) {
      const cliEntry = resolveWindowsLauncherTarget(launcherPath, { execPath });
      if (cliEntry) {
        return cliEntry;
      }
    }
  }

  return null;
}

export function getWindowsNodeCli(command, options = {}) {
  const direct = getWindowsDirectCli(command, options);
  if (direct?.kind === 'node') {
    return { command: direct.command, argsPrefix: direct.argsPrefix };
  }
  return null;
}

export function shouldUseWindowsShellCommand(command, { platform = process.platform, env = process.env } = {}) {
  if (platform !== 'win32') {
    return false;
  }

  const normalized = path.basename(command).toLowerCase();
  const extension = path.extname(normalized);
  if (extension === '.cmd' || extension === '.bat') {
    return true;
  }

  if (extension.length > 0) {
    return false;
  }

  if (!WINDOWS_SHELL_COMMANDS.has(normalized)) {
    return false;
  }

  const resolvedExt = resolveWindowsCommandExt(normalized, env);
  if (resolvedExt === '.cmd' || resolvedExt === '.bat') {
    return true;
  }

  if (resolvedExt) {
    return false;
  }

  return true;
}
