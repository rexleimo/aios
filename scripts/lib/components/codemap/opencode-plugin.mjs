import fs from 'node:fs';
import path from 'node:path';

import { backupFilePath, resolveUserPath } from './paths.mjs';

const OPENCODE_CRG_PLUGIN = `import type { Plugin } from "@opencode-ai/plugin"

const UPDATE_DELAY_MS = 3_000
const COMMAND_TIMEOUT_MS = 30_000

async function runCrg(cwd: string, args: string[]): Promise<string> {
  const proc = Bun.spawn(["uvx", "code-review-graph", ...args], {
    cwd,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "ignore",
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

export const CodeReviewGraphPlugin: Plugin = async ({ directory }) => {
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

export default CodeReviewGraphPlugin
`;

export function ensureOpencodePlugin(opencodeHome, { dryRun = false, io = console } = {}) {
  const home = resolveUserPath(opencodeHome);
  if (!home) return { status: 'skipped' };
  const pluginPath = path.join(home, 'plugins', 'crg-plugin.ts');
  const exists = fs.existsSync(pluginPath);
  const raw = exists ? fs.readFileSync(pluginPath, 'utf8') : '';
  if (raw === OPENCODE_CRG_PLUGIN) return { status: 'unchanged', path: pluginPath };
  if (exists && !/code-review-graph/iu.test(raw)) {
    io.log(`[warn] opencode plugin exists and is not CRG-managed, skipping: ${pluginPath}`);
    return { status: 'skipped', path: pluginPath };
  }
  if (dryRun) return { status: 'planned', path: pluginPath };
  if (exists) {
    fs.writeFileSync(backupFilePath(pluginPath), raw, 'utf8');
  }
  fs.mkdirSync(path.dirname(pluginPath), { recursive: true });
  fs.writeFileSync(pluginPath, OPENCODE_CRG_PLUGIN, 'utf8');
  return { status: exists ? 'updated' : 'created', path: pluginPath };
}

export function removeOpencodePlugin(opencodeHome, { dryRun = false, io = console } = {}) {
  const home = resolveUserPath(opencodeHome);
  if (!home) return { status: 'skipped' };
  const pluginPath = path.join(home, 'plugins', 'crg-plugin.ts');
  if (!fs.existsSync(pluginPath)) return { status: 'missing', path: pluginPath };
  const raw = fs.readFileSync(pluginPath, 'utf8');
  if (!/code-review-graph/iu.test(raw)) {
    io.log(`[warn] opencode plugin is not CRG-managed, skipping: ${pluginPath}`);
    return { status: 'skipped', path: pluginPath };
  }
  if (dryRun) return { status: 'planned', path: pluginPath };
  fs.writeFileSync(backupFilePath(pluginPath), raw, 'utf8');
  fs.unlinkSync(pluginPath);
  return { status: 'removed', path: pluginPath };
}
