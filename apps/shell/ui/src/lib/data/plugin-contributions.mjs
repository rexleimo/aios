// apps/shell/ui/src/lib/data/plugin-contributions.mjs — 插件 panel 贡献的读侧（服务端）。
// 单一事实源：manifest 校验/投影只在 CLI 侧 core 发生，结果写入 .aios/gateway/plugin-views.json。
// 本模块只读这个已归一化的数据文件。纪律：零 try-catch——用 existsSync 预检 + JSON.parse 由 core 保证合法。
import fs from 'node:fs';
import path from 'node:path';

import { stateDir } from './state-root.mjs';

const PLUGIN_VIEWS_PATH = path.join('gateway', 'plugin-views.json');

export function loadPluginPanelViews({ rootDir, readFileImpl = fs.readFileSync } = {}) {
  const filePath = path.join(stateDir(rootDir), PLUGIN_VIEWS_PATH);
  if (!fs.existsSync(filePath)) return { views: [], failed: [] };
  const doc = JSON.parse(String(readFileImpl(filePath, 'utf8')).replace(/^\uFEFF/u, ''));
  const views = Array.isArray(doc?.views) ? doc.views : [];
  const failed = Array.isArray(doc?.failed) ? doc.failed : [];
  return { views, failed };
}
