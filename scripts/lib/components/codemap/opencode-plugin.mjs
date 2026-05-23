import fs from 'node:fs';
import path from 'node:path';

import { backupFilePath, resolveUserPath } from './paths.mjs';

const OPENCODE_CRG_PLUGIN = `import type { Plugin } from "@opencode-ai/plugin"

/**
 * AIOS code-review-graph plugin for OpenCode.
 * Keeps the graph fresh without blocking normal coding sessions.
 */
export default (_app: any) => {
  const app = _app

  app.on("file.edited", async ({ $ }: { $: any }) => {
    try {
      await $\`uvx code-review-graph update --skip-flows\`.quiet()
    } catch {
      // Graph updates are best-effort and must never block edits.
    }
  })

  app.on("session.created", async ({ $ }: { $: any }) => {
    try {
      const result = await $\`uvx code-review-graph status\`.quiet()
      const output = result.stdout?.toString().trim()
      if (output) console.log("[code-review-graph]", output)
    } catch {
      // Some projects may not have a graph yet.
    }
  })

  app.on("tool.execute.before", async (ctx: any) => {
    try {
      const input = ctx?.input ?? ctx?.params ?? {}
      const cmd = input.command ?? input.cmd ?? input.content ?? ""
      if (typeof cmd === "string" && /^git\\s+commit/i.test(cmd)) {
        const result = await ctx.$\`uvx code-review-graph detect-changes --brief\`.quiet()
        const output = result.stdout?.toString().trim()
        if (output) console.log("[code-review-graph] Pre-commit analysis:\\n" + output)
      }
    } catch {
      // Never block commits.
    }
  })
}
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
