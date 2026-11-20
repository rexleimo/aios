// scripts/lib/clients/plugins/manifest.mjs — 插件 manifest 的声明式校验（P0, A1）。
// 设计约束：插件是一份 manifest，声明 contributes；这里只做结构校验与归一化，
// 不执行外部代码、不碰文件系统。注入由 contributions.mjs 负责，职责分离。
// 与 integrations/registry.mjs 同风格：错误类 + 严格校验 + 失败即抛，不做尽力降级。

export const PLUGIN_MANIFEST_SCHEMA_VERSION = 1;
export const PLUGIN_ID_PATTERN = /^[a-z][a-z0-9._-]*$/u;
export const PLUGIN_VERSION_PATTERN = /^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9._-]+)?$/u;
const CONTRIBUTION_KEYS = new Set(['panels', 'integrations', 'providers', 'actions', 'middleware', 'clients', 'onUsage']);

export class PluginManifestError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PluginManifestError';
  }
}

function requireString(value, field) {
  const text = String(value ?? '').trim();
  if (!text) throw new PluginManifestError(`plugin manifest: ${field} is required`);
  return text;
}

function normalizeContributes(raw) {
  if (raw === undefined || raw === null) return Object.freeze({});
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new PluginManifestError('plugin manifest: contributes must be an object');
  }
  const unknown = Object.keys(raw).filter((key) => !CONTRIBUTION_KEYS.has(key));
  if (unknown.length) {
    throw new PluginManifestError(`plugin manifest: contributes has unknown key ${unknown[0]}`);
  }
  const out = {};
  for (const key of CONTRIBUTION_KEYS) {
    const value = raw[key];
    if (value === undefined) continue;
    if (!Array.isArray(value)) {
      throw new PluginManifestError(`plugin manifest: contributes.${key} must be an array`);
    }
    out[key] = Object.freeze([...value]);
  }
  return Object.freeze(out);
}

/**
 * 校验并归一化一份插件 manifest。失败即抛 PluginManifestError，错误信息含字段名。
 * @param {unknown} raw
 * @returns {Readonly<{schemaVersion:number,id:string,version:string,contributes:object,permissions?:string[],lifecycle?:object,evidence?:object}>}
 */
export function normalizePluginManifest(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new PluginManifestError('plugin manifest: root must be an object');
  }
  if (raw.schemaVersion !== PLUGIN_MANIFEST_SCHEMA_VERSION) {
    throw new PluginManifestError(
      `plugin manifest: unsupported schemaVersion ${JSON.stringify(raw.schemaVersion)} (expected ${PLUGIN_MANIFEST_SCHEMA_VERSION})`,
    );
  }
  const id = requireString(raw.id, 'id');
  if (!PLUGIN_ID_PATTERN.test(id)) {
    throw new PluginManifestError(`plugin manifest: id must match ${PLUGIN_ID_PATTERN} (got ${id})`);
  }
  const version = requireString(raw.version, 'version');
  if (!PLUGIN_VERSION_PATTERN.test(version)) {
    throw new PluginManifestError(`plugin manifest: version must be semver-like (got ${version})`);
  }
  const out = {
    schemaVersion: PLUGIN_MANIFEST_SCHEMA_VERSION,
    id,
    version,
    contributes: normalizeContributes(raw.contributes),
  };
  for (const optional of ['permissions', 'lifecycle', 'evidence']) {
    if (raw[optional] !== undefined) out[optional] = raw[optional];
  }
  return Object.freeze(out);
}
