// adapters/integration.mjs — integration 贡献的真实写盘适配器（外层）。
// 复用现有 integrations registry 硬门；来源存独立 sidecar，不污染领域对象。
// 纪律：零 try-catch——readJson + attempt + ts-pattern match。
import fs from 'node:fs';
import path from 'node:path';
import { match } from 'ts-pattern';

import { INTEGRATION_REGISTRY_PATH, normalizeIntegrationEntry, normalizeIntegrationRegistry } from '../../integrations/registry.mjs';
import { attempt, readJson, withFallback } from '../core/result.mjs';

export const PLUGIN_INTEGRATION_SIDECAR = path.join('config', 'plugin-integration-sources.json');

/** 硬门端口：复用真实 normalizeIntegrationEntry。 */
export function validateIntegration(id, raw) {
  return normalizeIntegrationEntry(id, raw);
}

/** 读来源 sidecar：{ "integration-id": "plugin-id" }。 */
export function readSources({ rootDir, readFileImpl = fs.readFileSync } = {}) {
  const result = readJson(path.join(rootDir, PLUGIN_INTEGRATION_SIDECAR), { readFileImpl, empty: {} });
  const doc = withFallback(result, {});
  return doc && typeof doc === 'object' && !Array.isArray(doc) ? doc : {};
}

/** 原子写 JSON。 */
function atomicWriteJson(writeFileImpl, renameImpl, filePath, value) {
  const temporary = `${filePath}.tmp-${process.pid}`;
  writeFileImpl(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  renameImpl(temporary, filePath);
}

/** 真实写盘：投影 integration 条目 + sidecar 来源。 */
export function writeIntegrationIntents({ rootDir, intents, readFileImpl = fs.readFileSync, writeFileImpl = fs.writeFileSync, renameImpl = fs.renameSync } = {}) {
  const registryPath = path.join(rootDir, INTEGRATION_REGISTRY_PATH);
  const read = readJson(registryPath, { readFileImpl, empty: { schemaVersion: 1, integrations: {} } });
  const doc = withFallback(read, { schemaVersion: 1, integrations: {} });
  const integrations = { ...(doc.integrations || {}) };
  const sources = readSources({ rootDir, readFileImpl });
  for (const intent of intents) {
    integrations[intent.id] = intent.normalized;
    sources[intent.id] = intent.source;
  }
  const validated = attempt(() => normalizeIntegrationRegistry({ schemaVersion: 1, integrations }));
  return match(validated)
    .with({ ok: true }, ({ value }) => {
      attempt(() => {
        atomicWriteJson(writeFileImpl, renameImpl, registryPath, { schemaVersion: 1, integrations: value.integrations });
        atomicWriteJson(writeFileImpl, renameImpl, path.join(rootDir, PLUGIN_INTEGRATION_SIDECAR), sources);
      });
      return { written: intents.map((i) => i.id) };
    })
    .with({ ok: false }, ({ error }) => ({ written: [], error }))
    .exhaustive();
}

/** 卸载：只移除来源为指定插件的 integration，保留手工条目。 */
export function removePluginIntegrations({ rootDir, pluginId, readFileImpl = fs.readFileSync, writeFileImpl = fs.writeFileSync, renameImpl = fs.renameSync } = {}) {
  const registryPath = path.join(rootDir, INTEGRATION_REGISTRY_PATH);
  const read = readJson(registryPath, { readFileImpl, empty: { schemaVersion: 1, integrations: {} } });
  const doc = withFallback(read, { schemaVersion: 1, integrations: {} });
  const sources = readSources({ rootDir, readFileImpl });
  const integrations = {};
  const nextSources = {};
  for (const [id, entry] of Object.entries(doc.integrations || {})) {
    if (sources[id] === pluginId) continue;
    integrations[id] = entry;
    if (sources[id]) nextSources[id] = sources[id];
  }
  attempt(() => {
    atomicWriteJson(writeFileImpl, renameImpl, registryPath, { schemaVersion: 1, integrations });
    atomicWriteJson(writeFileImpl, renameImpl, path.join(rootDir, PLUGIN_INTEGRATION_SIDECAR), nextSources);
  });
  return { removed: Object.keys(sources).filter((id) => sources[id] === pluginId) };
}
