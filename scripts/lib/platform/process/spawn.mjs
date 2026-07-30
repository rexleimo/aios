/* 中文注释：进程平台层统一跨系统启动细节，为 shell interception 提供稳定输入。 */
import { spawn, spawnSync } from 'node:child_process';

import { getWindowsDirectCli, shouldUseWindowsShellCommand } from './windows-command.mjs';

/* 中文注释：纯函数把平台参数和 child_process 选项拆开，调用层无需重复处理 platform/execPath。 */
export function splitExecutionOptions(options = {}) {
  const {
    platform = process.platform,
    execPath = process.execPath,
    ...spawnOptions
  } = options;

  return { platform, execPath, spawnOptions };
}

/* 中文注释：统一生成 spawn spec；Windows 下优先直达真实 CLI，只有必要时才走 shell。 */
export function getCommandSpawnSpec(command, args = [], options = {}) {
  const { platform, execPath, spawnOptions } = splitExecutionOptions(options);
  const windowsDirectCli = getWindowsDirectCli(command, { platform, execPath, env: spawnOptions.env });
  if (windowsDirectCli) {
    return {
      command: windowsDirectCli.command,
      args: [...windowsDirectCli.argsPrefix, ...args],
      shell: false,
    };
  }

  return {
    command,
    args,
    shell: shouldUseWindowsShellCommand(command, { platform, env: spawnOptions.env }),
  };
}

/* 中文注释：commandExists 复用 Windows direct-cli 判断，避免 npm/codex 这类 shim 被误判不存在。 */
export function commandExists(name, options = {}) {
  const { platform, execPath, spawnOptions } = splitExecutionOptions(options);
  if (getWindowsDirectCli(name, { platform, execPath, env: spawnOptions.env })) {
    return true;
  }

  const probe = platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(probe, [name], {
    stdio: 'ignore',
    env: spawnOptions.env,
  });
  return result.status === 0;
}

/* 中文注释：同步捕获命令用于轻量探测；输出返回调用方，不直接写终端。 */
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

function terminateTimedOutChild(child) {
  let terminated = false;
  if (process.platform === 'win32' && Number.isInteger(child?.pid) && child.pid > 0) {
    try {
      // Shell shims can leave the real CLI alive after child.kill().
      const result = spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
        stdio: 'ignore',
        windowsHide: true,
      });
      terminated = result.status === 0;
    } catch {
      terminated = false;
    }
  }
  if (!terminated) {
    try {
      child.kill();
    } catch {
      // A close or error event may have won the timeout race.
    }
  }
  for (const stream of [child.stdin, child.stdout, child.stderr]) {
    try {
      stream?.destroy();
    } catch {
      // Streams may already be closed by the process exit race.
    }
  }
  try {
    child.unref();
  } catch {
    // Older child-process handles can omit unref.
  }
}

/* 中文注释：异步 spawn 捕获 stdout/stderr，给 harness/interception 提供可压缩的完整输出。 */
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

    /* 中文注释：这里累积字符串是有意的，后续会进入 compact packet/raw ref，而不是直接进入模型上下文。 */
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
      /* 中文注释：error 和 close 可能竞态触发，settled 保证只返回一次结果。 */
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
        terminateTimedOutChild(child);
        finalize({
          status: 1,
          stdout,
          stderr,
          error: null,
          timedOut: true,
        });
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

/* 中文注释：带输入的 spawn 用于需要 stdin 的客户端；输出捕获策略和 spawnCommand 保持一致。 */
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
      /* 中文注释：stdin EPIPE、timeout、close 都可能到达，统一收敛成一次 resolve。 */
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
        /* 中文注释：忽略 stdin EPIPE，子进程提前退出时由 close/error 收敛。 */
      });
      try {
        child.stdin.setDefaultEncoding('utf8');
      } catch {
        /* 中文注释：编码设置失败不阻断执行，输出仍由事件流处理。 */
      }
      try {
        child.stdin.end(String(input || ''));
      } catch {
        /* 中文注释：stdin 写入失败交给 close/error 统一返回。 */
      }
    }

    if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
      timer = setTimeout(() => {
        timedOut = true;
        terminateTimedOutChild(child);
        finalize({
          status: 1,
          stdout,
          stderr,
          error: null,
          timedOut: true,
        });
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

/* 中文注释：runCommand 用于确实需要继承 stdio 的命令；它不参与 interception 捕获链路。 */
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
