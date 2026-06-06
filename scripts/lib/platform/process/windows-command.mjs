/* 中文注释：进程平台层统一跨系统启动细节，为 shell interception 提供稳定输入。 */
import fs from 'node:fs';
import path from 'node:path';

import { resolveClientCommandNames } from '../../clients/registry.mjs';

import { getEnvCaseInsensitive, splitWindowsPathEntries, splitWindowsPathExt } from './env.mjs';

const WINDOWS_SHELL_COMMANDS = new Set(resolveClientCommandNames('all'));
const WINDOWS_LAUNCHER_TARGET_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.exe', '.com']);
const WINDOWS_NODE_SCRIPT_EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);
const WINDOWS_NATIVE_EXTENSIONS = new Set(['.exe', '.com']);
const WINDOWS_WRAPPER_CANDIDATES = ['cli-wrapper.cjs', 'cli.js', 'cli.mjs', 'index.js', 'index.mjs'];

/* 中文注释：Windows shim 文件里的路径经常带 %~dp0/$basedir，这里归一成真实绝对路径。 */
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

function getWindowsCommandSearchDirs(env = process.env) {
  const pathValue = getEnvCaseInsensitive(env, 'PATH') || '';
  const dirs = splitWindowsPathEntries(pathValue);
  const appData = String(getEnvCaseInsensitive(env, 'APPDATA') || '').trim();
  if (appData) {
    dirs.push(path.join(appData, 'npm'));
  }

  return Array.from(new Set(dirs.filter(Boolean).map((dir) => path.resolve(dir))));
}

function isLikelyWindowsBinary(filePath) {
  try {
    const fd = fs.openSync(filePath, 'r');
    try {
      const buffer = Buffer.alloc(2);
      const bytesRead = fs.readSync(fd, buffer, 0, 2, 0);
      return bytesRead === 2 && buffer[0] === 0x4d && buffer[1] === 0x5a;
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return false;
  }
}

function findWindowsLauncherNodeWrapper(nativeExecutablePath) {
  const executableDir = path.dirname(nativeExecutablePath);
  const packageRoot = path.dirname(executableDir);
  for (const candidateName of WINDOWS_WRAPPER_CANDIDATES) {
    const candidatePath = path.join(packageRoot, candidateName);
    const ext = path.extname(candidatePath).toLowerCase();
    if (!WINDOWS_NODE_SCRIPT_EXTENSIONS.has(ext)) continue;
    if (!fs.existsSync(candidatePath)) continue;
    return candidatePath;
  }

  return '';
}

/* 中文注释：从 Windows 启动器解析真实入口，优先绕过 .cmd/.ps1 shim，减少 shell quoting 和中文路径问题。 */
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
  if (nativeExecutable) {
    if (isLikelyWindowsBinary(nativeExecutable.path)) {
      return { kind: 'native', command: nativeExecutable.path, argsPrefix: [] };
    }

    const wrapperPath = findWindowsLauncherNodeWrapper(nativeExecutable.path);
    if (wrapperPath) {
      return { kind: 'node', command: execPath, argsPrefix: [wrapperPath] };
    }
  }

  return null;
}

/* 中文注释：按 PATHEXT 查命令扩展名，用于判断裸命令最终会命中 .cmd/.bat 还是原生 exe。 */
export function resolveWindowsCommandExt(command, env = process.env) {
  const base = path.basename(command).trim();
  if (!base) return '';

  const directExt = path.extname(base).toLowerCase();
  if (directExt) return directExt;

  const pathExtValue = getEnvCaseInsensitive(env, 'PATHEXT') || '.COM;.EXE;.BAT;.CMD';
  const dirs = getWindowsCommandSearchDirs(env);
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

/* 中文注释：解析命令真实路径；显式路径必须存在，裸命令按 PATH/PATHEXT 搜索。 */
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

  const pathExtValue = getEnvCaseInsensitive(env, 'PATHEXT') || '.COM;.EXE;.BAT;.CMD';
  const dirs = getWindowsCommandSearchDirs(env);
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

/* 中文注释：按候选顺序返回第一个存在的运行时入口，避免硬编码单一 Node 安装布局。 */
export function findFirstExisting(paths) {
  for (const candidate of paths) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

/* 中文注释：兼容旧调用方：只需要 node script 路径时，从 launcher target 里取 argsPrefix[0]。 */
export function resolveNodeScriptFromWindowsLauncher(launcherPath) {
  const target = resolveWindowsLauncherTarget(launcherPath);
  if (target?.kind === 'node') return target.argsPrefix[0] || '';
  return '';
}

/* 中文注释：为 npm/npx/codex/claude/gemini/opencode 这类 shim 找到可直达入口，尽量避免 shell。 */
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

/* 中文注释：只返回 Node CLI 入口，给需要明确 node script 的调用方使用。 */
export function getWindowsNodeCli(command, options = {}) {
  const direct = getWindowsDirectCli(command, options);
  if (direct?.kind === 'node') {
    return { command: direct.command, argsPrefix: direct.argsPrefix };
  }
  return null;
}

/* 中文注释：只有无法直达真实 CLI 且命中 .cmd/.bat 时才走 shell，降低参数转义风险。 */
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
