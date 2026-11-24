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
const MAX_PLUGIN_UI_HTML_BYTES = 256 * 1024;

function htmlUiError(error) {
  return Object.freeze({ kind: 'html', error });
}

function escapesPluginRoot(rootDir, targetPath) {
  const relative = path.relative(rootDir, targetPath);
  return !relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative);
}

/** 读取插件自有的单文件 HTML UI；任何失败都投影成页面可见错误。 */
function loadPanelUi({ pluginDir, panel, readFileImpl, realpathImpl, statImpl }) {
  const declared = panel?.ui;
  if (declared === undefined || declared === null) return undefined;
  if (typeof declared !== 'object' || Array.isArray(declared)) return htmlUiError('Plugin UI must be an object.');
  const entry = String(declared.entry || '').trim();
  if (!entry) return htmlUiError('Plugin UI entry is required.');
  const normalizedEntry = entry.replaceAll('\\', '/');
  if (path.isAbsolute(normalizedEntry) || path.win32.isAbsolute(normalizedEntry)) {
    return htmlUiError('Plugin UI entry must be a relative path.');
  }
  const pluginRoot = path.resolve(pluginDir);
  const target = path.resolve(pluginRoot, normalizedEntry);
  if (escapesPluginRoot(pluginRoot, target)) {
    return htmlUiError('Plugin UI path must stay inside the plugin directory.');
  }
  if (path.extname(target).toLowerCase() !== '.html') return htmlUiError('Plugin UI entry must point to an .html file.');
  const realPluginRoot = attempt(() => realpathImpl(pluginRoot));
  const realTarget = attempt(() => realpathImpl(target));
  if (!realPluginRoot.ok || !realTarget.ok) return htmlUiError(`Unable to load plugin UI "${entry}".`);
  if (escapesPluginRoot(realPluginRoot.value, realTarget.value)) {
    return htmlUiError('Plugin UI path must stay inside the plugin directory.');
  }
  const targetStat = attempt(() => statImpl(realTarget.value));
  if (!targetStat.ok || !targetStat.value.isFile()) return htmlUiError(`Unable to load plugin UI "${entry}".`);
  if (targetStat.value.size > MAX_PLUGIN_UI_HTML_BYTES) {
    return htmlUiError(`Plugin UI "${entry}" exceeds the 256 KiB limit.`);
  }
  const loaded = attempt(() => readFileImpl(realTarget.value, 'utf8'));
  if (!loaded.ok) return htmlUiError(`Unable to load plugin UI "${entry}".`);
  const html = String(loaded.value);
  if (Buffer.byteLength(html, 'utf8') > MAX_PLUGIN_UI_HTML_BYTES) {
    return htmlUiError(`Plugin UI "${entry}" exceeds the 256 KiB limit.`);
  }
  return Object.freeze({ kind: 'html', html });
}

/** 归一化当前已装插件的 panel views（唯一投影点）。 */
export function computePluginViews({ rootDir, readFileImpl = fs.readFileSync, realpathImpl = fs.realpathSync, statImpl = fs.statSync } = {}) {
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
      .with({ ok: true }, ({ value }) => {
        const panels = (value.contributes?.panels || []).map((panel) => {
          const ui = loadPanelUi({ pluginDir: dir, panel, readFileImpl, realpathImpl, statImpl });
          return ui ? { ...panel, ui } : panel;
        });
        views = projectPanelContributions(views, panels, entry.id);
      })
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
