/* 中文注释：MCP 层在 JSON-RPC 边界压缩 tools/list 与 tools/call，同时保持协议兼容。 */
import { createInterceptionEngine } from '../core/engine.mjs';
import { extractToolCallText } from './tools-call-shrink.mjs';
import { buildToolsListPacket } from './tools-list-packet.mjs';

/* 中文注释：JSON-RPC proxy 保持标准 MCP result 形状，只把 AIOS 压缩证据附加到 _meta.aios。 */
export function createJsonRpcProxyHandler({ forward, workspaceRoot, sessionId = 'default', host = 'generic-mcp', thresholds, now, metrics }) {
  if (typeof forward !== 'function') throw new TypeError('json-rpc proxy forward function is required');

  return async function handleJsonRpcMessage(message) {
    if (!Object.prototype.hasOwnProperty.call(message ?? {}, 'id')) {
      Promise.resolve(forward(message, { expectResponse: false })).catch(() => {});
      return undefined;
    }

    const response = await forward(message);
    if (!response || typeof response !== 'object' || !('result' in response)) return response;

    if (message?.method === 'tools/list') {
      if (!isObjectRecord(response.result) || !Array.isArray(response.result.tools)) return response;
      /* 中文注释：tools/list 必须保留 inputSchema 等标准字段，严格 MCP 客户端才会接受。 */
      return {
        ...response,
        result: attachAiosMetadata(
          response.result,
          await buildToolsListPacket({
            result: response.result,
            workspaceRoot,
            sessionId,
            host,
            now,
            metrics,
          }),
        ),
      };
    }

    if (message?.method === 'tools/call') {
      if (!isObjectRecord(response.result) || !Array.isArray(response.result.content)) return response;
      const engine = createInterceptionEngine({ workspaceRoot, thresholds, now, metrics });
      /* 中文注释：tools/call 的内容仅用于生成观测 packet；协议载荷必须原样交给客户端。 */
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
      return {
        ...response,
        result: attachAiosMetadata(response.result, packet),
      };
    }

    return response;
  };
}

function attachAiosMetadata(result, aios) {
  return {
    ...result,
    _meta: {
      ...(isObjectRecord(result?._meta) ? result._meta : {}),
      aios,
    },
  };
}

function isObjectRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
