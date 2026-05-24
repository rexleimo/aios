/* 中文注释：MCP 层在 JSON-RPC 边界压缩 tools/list 与 tools/call，同时保持协议兼容。 */
export { shrinkToolsList } from './tools-list-shrink.mjs';
export { extractToolCallText } from './tools-call-shrink.mjs';
export { createJsonRpcProxyHandler } from './json-rpc-proxy.mjs';
export { runJsonRpcStdioProxy } from './stdio-proxy.mjs';
