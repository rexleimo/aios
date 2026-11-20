// adapters/panel.mjs — panel 贡献的写侧适配器（外层）。
// 用 core dispatch 的投影生成 views 文件（UI 唯一读源）。
// 纪律：零 try-catch / 零 throw——用 attempt + ts-pattern match。
import fs from 'node:fs';
import path from 'node:path';
import { match } from 'ts-pattern';

import { loadPluginManifest } from '../loader.mjs';
import { readPluginsRegistry } from '../core/registry.mjs';
import { projectPanelContributions } from '../core/contributions.mjs';
import { attempt, errorOf } from '../core/result.mjs';

export const PLUGIN_VIEWS_PATH = path.join('.aios', 'gateway', 'plugin-views.json');

/** 归一化当前已装插件的 panel views（唯一投影点）。 */
export function computePluginViews({ rootDir, readFileImpl = fs.readFileSync } = {}) {
  const installedResult = readPluginsRegistry({ rootDir, readFileImpl });
  const installed = match(installedResult)
    .with({ ok: true }, ({ value }) => value)
    .with({ ok: false }, () => [])
    .exhaustive();
  let views = {};
  const failed = errorOf(installedResult) ? [{ id: 'plugins.json', error: errorOf(installedResult) }] : [];
  for (const entry of installed) {
    const dir = path.isAbsolute(entry.manifest) ? entry.manifest : path.join(rootDir, entry.manifest);
    const manifestResult = loadPluginManifest({ dir, readFileImpl });
    match(manifestResult)
      .with({ ok: true }, ({ value }) => { views = projectPanelContributions(views, value.contributes?.panels || [], entry.id); })
      .with({ ok: false }, ({ error }) => failed.push({ id: entry.id, error }))
      .exhaustive();
  }
  return { views: Object.values(views), failed };
}

/** 把归一化 views 写到 UI 可读文件（原子写）。 */
export function writePluginViewsFile({ rootDir, writeFileImpl = fs.writeFileSync, renameImpl = fs.renameSync, mkdirImpl = fs.mkdirSync, ...rest } = {}) {
  const { views, failed } = computePluginViews({ rootDir, ...rest });
  const filePath = path.join(rootDir, PLUGIN_VIEWS_PATH);
  const written = attempt(() => {
    mkdirImpl(path.dirname(filePath), { recursive: true });
    const temporary = `${filePath}.tmp-${process.pid}`;
    writeFileImpl(temporary, `${JSON.stringify({ schemaVersion: 1, views, failed })}\n`, 'utf8');
    renameImpl(temporary, filePath);
    return { filePath, count: views.length };
  });
  return match(written)
    .with({ ok: true }, ({ value }) => value)
    .with({ ok: false }, ({ error }) => ({ filePath: '', count: 0, error }))
    .exhaustive();
}
