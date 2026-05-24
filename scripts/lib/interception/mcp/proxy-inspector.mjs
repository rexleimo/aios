/* 中文注释：MCP proxy 巡检只负责找配置和判断是否已代理，不负责构建能力矩阵。 */
import fs from 'node:fs';
import path from 'node:path';

import { isAiosMcpProxyEntry } from './proxy-config.mjs';

/* 中文注释：检查 project、mcp-server 和已发现客户端 home；required 仅用于仓库内关键配置。 */
export function collectInterceptionMcpTargets({ rootDir, clientHomes = {} } = {}) {
  const targets = [
    { client: 'project', path: path.join(rootDir, '.mcp.json'), required: true },
    { client: 'mcp-server', path: path.join(rootDir, 'mcp-server', '.mcp.json'), required: true },
  ];
  for (const client of ['codex', 'claude', 'gemini', 'opencode']) {
    const home = clientHomes?.[client];
    if (!home) continue;
    targets.push({ client, path: path.join(home, 'mcp.json'), required: false });
  }
  const seen = new Set();
  return targets
    .filter((target) => {
      const abs = path.resolve(target.path);
      if (seen.has(abs)) return false;
      seen.add(abs);
      return true;
    })
    .map((target) => ({ ...target, path: path.resolve(target.path) }));
}

/* 中文注释：单文件巡检只读配置，不修复，避免 doctor 的检查和修复职责混在一起。 */
export function inspectMcpProxyTarget(filePath, { alias = 'puppeteer-stealth', rootDir = '' } = {}) {
  if (!fs.existsSync(filePath)) {
    return { path: filePath, exists: false, hasAlias: false, proxied: false };
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    return { path: filePath, exists: true, hasAlias: false, proxied: false, error: error.message };
  }
  const entry = parsed?.mcpServers?.[alias];
  return {
    path: filePath,
    exists: true,
    hasAlias: Boolean(entry),
    proxied: isAiosMcpProxyEntry(entry, rootDir),
  };
}

/* 中文注释：聚合巡检结果给 proof/doctor 使用，调用方无需理解每个客户端的路径规则。 */
export function inspectMcpProxyTargets({ rootDir, clientHomes = {}, alias = 'puppeteer-stealth' } = {}) {
  return collectInterceptionMcpTargets({ rootDir, clientHomes }).map((target) => ({
    ...target,
    ...inspectMcpProxyTarget(target.path, { alias, rootDir }),
  }));
}
