import { CLIENT_MCP_ENTRY_OVERRIDES, CRG_MCP_ALIAS } from '../constants.mjs';

export function buildCrgMcpServerEntry(clientKey) {
  const entry = {
    command: 'uvx',
    args: ['code-review-graph', 'serve'],
    type: 'stdio',
  };
  return { ...entry, ...(CLIENT_MCP_ENTRY_OVERRIDES[clientKey] || {}) };
}

export function buildCrgMcpServerEntryForProject(clientKey, projectRoot) {
  const entry = buildCrgMcpServerEntry(clientKey);
  entry.cwd = projectRoot;
  return entry;
}

// 纯函数：统一判断 JSON/TOML 解析后的节点是否为普通对象。
export function isObjectRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

// 纯函数：识别 code-review-graph serve 入口，兼容数组命令和 command+args 两种客户端格式。
export function isCrgServeEntry(entry) {
  if (!isObjectRecord(entry)) return false;
  if (entry.enabled === false) return false;

  if (Array.isArray(entry.command)) {
    const command = entry.command.map((part) => String(part || ''));
    return command[0] === 'uvx' && command[1] === CRG_MCP_ALIAS && command.includes('serve');
  }

  const command = String(entry.command || '');
  const args = Array.isArray(entry.args) ? entry.args.map((part) => String(part || '')) : [];
  return command === 'uvx' && args[0] === CRG_MCP_ALIAS && args.includes('serve');
}