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

/* 中文注释：commandExists 复用 Windows direct-cli 判断，避免 npm/codex 这类 shim 被误判不存在。
   windowsHide 是本层的硬保证（和 spawnCommand 一致，写在展开之后，调用方无法覆盖）：
   父进程无控制台时（GUI 客户端 / 桌面壳 / detached 钩子），缺它就会给探针弹一个黑窗。 */
export function commandExists(name, options = {}) {
  const { spawnSyncImpl = spawnSync, ...rest } = options;
  const { platform, execPath, spawnOptions } = splitExecutionOptions(rest);
  if (getWindowsDirectCli(name, { platform, execPath, env: spawnOptions.env })) {
    return true;
  }

  const probe = platform === 'win32' ? 'where' : 'which';
  const result = spawnSyncImpl(probe, [name], {
    stdio: 'ignore',
    env: spawnOptions.env,
    windowsHide: true,
  });
  return result.status === 0;
}

/* 中文注释：同步捕获命令用于轻量探测；输出返回调用方，不直接写终端。 */
export function captureCommand(command, args = [], options = {}) {
  const { spawnSyncImpl = spawnSync, ...rest } = options;
  const { spawnOptions } = splitExecutionOptions(rest);
  const spec = getCommandSpawnSpec(command, args, rest);
  const result = spawnSyncImpl(spec.command, spec.args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...spawnOptions,
    shell: spec.shell ?? spawnOptions.shell ?? false,
    windowsHide: true,
  });

  return {
    status: result.status ?? 1,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error || null,
  };
}

const TREE_TERM_GRACE_MS = 3000;
const TREE_KILL_WAIT_MS = 2000;
const TREE_POLL_INTERVAL_MS = 50;
/* 中文注释：taskkill 自身 RPC 在部分宿主里会挂到它自己的 ~60s 内部超时才失败（A18）；
   kill 升级路径不得继承这个无界等待——封顶后由 child.kill() 兜底。上限需留在
   process-spawn-timeout 测试的 3s 结算预算内（750ms 触发 + 本上限 + 树消失轮询）。 */
const TASKKILL_TIMEOUT_MS = 1500;

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

/* 中文注释：组存活检查用于确认整棵进程树（含孙子进程）是否清理干净；
   EPERM 说明进程仍存在但无权限发信号，按存活处理。 */
function isProcessGroupAlive(pgid) {
  if (!Number.isInteger(pgid) || pgid <= 0) return false;
  try {
    process.kill(-pgid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

/* 中文注释：POSIX 下优先杀进程组（detached spawn 使直接子进程成为组长），
   组信号能覆盖孙子进程；失败时退化为直接子进程 kill，尽量不留孤儿。 */
function signalChildTree(child, { ownsGroup, signal }) {
  const pid = Number(child?.pid);
  if (ownsGroup && Number.isInteger(pid) && pid > 0) {
    try {
      process.kill(-pid, signal);
      return true;
    } catch (error) {
      if (error?.code === 'ESRCH') return false;
      // EPERM 等情况退化为直接子进程杀，尽量清理。
    }
  }
  try {
    child?.kill?.(signal);
    return true;
  } catch {
    return false;
  }
}

function destroyChildStreams(child) {
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

async function waitForChildTreeGone(child, { ownsGroup, timeoutMs }) {
  const deadline = Date.now() + Math.max(0, timeoutMs);
  const pid = Number(child?.pid);
  const check = () => (ownsGroup && Number.isInteger(pid) && pid > 0
    ? isProcessGroupAlive(pid)
    : isProcessAlive(pid));
  while (Date.now() <= deadline) {
    if (!check()) return true;
    await new Promise((resolve) => setTimeout(resolve, TREE_POLL_INTERVAL_MS));
  }
  return !check();
}

/* 中文注释：三段式进程树清理（对齐已在本机其他项目验证过的模式）：
   SIGTERM 树 → 宽限 → SIGKILL 树 → 校验。close 事件不触发也要能结算，
   返回 treeAlive 供上层决定是否 fail-closed。
   taskkillRunner/taskkillTimeoutMs 仅供测试注入假慢杀手（A18 钉定），生产走默认 spawnSync。 */
async function terminateChildTree(child, {
  ownsGroup = false,
  taskkillTimeoutMs = TASKKILL_TIMEOUT_MS,
  taskkillRunner = spawnSync,
} = {}) {
  if (process.platform === 'win32') {
    let terminated = false;
    if (Number.isInteger(child?.pid) && child.pid > 0) {
      try {
        // Shell shims can leave the real CLI alive after child.kill().
        const result = taskkillRunner('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
          stdio: 'ignore',
          windowsHide: true,
          timeout: taskkillTimeoutMs,
          killSignal: 'SIGKILL',
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
    const gone = await waitForChildTreeGone(child, { ownsGroup: false, timeoutMs: TREE_KILL_WAIT_MS });
    destroyChildStreams(child);
    return { killEscalated: !terminated, treeAlive: !gone };
  }

  signalChildTree(child, { ownsGroup, signal: 'SIGTERM' });
  const goneAfterTerm = await waitForChildTreeGone(child, { ownsGroup, timeoutMs: TREE_TERM_GRACE_MS });
  if (goneAfterTerm) {
    destroyChildStreams(child);
    return { killEscalated: false, treeAlive: false };
  }

  signalChildTree(child, { ownsGroup, signal: 'SIGKILL' });
  const goneAfterKill = await waitForChildTreeGone(child, { ownsGroup, timeoutMs: TREE_KILL_WAIT_MS });
  destroyChildStreams(child);
  return { killEscalated: true, treeAlive: !goneAfterKill };
}

/* 中文注释：spawnCommand / spawnCommandWithInput 共享同一套捕获与结算逻辑；
   超时或取消时执行三段式进程树清理，close 不触发也能结算。 */
function spawnCaptured(command, args, options = {}, { provideStdin = false, input = '' } = {}) {
  /* 中文注释：spawnImpl 仅作测试注入，不泄漏进 spawn options（否则会变成子进程的非法选项）。 */
  const { timeoutMs, signal, spawnImpl = spawn, ...rest } = options || {};
  const { spawnOptions } = splitExecutionOptions(rest);
  const spec = getCommandSpawnSpec(command, args, rest);
  /* 中文注释：POSIX 下让子进程成为新进程组组长，超时/取消时可用组信号覆盖孙子进程。 */
  const detached = spawnOptions.detached ?? process.platform !== 'win32';
  const ownsGroup = process.platform !== 'win32' && detached === true;

  return new Promise((resolve) => {
    const child = spawnImpl(spec.command, spec.args, {
      stdio: provideStdin ? ['pipe', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe'],
      ...spawnOptions,
      detached,
      shell: spec.shell ?? spawnOptions.shell ?? false,
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let aborted = false;
    let settled = false;
    let terminating = false;
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

    const beginTermination = (reason) => {
      /* 中文注释：timeout 与 abort 谁先到谁生效；终止过程统一负责最终结算。 */
      if (terminating || settled) return;
      terminating = true;
      if (reason === 'timeout') timedOut = true;
      if (reason === 'abort') aborted = true;
      void terminateChildTree(child, { ownsGroup })
        .then((info) => {
          finalize({
            status: 1,
            stdout,
            stderr,
            error: null,
            childPid: Number.isInteger(child?.pid) ? child.pid : null,
            ...info,
          });
        })
        .catch((error) => {
          destroyChildStreams(child);
          finalize({
            status: 1,
            stdout,
            stderr,
            error: null,
            childPid: Number.isInteger(child?.pid) ? child.pid : null,
            killEscalated: false,
            treeAlive: null,
            terminationError: error?.message || String(error),
          });
        });
    };

    const onAbort = () => beginTermination('abort');

    const detachAbortListener = () => {
      if (signal && typeof onAbort === 'function') {
        try {
          signal.removeEventListener('abort', onAbort);
        } catch {
          // 信号对象可能已被释放；监听器回收失败不影响结算。
        }
      }
    };

    const finalize = (payload) => {
      /* 中文注释：error、close、timeout、abort 可能竞态触发，settled 保证只返回一次结果。 */
      if (settled) return;
      settled = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      detachAbortListener();
      resolve({
        timedOut,
        aborted,
        ...payload,
      });
    };

    if (provideStdin && child.stdin) {
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
        beginTermination('timeout');
      }, Math.floor(timeoutMs));
    }

    if (signal) {
      if (signal.aborted === true) {
        /* 中文注释：已取消的信号下一拍立即清理，避免在 Promise 构造中同步重入。 */
        queueMicrotask(() => beginTermination('abort'));
      } else {
        signal.addEventListener('abort', onAbort, { once: true });
      }
    }

    child.on('error', (error) => {
      if (terminating) return;
      finalize({
        status: 1,
        stdout,
        stderr,
        error,
      });
    });

    child.on('close', (code) => {
      /* 中文注释：终止流程进行中时由清理结果统一结算，避免 close 抢跑丢失树状态。 */
      if (terminating) return;
      finalize({
        status: typeof code === 'number' ? code : 1,
        stdout,
        stderr,
        error: null,
      });
    });
  });
}

/* 中文注释：异步 spawn 捕获 stdout/stderr，给 harness/interception 提供可压缩的完整输出。 */
export function spawnCommand(command, args = [], options = {}) {
  return spawnCaptured(command, args, options, { provideStdin: false });
}

/* 中文注释：带输入的 spawn 用于需要 stdin 的客户端；输出捕获策略和 spawnCommand 保持一致。 */
export function spawnCommandWithInput(command, args = [], options = {}) {
  const { input = '', ...rest } = options || {};
  return spawnCaptured(command, args, rest, { provideStdin: true, input });
}

/* 中文注释：runCommand 用于确实需要继承 stdio 的命令；它不参与 interception 捕获链路。 */
export function runCommand(command, args = [], options = {}) {
  const { spawnSyncImpl = spawnSync, ...rest } = options;
  const { spawnOptions } = splitExecutionOptions(rest);
  const spec = getCommandSpawnSpec(command, args, rest);
  /* 中文注释：stdio inherit 的调用同样要 windowsHide——继承的是一份「无窗口控制台」，
     不是「新建窗口」；shell-mcp-server 早已这样用，这里补齐同一语义。 */
  const result = spawnSyncImpl(spec.command, spec.args, {
    stdio: 'inherit',
    ...spawnOptions,
    shell: spec.shell ?? spawnOptions.shell ?? false,
    windowsHide: true,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`Command failed (${result.status}): ${command} ${args.join(' ')}`.trim());
  }

  return result;
}

/* 中文注释：导出仅供测试钉定 A18（taskkill 封顶）；生产代码不得绕过 spawnCommand 直接终止进程树。 */
export { terminateChildTree, TASKKILL_TIMEOUT_MS };
