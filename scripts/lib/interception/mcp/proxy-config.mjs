/* 中文注释：MCP proxy 配置构建只关心“如何包一层代理”，不读取能力矩阵。 */
import path from 'node:path';

/* 中文注释：检测 server block 是否已经指向 AIOS proxy，供迁移和 doctor 共用。 */
export function isAiosMcpProxyEntry(entry, rootDir = '') {
  if (!entry || typeof entry !== 'object') return false;
  const args = Array.isArray(entry.args) ? entry.args.map(String) : [];
  const joined = args.join('\n');
  if (joined.includes('aios-mcp-proxy.mjs')) return true;
  const command = String(entry.command || '');
  return command.includes('aios-mcp-proxy.mjs') || (rootDir && joined.includes(path.join(rootDir, 'scripts', 'aios-mcp-proxy.mjs')));
}

/* 中文注释：把原 upstream 包一层 stdio proxy；alias 不变，客户端无感接入 interception 数据面。 */
export function buildAiosMcpProxyServer({ rootDir, upstream, host = 'generic-mcp', workspaceRoot = rootDir } = {}) {
  if (!rootDir) throw new Error('rootDir is required for AIOS MCP proxy config');
  if (!upstream || typeof upstream !== 'object') throw new Error('upstream MCP server entry is required');
  const upstreamCommand = String(upstream.command || '').trim();
  if (!upstreamCommand) throw new Error('upstream MCP server command is required');
  const upstreamArgs = Array.isArray(upstream.args) ? upstream.args.map(String) : [];
  const upstreamEnv = upstream && typeof upstream.env === 'object' && !Array.isArray(upstream.env) ? upstream.env : {};

  return {
    type: 'stdio',
    command: process.execPath,
    args: [
      path.join(rootDir, 'scripts', 'aios-mcp-proxy.mjs'),
      '--workspace',
      workspaceRoot || rootDir,
      '--host',
      host,
      '--',
      upstreamCommand,
      ...upstreamArgs,
    ],
    env: {
      ...upstreamEnv,
      AIOS_INTERCEPTION_METRICS: '1',
      AIOS_MCP_PROXY: '1',
      AIOS_MCP_UPSTREAM_HOST: host,
    },
  };
}

/* 中文注释：迁移前先拆出原 upstream，避免重复套娃代理。 */
export function unwrapAiosMcpProxyEntry(entry) {
  if (!entry || typeof entry !== 'object' || !Array.isArray(entry.args)) return null;
  const args = entry.args.map(String);
  const sep = args.indexOf('--');
  if (sep < 0 || sep === args.length - 1) return null;
  return {
    type: 'stdio',
    command: args[sep + 1],
    args: args.slice(sep + 2),
    env: entry.env && typeof entry.env === 'object' ? { ...entry.env } : {},
  };
}
