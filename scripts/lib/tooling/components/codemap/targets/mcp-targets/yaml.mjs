// scripts/lib/tooling/components/codemap/targets/mcp-targets/yaml.mjs — hermes 的 `mcp_servers.<name>` YAML 落点。
//
// w5b 收编后：写盘交给 `landing-writer.mjs`；本文件只留 hermes 自己的**形状收敛**
// （`toHermesMcpEntry`：只保留 command/args/cwd/env，env 键排序且值转字符串）——
// 那是「hermes 接受什么」的事实，不是文本手术，留在调用方。
// `inspectHermesYaml` 仍是纯读：解析文本，不改盘。
import { parseDocument } from 'yaml';

import { CRG_MCP_ALIAS } from '../../constants.mjs';
import { buildCrgEntryForTarget, isCrgServeEntry, isObjectRecord } from './entries.mjs';
import { removeTargetEntry, writeTargetEntry } from './landing-writer.mjs';

function toHermesMcpEntry(entry) {
  const normalized = {};
  if (entry?.command) normalized.command = String(entry.command);
  if (Array.isArray(entry?.args)) normalized.args = entry.args.map(String);
  if (entry?.cwd) normalized.cwd = String(entry.cwd);
  if (isObjectRecord(entry?.env) && Object.keys(entry.env).length > 0) {
    normalized.env = Object.fromEntries(Object.keys(entry.env).sort().map((key) => [key, String(entry.env[key])]));
  }
  return normalized;
}

/** 只读：解析 hermes 配置；结构不合法就是错误，不是「空配置」。 */
function parseHermesDocument(raw) {
  const document = parseDocument(raw || '{}\n');
  if (document.errors.length > 0) {
    throw new Error(document.errors.map((error) => error.message).join('; '));
  }

  let config = document.toJS();
  if (!isObjectRecord(config)) {
    document.contents = document.createNode({});
    config = {};
  }
  if (!isObjectRecord(config.mcp_servers)) {
    document.set('mcp_servers', document.createNode({}));
    config.mcp_servers = {};
  }
  return { document, config };
}

export async function upsertCrgIntoHermesYaml(target, projectRoot, { dryRun = false } = {}) {
  // hermes 的条目形状由本组件收敛（schema 之外一律不收），落盘手术由通用层做。
  const entry = toHermesMcpEntry(buildCrgEntryForTarget(target.clientKey || 'hermes', projectRoot, target.path));
  return writeTargetEntry({ target, projectRoot, entry, dryRun });
}

export async function removeCrgFromHermesYaml(target, { io = console, projectRoot = '', dryRun = false } = {}) {
  return removeTargetEntry({ target, projectRoot, io, dryRun });
}

export function inspectHermesYaml(raw) {
  const { config } = parseHermesDocument(raw);
  const entry = config.mcp_servers[CRG_MCP_ALIAS];
  return {
    exists: true,
    hasCrg: Boolean(entry),
    valid: isCrgServeEntry(entry),
    reason: entry ? 'invalid' : 'missing',
  };
}