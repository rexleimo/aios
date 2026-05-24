#!/usr/bin/env node
/* 中文注释：MCP server 代理入口在客户端和上游服务之间插入 AIOS 压缩数据面。 */
import { createJsonRpcProxyHandler } from './lib/interception/mcp/json-rpc-proxy.mjs';
import { runJsonRpcStdioProxy } from './lib/interception/mcp/stdio-proxy.mjs';

export { createJsonRpcProxyHandler, runJsonRpcStdioProxy };

export function createProxyHandlerForServer(options) {
  return createJsonRpcProxyHandler(options);
}

/* 中文注释：脚本被直接执行时进入 stdio proxy 模式；被测试 import 时只导出可组合函数。 */
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1]?.endsWith('aios-mcp-proxy.mjs')) {
  const args = process.argv.slice(2);
  /* 中文注释：-- 左侧是 AIOS proxy 参数，右侧是原 MCP server 命令，避免两边参数名冲突。 */
  const sep = args.indexOf('--');
  const proxyArgs = sep >= 0 ? args.slice(0, sep) : args;
  const commandArgs = sep >= 0 ? args.slice(sep + 1) : [];
  const command = commandArgs[0];
  const realArgs = commandArgs.slice(1);
  const sessionIndex = proxyArgs.indexOf('--session');
  const workspaceIndex = proxyArgs.indexOf('--workspace');
  const hostIndex = proxyArgs.indexOf('--host');

  /* 中文注释：启动后 proxy 会保持 stdio 长连接，逐条 JSON-RPC 请求转发并压缩响应。 */
  runJsonRpcStdioProxy({
    command,
    args: realArgs,
    workspaceRoot: workspaceIndex >= 0 ? proxyArgs[workspaceIndex + 1] : process.cwd(),
    sessionId: sessionIndex >= 0 ? proxyArgs[sessionIndex + 1] : process.env.AIOS_SESSION_ID || 'default',
    host: hostIndex >= 0 ? proxyArgs[hostIndex + 1] : 'generic-mcp',
    metrics: { enabled: process.env.AIOS_INTERCEPTION_METRICS !== '0' },
  }).catch(error => {
    process.stderr.write(`[aios-mcp-proxy] ${error.message}\n`);
    process.exitCode = 1;
  });
}
