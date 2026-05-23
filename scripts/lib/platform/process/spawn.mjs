import { spawn, spawnSync } from 'node:child_process';

import { getWindowsNodeCli, shouldUseWindowsShellCommand } from './windows-command.mjs';

// 纯函数：把平台参数和 child_process 选项拆开，避免调用层重复处理 platform/execPath。
export function splitExecutionOptions(options = {}) {
  const {
    platform = process.platform,
    execPath = process.execPath,
    ...spawnOptions
  } = options;

  return { platform, execPath, spawnOptions };
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
