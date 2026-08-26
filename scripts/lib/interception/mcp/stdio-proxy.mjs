/* 中文注释：MCP 层在 JSON-RPC 边界压缩 tools/list 与 tools/call，同时保持协议兼容。 */
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

import { createJsonRpcProxyHandler } from './json-rpc-proxy.mjs';

/* 中文注释：stdio proxy 像透明管道一样连接客户端和上游 MCP，只在响应回来时插入压缩处理。 */
export async function runJsonRpcStdioProxy({ command, args = [], cwd = process.cwd(), env = process.env, workspaceRoot = cwd, sessionId = 'default', host = 'generic-mcp', stdin = process.stdin, stdout = process.stdout, stderr = process.stderr, spawnImpl = spawn, metrics } = {}) {
  if (!command) throw new TypeError('MCP proxy command is required');

  const child = spawnImpl(command, args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  child.on?.('error', error => stderr.write(`[aios-mcp-proxy] upstream failed: ${error.message}\n`));
  child.stderr?.on('data', chunk => stderr.write(chunk));

  const pending = new Map();
  const childLines = createInterface({ input: child.stdout });
  childLines.on('line', line => {
    if (!line.trim()) return;
    let message;
    try { message = JSON.parse(line); }
    catch { stderr.write(`[aios-mcp-proxy] invalid upstream JSON: ${line}\n`); return; }
    const resolver = pending.get(message.id);
    if (resolver) {
      pending.delete(message.id);
      resolver(message);
    }
  });

  /* 中文注释：JSON-RPC 通过 id 匹配请求和响应；pending map 保证并发请求返回时不会串包。 */
  const forward = (message, { expectResponse = true } = {}) => new Promise(resolve => {
    if (!expectResponse) {
      child.stdin.write(`${JSON.stringify(message)}\n`);
      resolve(undefined);
      return;
    }
    pending.set(message.id, resolve);
    child.stdin.write(`${JSON.stringify(message)}\n`);
  });

  const handler = createJsonRpcProxyHandler({ forward, workspaceRoot, sessionId, host, metrics });
  /* 中文注释：并发处理 stdin 的每条 JSON-RPC 消息，不 await 串行。
     长命令执行期间（上游 tools/call 等待中），ping / notifications/cancelled / 其它
     请求仍能即时转发到上游，避免客户端在工具调用期间完全无响应（空转卡死）。
     通知类消息（无 id）由 handler 内部 fire-and-forget 转发，天然不受长命令阻塞。 */
  const inputLines = createInterface({ input: stdin });
  for await (const line of inputLines) {
    if (!line.trim()) continue;
    Promise.resolve(handleJsonRpcProxyLine(line, handler)).then((response) => {
      if (response) stdout.write(`${JSON.stringify(response)}\n`);
    });
  }

  child.stdin.end();
}

/* 中文注释：单行处理函数单独导出，方便测试不启动真实子进程也能验证 parse error 和压缩行为。 */
export async function handleJsonRpcProxyLine(line, handler) {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return { jsonrpc: '2.0', error: { code: -32700, message: 'Parse error' }, id: null };
  }
  return handler(message);
}
