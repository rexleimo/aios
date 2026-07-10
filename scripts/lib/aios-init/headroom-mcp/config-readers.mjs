import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { parse as parseYaml } from 'yaml';

import { resolveClientFromRuntimeId } from '../../clients/runtime/identifiers.mjs';
import { resolveClientMcpTargetPaths } from '../../clients/native/index.mjs';
import { getClientHomes } from '../../platform/paths.mjs';

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

function unescapeTomlString(value = '') {
  return String(value).replace(/\\"/gu, '"').replace(/\\\\/gu, '\\');
}

function parseTomlHeadroom(raw = '') {
  const section = /(?:^|\n)\[mcp_servers\.headroom\]\n([\s\S]*?)(?=\n\[|$)/u.exec(String(raw))?.[1] || '';
  if (!section) return null;
  const command = unescapeTomlString(/^\s*command\s*=\s*"((?:\\.|[^"])*)"\s*$/mu.exec(section)?.[1] || '');
  const argsRaw = /^\s*args\s*=\s*(\[[^\]]*\])\s*$/mu.exec(section)?.[1] || '[]';
  const args = [...argsRaw.matchAll(/"((?:\\.|[^"])*)"/gu)].map((match) => unescapeTomlString(match[1]));
  const envRaw = /^\s*env\s*=\s*\{([^}]*)\}\s*$/mu.exec(section)?.[1] || '';
  const env = Object.fromEntries(
    [...envRaw.matchAll(/"((?:\\.|[^"])*)"\s*=\s*"((?:\\.|[^"])*)"/gu)]
      .map((match) => [unescapeTomlString(match[1]), unescapeTomlString(match[2])]),
  );
  return normalizeEntry({ command, args, env });
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
