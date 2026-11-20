// scripts/lib/clients/plugins/loader.mjs — 从磁盘加载已安装插件的 manifest。
// 插件是含 manifest.json 的目录（声明式，不执行代码）。
// 纪律：零 try-catch——读取/解析/校验都用 attempt 包成 Result，由调用方 match 分派。
import fs from 'node:fs';
import path from 'node:path';
import { match } from 'ts-pattern';

import { normalizePluginManifest } from './core/manifest.mjs';
import { attempt, mapErr, readJson } from './core/result.mjs';

export const PLUGIN_MANIFEST_FILE = 'manifest.json';

/** 从插件目录加载 manifest，返回 Result（校验失败在 error 字段，不抛）。 */
export function loadPluginManifest({ dir, readFileImpl = fs.readFileSync } = {}) {
  const filePath = path.join(String(dir || ''), PLUGIN_MANIFEST_FILE);
  const parsed = readJson(filePath, { readFileImpl });
  if (!parsed.ok) return mapErr(parsed, `plugin manifest: ${filePath} is not valid JSON or missing`);
  const normalized = attempt(() => normalizePluginManifest(parsed.value));
  return mapErr(normalized, `plugin manifest: ${filePath} failed validation`);
}

/** 按注册表条目加载全部启用插件（坏插件 fail-open）。 */
export function loadInstalledManifests({ rootDir, installed, readFileImpl = fs.readFileSync } = {}) {
  const loaded = [];
  const failed = [];
  for (const entry of installed || []) {
    const dir = path.isAbsolute(entry.manifest) ? entry.manifest : path.join(rootDir, entry.manifest);
    const result = loadPluginManifest({ dir, readFileImpl });
    match(result)
      .with({ ok: true }, ({ value }) => loaded.push({ id: entry.id, manifest: value }))
      .with({ ok: false }, ({ error }) => failed.push({ id: entry.id, error }))
      .exhaustive();
  }
  return { loaded: Object.freeze(loaded), failed: Object.freeze(failed) };
}
