/* 中文注释：MCP proxy 巡检只负责找配置和判断是否已代理，不负责构建能力矩阵。 */
import fs from 'node:fs';
import path from 'node:path';

import { ALL_CLIENTS, getClientMcpTarget } from '../../clients/registry.mjs';
import { isAiosMcpProxyEntry } from './proxy-config.mjs';

/* 中文注释：检查 project、mcp-server 和各客户端真实落点；落点/格式取自 registry 单一事实来源。
   required 仅用于仓库内关键配置。proxy 巡检只对 JSON(mcpServers) 落点有意义，TOML/opencode 形状
   由各自迁移器保证，这里标注 format 供调用方区分。 */
export function collectInterceptionMcpTargets({ rootDir, clientHomes = {} } = {}) {
  const targets = [
    { client: 'project', path: path.join(rootDir, '.mcp.json'), required: true, format: 'json', namespace: 'mcpServers' },
    { client: 'mcp-server', path: path.join(rootDir, 'mcp-server', '.mcp.json'), required: true, format: 'json', namespace: 'mcpServers' },
  ];
  for (const client of ALL_CLIENTS) {
    const desc = getClientMcpTarget(client);
    for (const scopeEntry of desc.scopes) {
      const base = scopeEntry.scope === 'home' ? clientHomes?.[client] : rootDir;
      if (!base) continue;
      targets.push({
        client,
        path: path.join(base, scopeEntry.file),
        required: false,
        format: desc.format,
        namespace: desc.namespace,
      });
    }
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

/* 中文注释：单文件巡检只读配置，不修复，避免 doctor 的检查和修复职责混在一起。
   非 JSON(mcpServers) 落点（codex TOML / opencode mcp 命名空间）此处不解析 mcpServers，
   返回 unsupported 由调用方跳过，避免误报。 */
export function inspectMcpProxyTarget(filePath, { alias = 'puppeteer-stealth', rootDir = '', namespace = 'mcpServers', format = 'json' } = {}) {
  if (!fs.existsSync(filePath)) {
    return { path: filePath, exists: false, hasAlias: false, proxied: false };
  }
  if (format !== 'json') {
    return { path: filePath, exists: true, hasAlias: false, proxied: false, unsupported: true };
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    return { path: filePath, exists: true, hasAlias: false, proxied: false, error: error.message };
  }
  const entry = parsed?.[namespace]?.[alias];
  return {
    path: filePath,
    exists: true,
    hasAlias: Boolean(entry),
    proxied: isAiosMcpProxyEntry(entry, rootDir),
  };
}

/* 中文注释：聚合巡检结果给 proof/doctor 使用，调用方无需理解每个客户端的路径规则。 */
export function inspectMcpProxyTargets({ rootDir, clientHomes = {}, alias = 'puppeteer-stealth', aliases = [] } = {}) {
  const checkAliases = aliases.length > 0 ? aliases : [alias];
  const targets = collectInterceptionMcpTargets({ rootDir, clientHomes });
  return targets.map((target) => {
    const aliasResults = checkAliases.map((checkAlias) => ({
      alias: checkAlias,
      ...inspectMcpProxyTarget(target.path, { alias: checkAlias, rootDir, namespace: target.namespace, format: target.format }),
    }));
    const primary = aliasResults.find((r) => r.alias === alias) || aliasResults[0];
    const allProxied = aliasResults.every((r) => !r.exists || r.proxied || r.unsupported);
    return {
      ...target,
      exists: primary.exists,
      hasAlias: primary.hasAlias,
      proxied: primary.proxied,
      allAliasesProxied: allProxied,
      aliasResults,
    };
  });
}
