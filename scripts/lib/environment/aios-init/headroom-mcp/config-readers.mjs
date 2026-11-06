import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { parse as parseYaml } from 'yaml';

import { readTomlEntries } from '../../../clients/mcp/formats/toml-editor.mjs';

import { resolveClientFromRuntimeId } from '../../../foundation/clients/execution/runtime/identifiers.mjs';
import { resolveClientMcpTargetPaths } from '../../../foundation/clients/integration/native/index.mjs';
import { getClientHomes } from '../../../foundation/platform/paths.mjs';

function objectRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizeStringList(value) {
  return Array.isArray(value) ? value.map(String) : [];
}

function normalizeEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  return {
    command: String(entry.command || ''),
    args: normalizeStringList(entry.args),
    env: Object.fromEntries(
      Object.entries(objectRecord(entry.env))
        .map(([key, value]) => [key, String(value)])
        .sort(([left], [right]) => left.localeCompare(right)),
    ),
    ...(typeof entry.enabled === 'boolean' ? { enabled: entry.enabled } : {}),
    ...(Array.isArray(entry.tools) ? { tools: entry.tools.map(String).sort() } : {}),
  };
}

/**
 * TOML 落点（grok）的条目读取：**直接复用写路径的 reader**，不自己再写一份行扫描。
 *
 * 为什么必须换：旧实现的正则只认内联表 `env = { ... }`，而 grok 的真实配置用的是
 * `[mcp_servers.<name>.env]` 子表（2026-11-05 实测 ~/.grok/config.toml）——于是同一份正确配置会被读成
 * `env: {}`，指纹对不上 → 判成 `conflict`，而人能看到的文件明明是对的。
 * 换成一个 reader 之后，内联表与子表两种写法读到的是同一个对象。
 */
function parseTomlHeadroom(raw = '') {
  const entries = readTomlEntries(String(raw), ['mcp_servers']).entries;
  return entries.headroom ? normalizeEntry(entries.headroom) : null;
}

export function resolveHeadroomConfigTargets({
  runtimeId,
  projectRoot = '',
  env = process.env,
  homeDir,
  profile = '',
} = {}) {
  const client = resolveClientFromRuntimeId(runtimeId);
  if (!client) return { user: null, project: null };
  const homes = getClientHomes(env, homeDir);
  const clientHome = homes[client];
  const targets = resolveClientMcpTargetPaths(client, { projectRoot, clientHome });
  const project = targets.find((target) => target.scope === 'project') || null;
  let user = targets.find((target) => target.scope === 'home') || null;
  if (client === 'hermes' && profile && user) {
    user = { ...user, path: path.join(clientHome, 'profiles', profile, 'config.yaml') };
  }
  return { user, project };
}

export async function readHeadroomEntry(target, { readFileImpl = readFile } = {}) {
  if (!target) return { entry: null, target: null, parseError: '' };
  try {
    const raw = await readFileImpl(target.path, 'utf8');
    if (target.format === 'toml') {
      return { entry: parseTomlHeadroom(raw), target, parseError: '' };
    }
    const parsed = target.format === 'yaml'
      ? parseYaml(raw)
      : JSON.parse(String(raw).replace(/^\uFEFF/u, ''));
    const entry = normalizeEntry(objectRecord(parsed?.[target.namespace]).headroom);
    return { entry, target, parseError: '' };
  } catch (error) {
    if (['ENOENT', 'ENOTDIR'].includes(error?.code)) return { entry: null, target, parseError: '' };
    return { entry: null, target, parseError: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * 只读探测：该 runtime 的 user 级配置文件里有没有 headroom 条目、项目级是否影子覆盖。
 * 放在这里（读层）而不是 lifecycle：它是“读一份配置并归一化”，与写/归属判定无关；
 * lifecycle 只消费它，并把它作为可注入的 `inspectImpl`。
 */
export async function inspectHeadroomMcpRegistration(options = {}) {
  const { runtimeId, projectRoot = process.cwd(), env = process.env, homeDir, profile = '', readFileImpl } = options;
  const targets = resolveHeadroomConfigTargets({ runtimeId, projectRoot, env, homeDir, profile });
  const [user, project] = await Promise.all([
    readHeadroomEntry(targets.user, { readFileImpl }),
    readHeadroomEntry(targets.project, { readFileImpl }),
  ]);
  return {
    actual: user.entry,
    configPath: user.target?.path || '',
    projectShadow: Boolean(project.entry),
    parseError: user.parseError || project.parseError || '',
  };
}
