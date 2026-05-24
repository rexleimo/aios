/* 中文注释：MCP 层在 JSON-RPC 边界压缩 tools/list 与 tools/call，同时保持协议兼容。 */
import { createInterceptionEngine } from '../core/engine.mjs';
import { extractToolCallText } from './tools-call-shrink.mjs';
import { buildToolsListPacket } from './tools-list-packet.mjs';

/* 中文注释：JSON-RPC proxy 保持 id/result/error 形状不变，只替换 result 的体积，确保 MCP 客户端无感接入。 */
export function createJsonRpcProxyHandler({ forward, workspaceRoot, sessionId = 'default', host = 'generic-mcp', thresholds, now, metrics }) {
  if (typeof forward !== 'function') throw new TypeError('json-rpc proxy forward function is required');

  return async function handleJsonRpcMessage(message) {
    const response = await forward(message);
    if (!response || typeof response !== 'object' || !('result' in response)) return response;

    if (message?.method === 'tools/list') {
      /* 中文注释：tools/list 返回精简目录，同时把完整 schema 存成 ref，避免能力发现丢失。 */
      return {
        ...response,
        result: await buildToolsListPacket({
          result: response.result,
          workspaceRoot,
          sessionId,
          host,
          now,
          metrics,
        }),
      };
    }

    if (message?.method === 'tools/call') {
      const engine = createInterceptionEngine({ workspaceRoot, thresholds, now, metrics });
      /* 中文注释：tools/call 结果先展开成文本，再复用同一个 engine，保证 MCP 和 shell 的 packet/metrics 一致。 */
      const text = extractToolCallText(response.result);
      const packet = await engine.interceptToolResult({
        kind: 'mcp.tools_call',
        host,
        sessionId,
        cwd: workspaceRoot,
        payload: {
          toolName: message?.params?.name || '',
          output: text,
          exitCode: 0,
        },
        metadata: { originalMethod: message.method },
      });
      return { ...response, result: packet };
    }

    return response;
  };
}
