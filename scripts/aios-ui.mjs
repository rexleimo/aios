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
// 信任边界（S2）：服务端在启动时生成一个 128 位 token，写进易失目录并把带 token 的
// URL 打到 stdout。窗口用它换取一个 HttpOnly cookie，之后每个请求都要过
// `apps/shell/ui/src/proxy.ts` 的门。token 由**起服务的人**持有，谁起服务谁发布，
// 因此 shell 自起与开发态手动起走的是同一条协议，没有「忘了设环境变量就没有门」的状态。
//
// Usage: node scripts/aios-ui.mjs [dev|build|start] [--port <port>] [--root <dir>]
// Exit: 0 成功；1 启动失败或依赖缺失；2 用法错误。
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { isDirectModuleInvocation } from './lib/foundation/platform/module-entry.mjs';

// `auto` is the mode the desktop shell uses: it must work on a fresh checkout (no
// `next build` yet) and must not serve a stale production build when one exists.
export const UI_MODES = Object.freeze(['auto', 'dev', 'build', 'start']);
export const UI_DEFAULT_PORT = 3126;
// 实测：`next start -p 3126` 默认绑 0.0.0.0（`netstat` 同时出现 0.0.0.0 与 [::]），
// 那会把能力进程发布到局域网。壳与浏览器面板都是本机视图，宿主地址因此是声明出来的。
export const UI_BIND_HOST = '127.0.0.1';
export const UI_REL_PATH = path.join('apps', 'shell', 'ui');
export const NEXT_BIN_REL_PATH = path.join('node_modules', 'next', 'dist', 'bin', 'next');
export const TOKEN_ENV = 'AIOS_UI_TOKEN';
export const PORT_ENV = 'AIOS_UI_PORT';

/** token 文件按端口命名：同一台机器上两个端口是两个服务，两把钥匙。 */
export function tokenPath(port, tmpDir = os.tmpdir()) {
  return path.join(tmpDir, `aios-ui-token-${port}`);
}

/** 128 位随机；不是可读口令，所以不做词表。 */
export function createToken(bytesImpl = randomBytes) {
  return bytesImpl(16).toString('hex');
}

/**
 * 发布 token（写文件，POSIX 上 0600）。发布发生在 spawn 之前：窗口在端口应答后
 * 立刻会去找这枚钥匙，晚一步就是「服务在跑但打不开」。
 */
export function publishToken({ port, token, writeFileImpl = fs.writeFileSync, chmodImpl = fs.chmodSync, tmpDir }) {
  const file = tokenPath(port, tmpDir);
  writeFileImpl(file, token, { mode: 0o600 });
  try {
    chmodImpl(file, 0o600);
  } catch {
    // Windows 上 chmod 只是尽力而为；文件本身在用户自己的临时目录里。
  }
  return file;
}

/** 带着 token 与端口跑 next 的环境：proxy.ts 只从这两个变量读事实。 */
export function childEnvironment({ port, token, env = process.env }) {
  return { ...env, [PORT_ENV]: String(port), [TOKEN_ENV]: token };
}

/**
 * 预热：服务一应答就自己把首页取一遍。
 *
 * 实测 `aios status --json` 要 ~9.3s，这段时间里窗口已经打开但页面在等采集。预热不缩短
 * 那次采集，只是把它挪到用户还没看的时候——之后的首屏走快照，0.1s 级。
 * 失败一律忽略：预热是优化，不是启动条件。
 */
export async function warmHomePage({ port, token, fetchImpl = globalThis.fetch, log = process.stderr }) {
  const base = `http://${UI_BIND_HOST}:${port}`;
  try {
    const exchange = await fetchImpl(`${base}/t/${token}/`, { redirect: 'manual' });
    const cookie = String(exchange.headers.get('set-cookie') ?? '').split(';')[0];
    if (!cookie) return { warmed: false, reason: 'no-cookie' };
    const page = await fetchImpl(`${base}/`, { headers: { cookie } });
    // 读到底，页面渲染才会真正跑完并写进快照。
    await page.text();
    return { warmed: page.ok, status: page.status };
  } catch (error) {
    log.write(`[ui] warm-up skipped: ${error instanceof Error ? error.message : String(error)}
`);
    return { warmed: false, reason: String(error) };
  }
}

/** 用户该打开的 URL（token 交换地址，随后 307 到页面本身）。 */
export function bootstrapUiUrl(port, token) {
  return `http://${UI_BIND_HOST}:${port}/t/${token}/`;
}

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

/**
 * `auto` resolves once, here: a production build that exists is what the shell ships,
 * and a missing one means the developer has not built yet, so `next dev` is the only
 * thing that can serve the page. Deciding this in the launcher keeps the Rust side
 * from having to know which build artifacts exist.
 */
export function resolveUiMode({ mode = 'dev', uiDir, existsImpl = fs.existsSync } = {}) {
  if (mode !== 'auto') return mode;
  return existsImpl(path.join(uiDir, '.next', 'BUILD_ID')) ? 'start' : 'dev';
}

/** 纯函数：把模式与端口拼成一次 next 调用。build 不带端口与宿主。 */
export function buildUiCommand({ mode = 'dev', port, uiDir, existsImpl } = {}) {
  if (!UI_MODES.includes(mode)) {
    const error = new Error(`unknown ui mode: ${mode} (expected one of ${UI_MODES.join(', ')})`);
    error.usage = true;
    throw error;
  }
  const resolvedMode = resolveUiMode({ mode, uiDir, existsImpl });
  const chosen = resolveUiPort(port);
  const bin = path.join(uiDir, NEXT_BIN_REL_PATH);
  const args =
    resolvedMode === 'build'
      ? [bin, 'build']
      : [bin, resolvedMode, '-p', String(chosen), '-H', UI_BIND_HOST];
  return { command: process.execPath, args, uiDir, port: chosen, mode: resolvedMode };
}

export function runUi({
  mode = 'dev',
  port,
  rootDir = resolveRepoRoot(),
  spawnImpl = spawnSync,
  tokenFactory = createToken,
  publishImpl = publishToken,
  tmpDir,
  log = process.stderr,
  unlinkImpl = fs.unlinkSync,
} = {}) {
  const { uiDir, missing } = missingUiDependencies({ rootDir });
  if (missing.length > 0) {
    log.write(
      `[ui] dependencies are not installed in ${uiDir}\n` +
      '  run: npm run ui:setup\n' +
      `  missing: ${missing.map((entry) => path.relative(rootDir, entry)).join(', ')}\n`,
    );
    return { ok: false, exitCode: 1, plan: null, token: null };
  }
  const plan = buildUiCommand({ mode, port, uiDir });
  if (mode === 'auto') {
    log.write(`[ui] mode auto resolved to ${plan.mode}
`);
  }

  // build 不服务任何请求，因此没有门，也没有钥匙。
  let token = null;
  let tokenFile = null;
  if (plan.mode !== 'build') {
    token = tokenFactory();
    tokenFile = publishImpl({ port: plan.port, token, tmpDir });
    log.write(`[ui] open ${bootstrapUiUrl(plan.port, token)}\n`);
  }

  const child = spawnImpl(plan.command, plan.args, {
    cwd: uiDir,
    stdio: 'inherit',
    env: token ? childEnvironment({ port: plan.port, token }) : process.env,
  });

  if (token && process.env.AIOS_UI_NO_WARM !== '1') {
    // 不 await：窗口该开就开，预热在后台跑。
    void warmHomePage({ port: plan.port, token, log }).catch(() => {});
  }
  const exitCode = child?.status ?? 1;
  if (child?.error) {
    log.write(`[ui] failed to start next: ${child.error.message}\n`);
  }
  if (tokenFile) {
    try {
      unlinkImpl(tokenFile);
    } catch {
      // 进程已经退出，临时目录会自己回收；这里只是顺手。
    }
  }
  return { ok: exitCode === 0, exitCode, plan, token };
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