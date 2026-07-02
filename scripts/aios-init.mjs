#!/usr/bin/env node
// scripts/aios-init.mjs — 薄壳入口，逻辑在 scripts/lib/aios-init/
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { initWorkspace } from './lib/contextdb/workspace.mjs';
import { buildSkillIndex, writeSkillIndex } from './lib/contextdb/skill-index.mjs';
import { ensurePersonaLayer } from './lib/memo/persona.mjs';
import { ensureWorkspaceMemorySession } from './lib/memo/workspace-memory.mjs';
import { AGENT_CONFIG, detectAgents, ensureMarker } from './lib/aios-init/agent-config.mjs';
import { ensureHook } from './lib/aios-init/hooks.mjs';
import { ensureCompressionTools } from './lib/aios-init/compression-tools.mjs';

const AIOS_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function ensureWorkspace(workspaceRoot, { dryRun = false } = {}) {
  if (dryRun) return { workspace: 'would-init' };
  const ws = await initWorkspace(workspaceRoot);
  const index = await buildSkillIndex(workspaceRoot);
  await writeSkillIndex(workspaceRoot, index);
  try { ensurePersonaLayer('persona', { env: process.env }); }
  catch (e) { console.warn(`[warn] persona init skipped: ${e.message}`); }
  try { ensurePersonaLayer('user', { env: process.env }); }
  catch (e) { console.warn(`[warn] user profile init skipped: ${e.message}`); }
  try { ensureWorkspaceMemorySession(workspaceRoot); }
  catch (e) { console.warn(`[warn] workspace memory init skipped: ${e.message}`); }
  return {
    workspace: ws.created ? 'created' : 'existing',
    skillIndex: `${index.skills.length} skills indexed`,
  };
}

function usage() {
  console.log(`Usage: aios init [--agent <claude|codex|gemini|opencode>] [--all] [--dry-run] [--yes-compression-tools]

Initialize AIOS ContextDB for this project. Idempotent — safe to run multiple times.

Options:
  --agent <name>              Init only the specified agent
  --all                      Init all four agents (even if CLI not detected)
  --dry-run                  Preview what would be done without writing files
  --yes-compression-tools    Skip RTK/Caveman privacy prompt (auto-consent)`);
}

export async function main(argv = process.argv.slice(2)) {
  if (argv.includes('-h') || argv.includes('--help')) {
    usage();
    process.exit(0);
  }

  const dryRun = argv.includes('--dry-run');
  const allFlag = argv.includes('--all');
  const yesCompressionTools = argv.includes('--yes-compression-tools');
  const agentIdx = argv.indexOf('--agent');
  const requestedAgent = agentIdx !== -1 ? argv[agentIdx + 1] : '';

  if (requestedAgent && !AGENT_CONFIG[requestedAgent]) {
    console.error(`Unknown agent: ${requestedAgent}. Supported: claude, codex, gemini, opencode`);
    process.exit(1);
  }

  const workspaceRoot = resolve(process.cwd());
  const agents = requestedAgent
    ? [requestedAgent]
    : allFlag
      ? Object.keys(AGENT_CONFIG)
      : detectAgents();

  if (agents.length === 0) {
    console.log('No supported AI coding agents detected.');
    console.log('Supported: claude, codex, gemini, opencode');
    console.log('Use --all to initialize for all agents regardless of detection.');
    process.exit(0);
  }

  console.log(`AIOS Init${dryRun ? ' (dry-run)' : ''}`);
  console.log(`Workspace: ${workspaceRoot}`);
  console.log(`Agents detected: ${agents.join(', ')}`);
  console.log('');

  // 1. Workspace + memory layers
  const wsResult = await ensureWorkspace(workspaceRoot, { dryRun });
  if (!dryRun) {
    console.log(`Workspace: ${wsResult.workspace} (${wsResult.skillIndex})`);
  }

  // 1b. 社区压缩工具 RTK + Caveman 自动检测+安装
  console.log('');
  console.log('== Compression Tools (RTK + Caveman) ==');
  const toolResult = await ensureCompressionTools({ dryRun, yesCompressionTools, agents });
  console.log('');

  // 2. Per-agent config
  const dedupedConfigs = new Set();
  for (const agent of agents) {
    const cfg = AGENT_CONFIG[agent];
    if (!cfg) continue;
    if (dedupedConfigs.has(cfg.configFile)) {
      console.log(`${agent}: shares ${cfg.configFile} (already processed)`);
      continue;
    }
    dedupedConfigs.add(cfg.configFile);

    const markerResult = ensureMarker(workspaceRoot, cfg.configFile, { dryRun });
    const markerIcon = dryRun ? '?' : markerResult.action === 'skip' ? '✓' : '+';
    console.log(`${markerIcon} ${cfg.configFile}: ${markerResult.reason}`);

    if (cfg.hasHook) {
      const hookResult = ensureHook(workspaceRoot, agent, { dryRun, aiosRoot: AIOS_ROOT });
      if (hookResult) {
        const hookIcon = dryRun ? '?' : hookResult.action === 'skip' ? '✓' : '+';
        console.log(`${hookIcon} ${cfg.hookFile}: ${hookResult.reason}`);
      }
    } else {
      console.log(`- ${agent}: no hook support (bridge provides save guard)`);
    }
  }

  if (dryRun) {
    console.log('\nDry-run complete. Run without --dry-run to apply.');
  } else {
    console.log(`\nDone. Run your agent directly to start using the context registry.`);
  }
}

// 兼容直接调用：cli/dispatch.mjs 中 init 命令通过 import({ main }) 引用
export { main as default };

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error.message || String(error));
    process.exit(1);
  });
}
