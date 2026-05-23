import fs from 'node:fs';
import path from 'node:path';

import { resolveClientCommandNames } from '../../clients/registry.mjs';

import { getEnvCaseInsensitive, splitWindowsPathEntries, splitWindowsPathExt } from './env.mjs';

const WINDOWS_SHELL_COMMANDS = new Set(resolveClientCommandNames('all'));

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
  const ext = path.extname(launcherPath).toLowerCase();
  if (!['.cmd', '.bat', '.ps1'].includes(ext)) {
    return '';
  }

  let content = '';
  try {
    content = fs.readFileSync(launcherPath, 'utf8');
  } catch {
    return '';
  }

  const launcherDir = path.dirname(launcherPath);
  const candidates = [];
  const quotedPathRegex = /["']([^"'\r\n]*?\.(?:c|m)?js)["']/giu;
  for (const match of content.matchAll(quotedPathRegex)) {
    const rawPath = String(match[1] || '').trim();
    if (!rawPath) continue;

    const normalized = rawPath
      .replace(/%~dp0/giu, '')
      .replace(/%dp0%/giu, '')
      .replace(/\$basedir/giu, '')
      .replace(/^[/\\]+/u, '')
      .replace(/\\/gu, path.sep)
      .replace(/\//gu, path.sep);

    if (!normalized) continue;
    candidates.push(path.resolve(launcherDir, normalized));
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return '';
}

export function getWindowsNodeCli(command, { platform = process.platform, execPath = process.execPath, env = process.env } = {}) {
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
      const cliEntry = resolveNodeScriptFromWindowsLauncher(launcherPath);
      if (cliEntry) {
        return { command: execPath, argsPrefix: [cliEntry] };
      }
    }
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
