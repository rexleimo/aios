#!/usr/bin/env node
// scripts/aios-plugin-demo.mjs — 一键体验声明式插件系统。
//
// 为什么需要它：`npm run ui` 自带 token 门（apps/shell/ui/src/proxy.ts），直接
// `cd apps/shell/ui && npm run dev` 会 403 `no-token-configured`，页面打不开——
// 这不是插件没装，而是绕过了 token 发布流程。本脚本把三件事合成一条命令：
//   1. 幂等地确保示例插件已安装且启用（写 config/plugins.json）；
//   2. 重新投影 contributions（生成 .aios/gateway/plugin-views.json，注入左侧导航）；
//   3. 用 scripts/aios-ui.mjs 启动 console（它生成 token 并打印可点开的 bootstrap URL）。
//
// Usage: node scripts/aios-plugin-demo.mjs [--port <port>]
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { applyInstalledContributions } from './lib/clients/plugins/adapters/apply.mjs';
import { changePluginsRegistry, writePluginsRegistry } from './lib/clients/plugins/core/registry.mjs';
import { runUi } from './aios-ui.mjs';

export const DEMO_PLUGIN_ID = 'hello-plugin';
export const DEMO_PLUGIN_DIR = path.join('examples', 'hello-plugin');

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * 幂等：已装且启用就什么都不做；否则启用或安装。
 * 注意不能靠 `readPluginsRegistry` 判断是否已装——它会过滤 disabled 条目，
 * 一个被禁用的插件看起来像"没装"，随后 add 会撞上 already installed。
 * 这里直接问变更函数的 Result（它读完整列表，含 disabled），语义正确且无需新 API。
 */
export function ensureDemoPlugin({ rootDir: projectRoot, log = process.stderr } = {}) {
  const enable = changePluginsRegistry({ rootDir: projectRoot, action: 'enable', id: DEMO_PLUGIN_ID });
  const changed = enable.ok
    ? enable
    : changePluginsRegistry({ rootDir: projectRoot, action: 'add', id: DEMO_PLUGIN_ID, manifest: DEMO_PLUGIN_DIR });
  if (!changed.ok) {
    log.write(`[plugin-demo] install/enable failed: ${changed.error}\n`);
    return { ok: false, changed: false };
  }
  if (changed.value.changed) {
    writePluginsRegistry({ rootDir: projectRoot, plugins: changed.value.plugins });
    log.write(`[plugin-demo] ${enable.ok ? 'enabled' : 'installed'} ${DEMO_PLUGIN_ID}\n`);
  }
  return { ok: true, changed: changed.value.changed, plugin: changed.value.plugin };
}

export function parseDemoArgv(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--port') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error('[plugin-demo] --port requires a value');
      options.port = value;
      index += 1;
    } else if (argv[index].startsWith('--')) {
      throw new Error(`[plugin-demo] unknown option: ${argv[index]}`);
    }
  }
  return options;
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  try {
    const options = parseDemoArgv(process.argv.slice(2));
    const ensured = ensureDemoPlugin({ rootDir });
    if (!ensured.ok) {
      process.exitCode = 1;
    } else {
      const applied = applyInstalledContributions({ rootDir });
      process.stderr.write(
        `[plugin-demo] panel projections: ${applied.panels}; open the URL below, then click ` +
        `「示例插件」in the left nav (route /hello-plugin).\n`,
      );
      const result = runUi({ mode: 'dev', rootDir, port: options.port });
      process.exitCode = result.exitCode;
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  }
}
