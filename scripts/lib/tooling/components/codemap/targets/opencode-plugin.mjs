import fs from 'node:fs';
import path from 'node:path';

import { backupFilePath, resolveUserPath } from '../paths.mjs';
import { buildDualExportTail, classifyOpenCodePluginSource, isAiosOwnedPluginSource } from '../../../../clients/opencode/plugin-contract.mjs';

/* 中文注释：CRG 插件的 OpenCode plugin id、1.x 具名导出名、2.x setup 函数名——导出
 * 形状由 clients/opencode/plugin-contract.mjs 统一生成，这里不手写 `export default`，
 * 否则契约知识会退回到分撒的字符串模板里（opencode 2.0 升级就是这么把插件弄坏的）。 */
const CRG_PLUGIN_ID = 'code-review-graph';
const CRG_LEGACY_EXPORT = 'CodeReviewGraphPlugin';
const CRG_V2_SETUP = 'CodeReviewGraphV2Setup';

const OPENCODE_CRG_PLUGIN_BODY = `import type { Plugin } from "@opencode-ai/plugin"

const UPDATE_DELAY_MS = 3_000
const COMMAND_TIMEOUT_MS = 30_000

/* 中文注释：windowsHide 在这个模板里不是可选项。插件运行在客户端自己的 Bun 宿主里
 * （opencode serve / 桌面壳），Windows 上这个宿主通常没有控制台；Bun.spawn 不传
 * windowsHide 时，系统会为 uvx.exe 这类控制台子程序**新建一个可见控制台窗口**，
 * 命令结束即销毁 —— 用户看到的就是「编辑文件后一直闪黑窗」。实测（本机 2026-11-07，
 * 无控制台父进程 + detached 启动）：不带 windowsHide 1.5s 内出现可见 CASCADIA 控制台
 * 窗口并归属到 uvx.exe；带上该标志后为 0。 */
async function runCrg(cwd: string, args: string[]): Promise<string> {
  const proc = Bun.spawn(["uvx", "code-review-graph", ...args], {
    cwd,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "ignore",
    windowsHide: true,
  })
  const timer = setTimeout(() => {
    try {
      proc.kill()
    } catch {
      // The process may have already exited.
    }
  }, COMMAND_TIMEOUT_MS)

  try {
    const [exitCode, stdout] = await Promise.all([
      proc.exited,
      new Response(proc.stdout).text(),
    ])
    return exitCode === 0 ? stdout.trim() : ""
  } catch {
    return ""
  } finally {
    clearTimeout(timer)
  }
}

export const ${CRG_LEGACY_EXPORT}: Plugin = async ({ directory }) => {
  let updateTimer: ReturnType<typeof setTimeout> | undefined
  let updateRunning = false
  let updatePending = false
  let disposed = false

  const runUpdate = async () => {
    if (disposed) return
    if (updateRunning) {
      updatePending = true
      return
    }

    updateRunning = true
    try {
      await runCrg(directory, ["update", "--skip-flows"])
    } finally {
      updateRunning = false
      if (updatePending && !disposed) {
        updatePending = false
        scheduleUpdate()
      }
    }
  }

  const scheduleUpdate = () => {
    if (disposed) return
    if (updateTimer) clearTimeout(updateTimer)
    updateTimer = setTimeout(() => {
      updateTimer = undefined
      void runUpdate()
    }, UPDATE_DELAY_MS)
  }

  return {
    "tool.execute.after": async (input) => {
      if (["edit", "write", "apply_patch"].includes(input.tool)) {
        scheduleUpdate()
      }
    },
    "tool.execute.before": async (input, output) => {
      if (input.tool !== "bash") return
      const command = output.args?.command
      if (typeof command !== "string" || !/(^|[;&|]\\s*)git\\s+commit\\b/i.test(command)) return

      const result = await runCrg(directory, ["detect-changes", "--brief"])
      if (result) console.log("[code-review-graph] Pre-commit analysis:\\n" + result)
    },
    dispose: async () => {
      disposed = true
      if (updateTimer) clearTimeout(updateTimer)
    },
  }
}

/* 中文注释：2.x 的行为实现（2026-10-18 于 opencode v2.0.32 真机验证）。v2 只调用
 * setup(ctx)，不会把 1.x 的 hooks 记录翻译过去，所以 hook 必须用 ctx.tool.hook
 * 显式注册；两个注意点：(1) v2 里 shell 工具的 id 是 "shell"（1.x 是 "bash"），
 * (2) plain-object setup 返回任何值都会让 watcher 重载报
 * "TypeError: t is not a function"，因此这个 setup 故意不返回 cleanup。 */
const ${CRG_V2_SETUP} = async (ctx: any) => {
  const directory: string = ctx?.location?.directory ?? ctx?.location?.project?.directory ?? "."

  let updateTimer: ReturnType<typeof setTimeout> | undefined
  let updateRunning = false
  let updatePending = false
  let disposed = false

  const runUpdate = async () => {
    if (disposed) return
    if (updateRunning) {
      updatePending = true
      return
    }

    updateRunning = true
    try {
      await runCrg(directory, ["update", "--skip-flows"])
    } finally {
      updateRunning = false
      if (updatePending && !disposed) {
        updatePending = false
        scheduleUpdate()
      }
    }
  }

  const scheduleUpdate = () => {
    if (disposed) return
    if (updateTimer) clearTimeout(updateTimer)
    updateTimer = setTimeout(() => {
      updateTimer = undefined
      void runUpdate()
    }, UPDATE_DELAY_MS)
  }

  await ctx.tool.hook("execute.after", (event: any) => {
    if (/edit|write|patch/i.test(String(event?.tool ?? ""))) scheduleUpdate()
  })
  await ctx.tool.hook("execute.before", async (event: any) => {
    if (!/shell|bash/i.test(String(event?.tool ?? ""))) return
    const command = event?.input?.command
    if (typeof command !== "string" || !/(^|[;&|]\\s*)git\\s+commit\\b/i.test(command)) return

    const result = await runCrg(directory, ["detect-changes", "--brief"])
    if (result) console.log("[code-review-graph] Pre-commit analysis:\\n" + result)
  })
}
`;

/* 中文注释：1.x 只遍历具名导出，2.x 只读 default。两者共存在同一文件里，
 * 所以一份模板同时兼容两个主版本，不需按探测结果分叉模板。 */
const OPENCODE_CRG_PLUGIN = `${OPENCODE_CRG_PLUGIN_BODY}${buildDualExportTail({
  id: CRG_PLUGIN_ID,
  legacyExport: CRG_LEGACY_EXPORT,
  setupExport: CRG_V2_SETUP,
})}`;

export function ensureOpencodePlugin(opencodeHome, { dryRun = false, io = console } = {}) {
  const home = resolveUserPath(opencodeHome);
  if (!home) return { status: 'skipped' };
  const pluginPath = path.join(home, 'plugins', 'crg-plugin.ts');
  const exists = fs.existsSync(pluginPath);
  const raw = exists ? fs.readFileSync(pluginPath, 'utf8') : '';
  // 中文注释：先分类已存在的文件，安装输出就能说清有没有把 2.x 不兼容的旧插件修好，
  // 而不是只回报一个 updated。
  const before = exists ? classifyOpenCodePluginSource(raw) : null;
  if (raw === OPENCODE_CRG_PLUGIN) return { status: 'unchanged', path: pluginPath, contract: before?.verdict ?? 'ok' };
  if (exists && !isAiosOwnedPluginSource(raw)) {
    io.log(`[warn] opencode plugin exists and is not CRG-managed, skipping: ${pluginPath}`);
    return { status: 'skipped', path: pluginPath, contract: before?.verdict ?? 'unknown' };
  }
  if (before && !before.ok) {
    io.log(`[warn] opencode plugin not loadable by OpenCode 2.x (${before.verdict}): ${pluginPath}`);
    io.log('[hint] rewriting to the dual-export shape: named export for 1.x + default { id, setup } for 2.x');
  }
  if (dryRun) return { status: 'planned', path: pluginPath, contract: before?.verdict ?? 'new' };
  if (exists) {
    fs.writeFileSync(backupFilePath(pluginPath), raw, 'utf8');
  }
  fs.mkdirSync(path.dirname(pluginPath), { recursive: true });
  fs.writeFileSync(pluginPath, OPENCODE_CRG_PLUGIN, 'utf8');
  return { status: exists ? 'updated' : 'created', path: pluginPath, contract: 'ok', previousContract: before?.verdict ?? null };
}

export function removeOpencodePlugin(opencodeHome, { dryRun = false, io = console } = {}) {
  const home = resolveUserPath(opencodeHome);
  if (!home) return { status: 'skipped' };
  const pluginPath = path.join(home, 'plugins', 'crg-plugin.ts');
  if (!fs.existsSync(pluginPath)) return { status: 'missing', path: pluginPath };
  const raw = fs.readFileSync(pluginPath, 'utf8');
  if (!isAiosOwnedPluginSource(raw)) {
    io.log(`[warn] opencode plugin is not CRG-managed, skipping: ${pluginPath}`);
    return { status: 'skipped', path: pluginPath };
  }
  if (dryRun) return { status: 'planned', path: pluginPath };
  fs.writeFileSync(backupFilePath(pluginPath), raw, 'utf8');
  fs.unlinkSync(pluginPath);
  return { status: 'removed', path: pluginPath };
}
