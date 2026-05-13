import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const WINDOWS_SHELL_COMMANDS = new Set(['codex', 'claude', 'gemini', 'opencode', 'kiro-cli']);

function getEnvCaseInsensitive(env, key) {
  if (!env) return '';
  if (key in env) return env[key];
  const lowerKey = key.toLowerCase();
  const match = Object.keys(env).find((candidate) => candidate.toLowerCase() === lowerKey);
  return match ? env[match] : '';
}

function splitWindowsPathEntries(rawPathValue = '') {
  const entries = String(rawPathValue || '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.replace(/^"(.*)"$/u, '$1'));
  return entries;
}

function splitWindowsPathExt(rawPathExt = '') {
  const parts = String(rawPathExt || '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const normalized = part.startsWith('.') ? part : `.${part}`;
      return normalized.toLowerCase();
    });
  return parts;
}

function resolveWindowsCommandExt(command, env = process.env) {
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

function resolveWindowsCommandPath(command, env = process.env) {
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

function splitExecutionOptions(options = {}) {
  const {
    platform = process.platform,
    execPath = process.execPath,
    ...spawnOptions
  } = options;

  return { platform, execPath, spawnOptions };
}

function findFirstExisting(paths) {
  for (const candidate of paths) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function resolveNodeScriptFromWindowsLauncher(launcherPath) {
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
  const quotedPathRegex = /["']([^"'\r\n]*?\.js)["']/giu;
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

function getWindowsNodeCli(command, { platform = process.platform, execPath = process.execPath, env = process.env } = {}) {
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

function shouldUseWindowsShellCommand(command, { platform = process.platform, env = process.env } = {}) {
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

export function getCommandSpawnSpec(command, args = [], options = {}) {
  const { platform, execPath, spawnOptions } = splitExecutionOptions(options);
  const windowsNodeCli = getWindowsNodeCli(command, { platform, execPath, env: spawnOptions.env });
  if (windowsNodeCli) {
    return {
      command: windowsNodeCli.command,
      args: [...windowsNodeCli.argsPrefix, ...args],
      shell: false,
    };
  }

  return {
    command,
    args,
    shell: shouldUseWindowsShellCommand(command, { platform, env: spawnOptions.env }),
  };
}

export function commandExists(name, options = {}) {
  const { platform, execPath, spawnOptions } = splitExecutionOptions(options);
  if (getWindowsNodeCli(name, { platform, execPath, env: spawnOptions.env })) {
    return true;
  }

  const probe = platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(probe, [name], {
    stdio: 'ignore',
    env: spawnOptions.env,
  });
  return result.status === 0;
}

export function captureCommand(command, args = [], options = {}) {
  const { spawnOptions } = splitExecutionOptions(options);
  const spec = getCommandSpawnSpec(command, args, options);
  const result = spawnSync(spec.command, spec.args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...spawnOptions,
    shell: spec.shell ?? spawnOptions.shell ?? false,
  });

  return {
    status: result.status ?? 1,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error || null,
  };
}

export function spawnCommand(command, args = [], options = {}) {
  const { timeoutMs, ...rest } = options || {};
  const { spawnOptions } = splitExecutionOptions(rest);
  const spec = getCommandSpawnSpec(command, args, rest);

  return new Promise((resolve) => {
    const child = spawn(spec.command, spec.args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      ...spawnOptions,
      shell: spec.shell ?? spawnOptions.shell ?? false,
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;
    let timer = null;

    if (child.stdout) {
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk) => {
        stdout += String(chunk);
      });
    }

    if (child.stderr) {
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (chunk) => {
        stderr += String(chunk);
      });
    }

    const finalize = (payload) => {
      if (settled) return;
      settled = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      resolve(payload);
    };

    if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
      timer = setTimeout(() => {
        timedOut = true;
        try {
          child.kill();
        } catch {
          // ignore kill errors
        }
      }, Math.floor(timeoutMs));
    }

    child.on('error', (error) => {
      finalize({
        status: 1,
        stdout,
        stderr,
        error,
        timedOut,
      });
    });

    child.on('close', (code) => {
      finalize({
        status: typeof code === 'number' ? code : 1,
        stdout,
        stderr,
        error: null,
        timedOut,
      });
    });
  });
}

export function spawnCommandWithInput(command, args = [], options = {}) {
  const { timeoutMs, input = '', ...rest } = options || {};
  const { spawnOptions } = splitExecutionOptions(rest);
  const spec = getCommandSpawnSpec(command, args, rest);

  return new Promise((resolve) => {
    const child = spawn(spec.command, spec.args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      ...spawnOptions,
      shell: spec.shell ?? spawnOptions.shell ?? false,
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;
    let timer = null;

    if (child.stdout) {
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk) => {
        stdout += String(chunk);
      });
    }

    if (child.stderr) {
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (chunk) => {
        stderr += String(chunk);
      });
    }

    const finalize = (payload) => {
      if (settled) return;
      settled = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      resolve(payload);
    };

    if (child.stdin) {
      child.stdin.on('error', () => {
        // Ignore stdin pipe errors (e.g., EPIPE when the child exits early).
      });
      try {
        child.stdin.setDefaultEncoding('utf8');
      } catch {
        // ignore encoding errors
      }
      try {
        child.stdin.end(String(input || ''));
      } catch {
        // ignore stdin write errors
      }
    }

    if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
      timer = setTimeout(() => {
        timedOut = true;
        try {
          child.kill();
        } catch {
          // ignore kill errors
        }
      }, Math.floor(timeoutMs));
    }

    child.on('error', (error) => {
      finalize({
        status: 1,
        stdout,
        stderr,
        error,
        timedOut,
      });
    });

    child.on('close', (code) => {
      finalize({
        status: typeof code === 'number' ? code : 1,
        stdout,
        stderr,
        error: null,
        timedOut,
      });
    });
  });
}

export function runCommand(command, args = [], options = {}) {
  const { spawnOptions } = splitExecutionOptions(options);
  const spec = getCommandSpawnSpec(command, args, options);
  const result = spawnSync(spec.command, spec.args, {
    stdio: 'inherit',
    ...spawnOptions,
    shell: spec.shell ?? spawnOptions.shell ?? false,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`Command failed (${result.status}): ${command} ${args.join(' ')}`.trim());
  }

  return result;
}
