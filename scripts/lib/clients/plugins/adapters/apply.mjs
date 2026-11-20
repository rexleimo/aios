// adapters/apply.mjs — 编排安装/卸载时的 contribution 落地（外层）。
// 纪律：零 try-catch——ts-pattern match 处理 Result。
import fs from 'node:fs';
import path from 'node:path';
import { match } from 'ts-pattern';

import { loadPluginManifest } from '../loader.mjs';
import { readPluginsRegistry } from '../core/registry.mjs';
import { dispatchContributions } from '../core/dispatch.mjs';
import { validateIntegration, writeIntegrationIntents, removePluginIntegrations } from './integration.mjs';
import { writePluginViewsFile } from './panel.mjs';

function loadAll({ rootDir, readFileImpl = fs.readFileSync }) {
  const installed = readPluginsRegistry({ rootDir, readFileImpl });
  return match(installed)
    .with({ ok: true }, ({ value }) => value.flatMap((entry) => {
      const dir = path.isAbsolute(entry.manifest) ? entry.manifest : path.join(rootDir, entry.manifest);
      const manifestResult = loadPluginManifest({ dir, readFileImpl });
      return manifestResult.ok ? [{ id: entry.id, dir: entry.manifest, manifest: manifestResult.value }] : [];
    }))
    .with({ ok: false }, () => [])
    .exhaustive();
}

/** 安装/变更后：重新投影并落地 panel(views 文件) + integration(真写盘)。 */
export function applyInstalledContributions({ rootDir, readFileImpl = fs.readFileSync, writeFileImpl = fs.writeFileSync, renameImpl = fs.renameSync, mkdirImpl = fs.mkdirSync } = {}) {
  const manifests = loadAll({ rootDir, readFileImpl });
  const dispatched = dispatchContributions({ manifests, adapters: { validateIntegration } });
  const written = writeIntegrationIntents({ rootDir, intents: dispatched.integrationIntents, readFileImpl, writeFileImpl, renameImpl });
  const views = writePluginViewsFile({ rootDir, readFileImpl, writeFileImpl, renameImpl, mkdirImpl });
  return {
    panels: views.count,
    integrations: written.written,
    integrationErrors: dispatched.integrationErrors,
    failedPlugins: dispatched.failed,
  };
}

/** 卸载：清理该插件的 integration 投影 + 刷新 views。 */
export function removeContributions({ rootDir, pluginId, readFileImpl = fs.readFileSync, writeFileImpl = fs.writeFileSync, renameImpl = fs.renameSync, mkdirImpl = fs.mkdirSync } = {}) {
  const removed = removePluginIntegrations({ rootDir, pluginId, readFileImpl, writeFileImpl, renameImpl });
  const views = writePluginViewsFile({ rootDir, readFileImpl, writeFileImpl, renameImpl, mkdirImpl });
  return { removedIntegrations: removed.removed, panels: views.count };
}
