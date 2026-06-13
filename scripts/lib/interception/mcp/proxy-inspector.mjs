/* 中文注释：MCP proxy 巡检只负责找配置和判断是否已代理，不负责构建能力矩阵。 */
import fs from 'node:fs';
import path from 'node:path';

import { ALL_CLIENTS, getClientMcpTarget } from '../../clients/registry.mjs';
import { PRIMARY_BROWSER_ALIAS } from '../../components/browser/constants.mjs';
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

/* 中文注释：单文件巡检只读配置，不修复，避免 doctor 的检查和修复职责混在一起。 */
export function inspectMcpProxyTarget(filePath, { alias = PRIMARY_BROWSER_ALIAS, rootDir = '', namespace = 'mcpServers', format = 'json' } = {}) {
  if (!fs.existsSync(filePath)) {
    return { path: filePath, exists: false, hasAlias: false, proxied: false };
  }
  if (format === 'toml') return inspectTomlMcpProxyTarget(filePath, { alias, rootDir });
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    return { path: filePath, exists: true, hasAlias: false, proxied: false, error: error.message };
  }
  const entry = format === 'opencode-json'
    ? normalizeOpencodeEntry(parsed?.[namespace]?.[alias])
    : parsed?.[namespace]?.[alias];
  return {
    path: filePath,
    exists: true,
    hasAlias: Boolean(entry),
    proxied: isAiosMcpProxyEntry(entry, rootDir),
  };
}

function inspectTomlMcpProxyTarget(filePath, { alias, rootDir }) {
  const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/u, '');
  const section = readTomlMcpSection(raw, alias);
  if (!section) return { path: filePath, exists: true, hasAlias: false, proxied: false };
  const entry = {
    command: readTomlStringValue(section, 'command'),
    args: readTomlStringArray(section, 'args'),
  };
  return {
    path: filePath,
    exists: true,
    hasAlias: true,
    proxied: isAiosMcpProxyEntry(entry, rootDir),
  };
}

function readTomlMcpSection(raw, alias) {
  const header = `[mcp_servers.${alias}]`;
  const lines = raw.split(/\r?\n/u);
  const start = lines.findIndex((line) => line.trim() === header);
  if (start < 0) return '';
  const body = [];
  for (const line of lines.slice(start + 1)) {
    if (/^\s*\[/u.test(line)) break;
    body.push(line);
  }
  return body.join('\n');
}

function readTomlStringValue(section, key) {
  const pattern = new RegExp(`^\\s*${key}\\s*=\\s*\"((?:\\\\.|[^\"])*)\"\\s*$`, 'mu');
  const value = pattern.exec(section)?.[1] || '';
  return value.replace(/\\"/gu, '"').replace(/\\\\/gu, '\\');
}

function readTomlStringArray(section, key) {
  const pattern = new RegExp(`^\\s*${key}\\s*=\\s*\\[([\\s\\S]*?)\\]\\s*$`, 'mu');
  const body = pattern.exec(section)?.[1] || '';
  const values = [];
  const itemPattern = /"((?:\\.|[^"])*)"/gu;
  let match;
  while ((match = itemPattern.exec(body)) !== null) {
    values.push(match[1].replace(/\\"/gu, '"').replace(/\\\\/gu, '\\'));
  }
  return values;
}

function normalizeOpencodeEntry(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return entry;
  if (Array.isArray(entry.command)) {
    return {
      command: String(entry.command[0] || ''),
      args: entry.command.slice(1).map(String),
      env: entry.environment && typeof entry.environment === 'object' ? entry.environment : {},
    };
  }
  return entry;
}

/* 中文注释：聚合巡检结果给 proof/doctor 使用，调用方无需理解每个客户端的路径规则。 */
export function inspectMcpProxyTargets({ rootDir, clientHomes = {}, alias = PRIMARY_BROWSER_ALIAS, aliases = [] } = {}) {
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
