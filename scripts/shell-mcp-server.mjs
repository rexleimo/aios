#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';

const SHELL_TOOL = {
  name: 'aios_shell',
  description: 'Execute shell commands through the AIOS MCP server. Use this instead of the host Bash tool for all non-interactive commands. Supports environment variable prefixes, chained commands with && and ||, and common shell operations.',
  inputSchema: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'Shell command to execute',
      },
      cwd: {
        type: 'string',
        description: 'Working directory (defaults to project root or CWD)',
      },
      timeout: {
        type: 'number',
        description: 'Timeout in milliseconds (default: 120000)',
      },
    },
    required: ['command'],
  },
};

function makeResponse(id, result) {
  return { jsonrpc: '2.0', id, result };
}

function makeError(id, code, message) {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

/* 中文注释：杀掉整个进程树。Windows 上 child.kill 只杀 cmd.exe 本身，
   node/npm/git 等孙进程会残留并继续占用资源，必须用 taskkill /T /F。 */
function killProcessTree(pid) {
  if (!pid) return;
  if (process.platform === 'win32') {
    try {
      spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    } catch {
      /* taskkill 失败时退化为直接 kill */
    }
  }
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    /* 进程已不存在 */
  }
}

/* 中文注释：执行命令并返回 {stdout, stderr, exitCode, timedOut, cancelled}。
   - 超时或取消时先杀进程树，再等待 close 事件统一 resolve，保证不泄漏子进程。
   - onCancel(cancelFn) 注册取消回调，供 notifications/cancelled 触发。
   - 超时/取消后仍返回已收集的部分输出，方便客户端看到命令走到哪一步。 */
function executeCommand(command, cwd, timeout, { onCancel } = {}) {
  return new Promise((resolve) => {
    const limit = Math.min(Math.max(timeout || 120000, 1000), 300000);
    let killed = false;
    let cancelRequested = false;
    const child = spawn(process.platform === 'win32' ? 'cmd' : '/bin/sh', [
      process.platform === 'win32' ? '/c' : '-c',
      command,
    ], {
      cwd: cwd || process.cwd(),
      env: { ...process.env },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const finish = (extra = {}) => {
      if (typeof onCancel === 'function') {
        onCancel(null);
      }
      resolve({
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
        exitCode: killed ? -1 : (exitCodeRef ?? 0),
        timedOut: killed && !cancelRequested,
        cancelled: cancelRequested,
        ...extra,
      });
    };

    let exitCodeRef = null;

    const timer = setTimeout(() => {
      killed = true;
      killProcessTree(child.pid);
      setTimeout(() => {
        try { child.kill('SIGKILL'); } catch {}
      }, 5000);
    }, limit);

    const stdout = [];
    const stderr = [];
    child.stdout?.on('data', (chunk) => stdout.push(chunk));
    child.stderr?.on('data', (chunk) => stderr.push(chunk));

    /* 中文注释：注册取消回调。pending map 里存的就是这个函数；取消时杀树并标记。 */
    if (typeof onCancel === 'function') {
      onCancel(() => {
        cancelRequested = true;
        killed = true;
        clearTimeout(timer);
        killProcessTree(child.pid);
      });
    }

    child.on('error', (error) => {
      clearTimeout(timer);
      finish({ exitCode: 1, stderr: error.message, stdout: '' });
    });

    child.on('close', (code) => {
      exitCodeRef = code;
      clearTimeout(timer);
      finish();
    });
  });
}

async function handleToolsCall(id, params, { pending } = {}) {
  const { command, cwd, timeout } = params || {};
  if (!command || typeof command !== 'string') {
    return makeError(id, -32602, 'Missing or invalid "command" parameter');
  }

  /* 中文注释：把 cancel 回调注册进 pending map，供 notifications/cancelled 按 requestId 找到并触发。 */
  const result = await executeCommand(command.trim(), cwd, timeout, {
    onCancel: (cancelFn) => {
      if (pending) {
        if (cancelFn) {
          pending.set(id, { cancel: cancelFn });
        } else {
          pending.delete(id);
        }
      }
    },
  });
  if (pending) {
    pending.delete(id);
  }

  const content = [];

  if (result.cancelled) {
    content.push({
      type: 'text',
      text: `Command cancelled by client interrupt\n${result.stdout}${result.stderr}`,
    });
  } else if (result.exitCode !== 0) {
    content.push({
      type: 'text',
      text: `Exit code: ${result.exitCode}${result.timedOut ? ' (timed out)' : ''}\n${result.stderr}\n${result.stdout}`,
    });
  } else if (result.stderr) {
    content.push(
      { type: 'text', text: result.stdout },
      { type: 'text', text: `[stderr] ${result.stderr}` },
    );
  } else {
    content.push({ type: 'text', text: result.stdout });
  }

  return makeResponse(id, { content });
}

/* 中文注释：处理单条 JSON-RPC 消息。
   pending 是 {requestId -> {cancel}} 的共享 map；tools/call 注册、cancelled 通知触发、完成后删除。
   除 tools/call 外的消息都同步返回，不阻塞主循环。 */
async function handleMessage(message, { pending } = {}) {
  if (!message || typeof message !== 'object') return undefined;

  /* 中文注释：客户端中断（Esc / abort）时按 requestId 取消对应命令，立即杀进程树。
     通知类消息无 id，必须放在 id 检查之前处理，否则会被提前拦截。 */
  if (message.method === 'notifications/cancelled') {
    const requestId = message?.params?.requestId;
    if (requestId !== undefined && requestId !== null && pending?.has(requestId)) {
      const entry = pending.get(requestId);
      pending.delete(requestId);
      if (entry && typeof entry.cancel === 'function') {
        entry.cancel();
      }
    }
    return undefined;
  }

  if (typeof message.id === 'undefined') return undefined;

  if (message.method === 'initialize') {
    return makeResponse(message.id, {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'aios-shell', version: '1.0.0' },
    });
  }

  if (message.method === 'tools/list') {
    return makeResponse(message.id, { tools: [SHELL_TOOL] });
  }

  if (message.method === 'tools/call') {
    const toolName = message?.params?.name;
    if (toolName === 'aios_shell') {
      return handleToolsCall(message.id, message.params?.arguments || message.params, { pending });
    }
    return makeError(message.id, -32601, `Unknown tool: ${toolName}`);
  }

  /* 中文注释：客户端中断（Esc / abort）时按 requestId 取消对应命令，立即杀进程树。
     通知类消息无 id，返回 undefined 表示无响应。 */
  if (message.method === 'notifications/initialized' || message.method === 'ping') {
    return message.method === 'ping' ? makeResponse(message.id, {}) : undefined;
  }

  return makeResponse(message.id, { capabilities: {}, tools: [] });
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1]?.endsWith('shell-mcp-server.mjs')) {
  const lines = createInterface({ input: process.stdin });
  /* 中文注释：并发处理每条消息，不 await 串行。长命令执行期间 ping / cancelled /
     其它请求仍能被即时响应，避免客户端在工具调用期间完全无响应（空转卡死）。 */
  const pending = new Map();
  for await (const line of lines) {
    if (!line.trim()) continue;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', error: { code: -32700, message: 'Parse error' }, id: null })}\n`);
      continue;
    }
    Promise.resolve(handleMessage(message, { pending })).then((response) => {
      if (response) process.stdout.write(`${JSON.stringify(response)}\n`);
    });
  }
  /* 中文注释：stdin 关闭后清理所有仍在运行的命令，防止孤儿进程。 */
  for (const entry of pending.values()) {
    if (entry && typeof entry.cancel === 'function') entry.cancel();
  }
}

export { handleMessage, executeCommand, SHELL_TOOL };
