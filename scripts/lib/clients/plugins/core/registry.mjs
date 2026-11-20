// core/registry.mjs — plugins.json 的读取与变更（单一事实源）。
// 纪律：零 try-catch / 零 throw——外部调用用 attempt 包，分支用 ts-pattern match，
// 校验失败返回 Result.err，由调用方用 match 处理。
import fs from 'node:fs';
import path from 'node:path';
import { match, P } from 'ts-pattern';

import { attempt, err, ok, readJson } from './result.mjs';

export const PLUGINS_REGISTRY_PATH = path.join('config', 'plugins.json');
export const PLUGINS_SCHEMA_VERSION = 1;

export function resolvePluginsRegistryPath(rootDir) {
  return path.join(rootDir, PLUGINS_REGISTRY_PATH);
}

/** 读取并归一化 plugins.json。文件缺失 = 空数组（合法空状态）。disabled 过滤。 */
export function readPluginsRegistry({ rootDir, readFileImpl = fs.readFileSync } = {}) {
  const filePath = resolvePluginsRegistryPath(rootDir);
  const parsed = readJson(filePath, { readFileImpl });
  if (!parsed.ok) return /ENOENT|ENOTDIR/u.test(parsed.error) ? ok(Object.freeze([])) : parsed;
  const doc = parsed.value;
  const shapeError = match(doc)
    .with(P.when((v) => !v || typeof v !== 'object' || Array.isArray(v)), () => 'plugins registry: root must be an object')
    .with({ schemaVersion: PLUGINS_SCHEMA_VERSION }, (d) => (Array.isArray(d.plugins) ? '' : 'plugins registry: plugins must be an array'))
    .otherwise(() => `plugins registry: unsupported schemaVersion ${JSON.stringify(doc?.schemaVersion)}`);
  if (shapeError) return err(shapeError);
  return normalizeEntries(doc.plugins);
}

function normalizeEntries(plugins) {
  const seen = new Set();
  const out = [];
  for (const entry of plugins) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return err('plugins registry: each plugin must be an object');
    const id = String(entry.id || '').trim();
    if (!id || seen.has(id)) return err(`plugins registry: missing or duplicate plugin id ${JSON.stringify(id)}`);
    seen.add(id);
    if (entry.enabled === false) continue;
    out.push(Object.freeze({ id, manifest: String(entry.manifest || '').trim(), enabled: true }));
  }
  return ok(Object.freeze(out));
}

/** 读取完整列表（含 disabled），供变更函数用。 */
function readPluginsRegistryRaw({ rootDir, readFileImpl = fs.readFileSync } = {}) {
  const filePath = resolvePluginsRegistryPath(rootDir);
  const parsed = readJson(filePath, { readFileImpl, empty: { plugins: [] } });
  if (!parsed.ok) return parsed;
  const plugins = Array.isArray(parsed.value?.plugins) ? parsed.value.plugins : [];
  return ok(plugins.map((p) => ({ id: String(p.id || '').trim(), manifest: String(p.manifest || '').trim(), enabled: p.enabled !== false })));
}

/** 原子写（temp + rename）。 */
export function writePluginsRegistry({ rootDir, plugins, writeFileImpl = fs.writeFileSync, renameImpl = fs.renameSync, mkdirImpl = fs.mkdirSync } = {}) {
  const filePath = resolvePluginsRegistryPath(rootDir);
  const body = { schemaVersion: PLUGINS_SCHEMA_VERSION, plugins: plugins.map((p) => ({ id: p.id, manifest: p.manifest, enabled: p.enabled !== false })) };
  const written = attempt(() => {
    mkdirImpl(path.dirname(filePath), { recursive: true });
    const temporary = `${filePath}.tmp-${process.pid}`;
    writeFileImpl(temporary, `${JSON.stringify(body, null, 2)}\n`, 'utf8');
    renameImpl(temporary, filePath);
    return filePath;
  });
  return written;
}

/** 变更注册表：add / remove / enable / disable，返回 Result。 */
export function changePluginsRegistry({ rootDir, action, id, manifest, readFileImpl = fs.readFileSync } = {}) {
  const key = String(id || '').trim();
  if (!key) return err('plugin id is required');
  const currentResult = readPluginsRegistryRaw({ rootDir, readFileImpl });
  if (!currentResult.ok) return currentResult;
  const current = currentResult.value;
  const index = current.findIndex((p) => p.id === key);

  return match(action)
    .with('add', () => (index >= 0 ? err(`plugin ${key} already installed`) : ok({ plugins: [...current, { id: key, manifest: String(manifest || '').trim(), enabled: true }], changed: true, plugin: { id: key } })))
    .with('remove', () => (index < 0 ? err(`plugin ${key} not installed`) : ok({ plugins: current.filter((_, i) => i !== index), changed: true, plugin: current[index] })))
    .with('enable', 'disable', () => {
      if (index < 0) return err(`plugin ${key} not installed`);
      const next = action === 'enable';
      const plugins = current.map((p, i) => (i === index ? { ...p, enabled: next } : p));
      return ok({ plugins, changed: current[index].enabled !== next, plugin: plugins[index] });
    })
    .otherwise(() => err(`unknown plugin action ${JSON.stringify(action)}`));
}
