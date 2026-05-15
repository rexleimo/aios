#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { initWorkspace } from './lib/contextdb/workspace.mjs';
import { buildSkillIndex, writeSkillIndex } from './lib/contextdb/skill-index.mjs';
import { ensurePersonaLayer } from './lib/memo/persona.mjs';
import { ensureWorkspaceMemorySession } from './lib/memo/workspace-memory.mjs';

// --- Agent config ---

const AGENT_CONFIG = {
  claude: {
    cli: 'claude',
    bridgeName: 'claude-code',
    configFile: 'CLAUDE.md',
    hookFile: '.claude/settings.local.json',
    hasHook: true,
  },
  codex: {
    cli: 'codex',
    bridgeName: 'codex-cli',
    configFile: 'AGENTS.md',
    hookFile: null,
    hasHook: false,
  },
  gemini: {
    cli: 'gemini',
    bridgeName: 'gemini-cli',
    configFile: 'GEMINI.md',
    hookFile: '.gemini/settings.json',
    hasHook: true,
  },
  opencode: {
    cli: 'opencode',
    bridgeName: 'opencode-cli',
    configFile: 'AGENTS.md',  // shares with codex
    hookFile: null,
    hasHook: false,
  },
};

const MARKER = '<!-- AIOS: memory/context-db/index.json -->';

// --- Agent detection ---

function which(cmd) {
  try {
    return execSync(`which ${cmd}`, { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

function detectAgents() {
  const installed = [];
  const seenConfigs = new Set();
  for (const [name, cfg] of Object.entries(AGENT_CONFIG)) {
    if (!which(cfg.cli)) continue;
    // deduplicate by config file (codex and opencode share AGENTS.md)
    if (seenConfigs.has(cfg.configFile)) {
      installed.push(name);
      continue;
    }
    seenConfigs.add(cfg.configFile);
    installed.push(name);
  }
  return installed;
}

// --- Marker ---

function hasMarker(workspaceRoot, configFile) {
  try {
    const content = readFileSync(resolve(workspaceRoot, configFile), 'utf8');
    return content.includes(MARKER);
  } catch {
    return false;
  }
}

function ensureMarker(workspaceRoot, configFile, { dryRun = false } = {}) {
  const absPath = resolve(workspaceRoot, configFile);
  if (hasMarker(workspaceRoot, configFile)) {
    return { path: absPath, action: 'skip', reason: 'marker already present' };
  }

  if (dryRun) {
    return { path: absPath, action: 'would-add', reason: 'marker missing' };
  }

  try {
    const existing = readFileSync(absPath, 'utf8');
    writeFileSync(absPath, `${MARKER}\n${existing}`, 'utf8');
    return { path: absPath, action: 'prepended', reason: 'marker prepended to existing file' };
  } catch {
    writeFileSync(absPath, `${MARKER}\n`, 'utf8');
    return { path: absPath, action: 'created', reason: 'file created with marker' };
  }
}

// --- Hook ---

function buildSaveGuardCommand(agent, workspaceRoot) {
  const cfg = AGENT_CONFIG[agent];
  const root = resolve(workspaceRoot || process.cwd());
  const project = root.split('/').pop() || 'aios';
  return `node ${resolve(root, 'scripts', 'ctx-agent.mjs')} --agent ${cfg.bridgeName} --workspace ${root} --project ${project} --checkpoint-status completed`;
}

function ensureHook(workspaceRoot, agent, { dryRun = false } = {}) {
  const cfg = AGENT_CONFIG[agent];
  if (!cfg || !cfg.hookFile) return null;

  const hookPath = resolve(workspaceRoot, cfg.hookFile);
  const hookCommand = buildSaveGuardCommand(cfg.cli, workspaceRoot);

  let settings = {};
  try {
    settings = JSON.parse(readFileSync(hookPath, 'utf8'));
  } catch {
    // will create
  }

  // Check if hook already exists
  const hooks = settings.hooks || {};
  const stopHooks = hooks.Stop || [];
  const alreadyPresent = stopHooks.some((h) => h.command && h.command.includes('checkpoint-status completed'));

  if (alreadyPresent) {
    return { path: hookPath, action: 'skip', reason: 'save guard hook already present' };
  }

  if (dryRun) {
    return { path: hookPath, action: 'would-add', reason: `would add Stop hook: ${hookCommand}` };
  }

  settings.hooks = {
    ...hooks,
    Stop: [
      ...stopHooks,
      {
        matcher: '',
        command: hookCommand,
      },
    ],
  };

  writeFileSync(hookPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
  return { path: hookPath, action: 'added', reason: 'Stop hook added for auto-save' };
}

// --- Workspace init ---

async function ensureWorkspace(workspaceRoot, { dryRun = false } = {}) {
  if (dryRun) {
    return { workspace: 'would-init' };
  }

  const ws = await initWorkspace(workspaceRoot);
  const index = await buildSkillIndex(workspaceRoot);
  await writeSkillIndex(workspaceRoot, index);

  try {
    ensurePersonaLayer('persona', { env: process.env });
  } catch (e) {
    console.warn(`[warn] persona init skipped: ${e.message}`);
  }
  try {
    ensurePersonaLayer('user', { env: process.env });
  } catch (e) {
    console.warn(`[warn] user profile init skipped: ${e.message}`);
  }
  try {
    ensureWorkspaceMemorySession(workspaceRoot);
  } catch (e) {
    console.warn(`[warn] workspace memory init skipped: ${e.message}`);
  }

  return {
    workspace: ws.created ? 'created' : 'existing',
    skillIndex: `${index.skills.length} skills indexed`,
  };
}

// --- Main ---

function usage() {
  console.log(`Usage: aios init [--agent <claude|codex|gemini|opencode>] [--all] [--dry-run]

Initialize AIOS ContextDB for this project. Idempotent — safe to run multiple times.

Options:
  --agent <name>   Init only the specified agent
  --all            Init all four agents (even if CLI not detected)
  --dry-run        Preview what would be done without writing files`);
}

async function main(argv = process.argv.slice(2)) {
  if (argv.includes('-h') || argv.includes('--help')) {
    usage();
    process.exit(0);
  }

  const dryRun = argv.includes('--dry-run');
  const allFlag = argv.includes('--all');
  const agentIdx = argv.indexOf('--agent');
  const requestedAgent = agentIdx !== -1 ? argv[agentIdx + 1] : '';

  if (requestedAgent && !AGENT_CONFIG[requestedAgent]) {
    console.error(`Unknown agent: ${requestedAgent}. Supported: claude, codex, gemini, opencode`);
    process.exit(1);
  }

  const workspaceRoot = resolve(process.cwd());
  const project = workspaceRoot.split('/').pop() || 'aios';

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

  // 2. Per-agent config
  const dedupedConfigs = new Set();
  for (const agent of agents) {
    const cfg = AGENT_CONFIG[agent];
    if (!cfg) continue;

    // Deduplicate config files (codex + opencode share AGENTS.md)
    if (dedupedConfigs.has(cfg.configFile)) {
      console.log(`${agent}: shares ${cfg.configFile} (already processed)`);
      continue;
    }
    dedupedConfigs.add(cfg.configFile);

    // Marker
    const markerResult = ensureMarker(workspaceRoot, cfg.configFile, { dryRun });
    const markerIcon = dryRun ? '?' : markerResult.action === 'skip' ? '✓' : '+';
    console.log(`${markerIcon} ${cfg.configFile}: ${markerResult.reason}`);

    // Hook
    if (cfg.hasHook) {
      const hookResult = ensureHook(workspaceRoot, agent, { dryRun });
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

main().catch((error) => {
  console.error(error.message || String(error));
  process.exit(1);
});
