// scripts/aios-ui.mjs — 在仓库根启动接入矩阵界面。
//
// 为什么要有这个文件，而不是把 npm script 写成 `npm --prefix apps/shell/ui run dev`：
//   1. 端口要由声明给出。实测 `npm run ui -- --port 3131` 会把 3131 当位置参数传给
//      `next dev`，变成「项目目录不存在」；嵌套 npm 还会再吞一层参数。
//   2. 依赖没装时要给一句能照着做的结论，而不是把 next 的 ENOENT 甩给用户。
//   3. 这是 ADR 决策 3 里「能力进程」的入口雏形：以后 `aios ui` 就接在这里。
//
// 为什么直接 spawn next 的 JS 入口而不是 spawn npm：实测在 Windows 上
// `spawnSync('npm', …)` 直接 ENOENT（npm 是 npm.cmd），而 `node_modules/next/dist/bin/next`
// 是带 shebang 的 JS 文件，用当前 Node 执行它在三个平台上形状一致，还少一层进程。
//
// Usage: node scripts/aios-ui.mjs [dev|build|start] [--port <port>] [--root <dir>]
// Exit: 0 成功；1 启动失败或依赖缺失；2 用法错误。
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { isDirectModuleInvocation } from './lib/foundation/platform/module-entry.mjs';

export const UI_MODES = Object.freeze(['dev', 'build', 'start']);
export const UI_DEFAULT_PORT = 3126;
// 实测：`next start -p 3126` 默认绑 0.0.0.0（`netstat` 同时出现 0.0.0.0 与 [::]），
// 那会把能力进程发布到局域网。壳与浏览器面板都是本机视图，宿主地址因此是声明出来的。
export const UI_BIND_HOST = '127.0.0.1';
export const UI_REL_PATH = path.join('apps', 'shell', 'ui');
export const NEXT_BIN_REL_PATH = path.join('node_modules', 'next', 'dist', 'bin', 'next');

export function resolveRepoRoot(fromUrl = import.meta.url) {
  return path.resolve(path.dirname(fileURLToPath(fromUrl)), '..');
}

/** 纯函数：缺依赖就说缺了什么，并给出可执行的下一条命令。 */
export function missingUiDependencies({ rootDir, existsImpl = fs.existsSync } = {}) {
  const uiDir = path.join(rootDir, UI_REL_PATH);
  const required = [
    path.join(uiDir, 'node_modules'),
    path.join(uiDir, NEXT_BIN_REL_PATH),
  ];
  return { uiDir, missing: required.filter((entry) => !existsImpl(entry)) };
}

/** 端口只走声明（参数或 AIOS_UI_PORT），非法值回落默认，绝不把脏值交给 next。 */
export function resolveUiPort(port) {
  const declared = port ?? process.env.AIOS_UI_PORT;
  const parsed = Number(String(declared ?? '').trim());
  return Number.isInteger(parsed) && parsed > 0 && parsed < 65_536 ? parsed : UI_DEFAULT_PORT;
}

/** 纯函数：把模式与端口拼成一次 next 调用。build 不带端口与宿主。 */
export function buildUiCommand({ mode = 'dev', port, uiDir } = {}) {
  if (!UI_MODES.includes(mode)) {
    const error = new Error(`unknown ui mode: ${mode} (expected one of ${UI_MODES.join(', ')})`);
    error.usage = true;
    throw error;
  }
  const chosen = resolveUiPort(port);
  const bin = path.join(uiDir, NEXT_BIN_REL_PATH);
  const args =
    mode === 'build'
      ? [bin, 'build']
      : [bin, mode, '-p', String(chosen), '-H', UI_BIND_HOST];
  return { command: process.execPath, args, uiDir, port: chosen, mode };
}

export function runUi({ mode = 'dev', port, rootDir = resolveRepoRoot(), spawnImpl = spawnSync } = {}) {
  const { uiDir, missing } = missingUiDependencies({ rootDir });
  if (missing.length > 0) {
    process.stderr.write(
      `[ui] dependencies are not installed in ${uiDir}\n` +
      '  run: npm run ui:setup\n' +
      `  missing: ${missing.map((entry) => path.relative(rootDir, entry)).join(', ')}\n`,
    );
    return { ok: false, exitCode: 1, plan: null };
  }
  const plan = buildUiCommand({ mode, port, uiDir });
  const child = spawnImpl(plan.command, plan.args, { cwd: uiDir, stdio: 'inherit' });
  const exitCode = child?.status ?? 1;
  if (child?.error) {
    process.stderr.write(`[ui] failed to start next: ${child.error.message}\n`);
  }
  return { ok: exitCode === 0, exitCode, plan };
}

export function parseUiArgv(argv) {
  const options = { mode: argv[0] && !argv[0].startsWith('--') ? argv[0] : 'dev' };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--port' || token === '--root') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        const error = new Error(`[ui] ${token} requires a value`);
        error.usage = true;
        throw error;
      }
      if (token === '--port') options.port = value;
      else options.rootDir = path.resolve(value);
      index += 1;
    } else if (token.startsWith('--')) {
      const error = new Error(`[ui] unknown option: ${token}`);
      error.usage = true;
      throw error;
    }
  }
  return options;
}

if (isDirectModuleInvocation(import.meta.url)) {
  try {
    const result = runUi(parseUiArgv(process.argv.slice(2)));
    process.exitCode = result.exitCode;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = error?.usage === true ? 2 : 1;
  }
}