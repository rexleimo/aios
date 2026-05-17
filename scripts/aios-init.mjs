#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initWorkspace } from './lib/contextdb/workspace.mjs';
import { buildSkillIndex, writeSkillIndex } from './lib/contextdb/skill-index.mjs';
import { ensurePersonaLayer } from './lib/memo/persona.mjs';
import { ensureWorkspaceMemorySession } from './lib/memo/workspace-memory.mjs';

const AIOS_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

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

const MARKER = '<!-- AIOS: .aios/context-db/index.json -->';
const LEGACY_MARKER = '<!-- AIOS: memory/context-db/index.json -->';
const MARKERS = [MARKER, LEGACY_MARKER];

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
    return MARKERS.some((marker) => content.includes(marker));
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

function shellQuote(value) {
  const text = String(value || '');
  return /^[A-Za-z0-9_./:@=-]+$/u.test(text) ? text : `'${text.replace(/'/g, `'\\''`)}'`;
}

function resolveAiosRuntimeRoot(env = process.env) {
  const candidates = [
    env.AIOS_ROOT_DIR,
    env.AIOS_ROOT,
    env.ROOTPATH,
    env.AIOS_INSTALL_DIR,
  ];
  for (const candidate of candidates) {
    const root = String(candidate || '').trim();
    if (root) return resolve(root);
  }
  return AIOS_ROOT;
}

export function buildSaveGuardCommand(agent, workspaceRoot, { env = process.env } = {}) {
  const cfg = AGENT_CONFIG[agent];
  const root = resolve(workspaceRoot || process.cwd());
  const project = basename(root) || 'aios';
  const ctxAgentPath = resolve(resolveAiosRuntimeRoot(env), 'scripts', 'ctx-agent.mjs');
  return [
    'node',
    shellQuote(ctxAgentPath),
    '--agent',
    cfg.bridgeName,
    '--workspace',
    shellQuote(root),
    '--project',
    shellQuote(project),
    '--save-guard',
    '--status',
    'done',
    '--no-bootstrap',
  ].join(' ');
}

export function buildOffloadCaptureCommand(agent, workspaceRoot, { env = process.env } = {}) {
  const cfg = AGENT_CONFIG[agent];
  const root = resolve(workspaceRoot || process.cwd());
  const aiosPath = resolve(resolveAiosRuntimeRoot(env), 'scripts', 'aios.mjs');
  return [
    `AIOS_OFFLOAD_CLIENT=${shellQuote(cfg.bridgeName)}`,
    'node',
    shellQuote(aiosPath),
    'internal',
    'offload',
    'capture',
    '--workspace',
    shellQuote(root),
  ].join(' ');
}

function buildHookEntry(agent, command) {
  if (agent === 'claude') {
    return {
      matcher: '',
      hooks: [
        {
          type: 'command',
          command,
        },
      ],
    };
  }

  return {
    matcher: '',
    command,
  };
}

function isSaveGuardCommand(command) {
  const text = String(command || '');
  return text.includes('ctx-agent.mjs') && (
    text.includes('--save-guard') || text.includes('--checkpoint-status') || text.includes('checkpoint-status completed')
  );
}

function findSaveGuardHook(stopHooks) {
  for (let entryIndex = 0; entryIndex < stopHooks.length; entryIndex += 1) {
    const entry = stopHooks[entryIndex];
    if (!entry || typeof entry !== 'object') continue;

    if (isSaveGuardCommand(entry.command)) {
      return { entryIndex, hookIndex: -1, command: entry.command, schema: 'top-level' };
    }

    if (Array.isArray(entry.hooks)) {
      for (let hookIndex = 0; hookIndex < entry.hooks.length; hookIndex += 1) {
        const hook = entry.hooks[hookIndex];
        if (hook && typeof hook === 'object' && isSaveGuardCommand(hook.command)) {
          return { entryIndex, hookIndex, command: hook.command, schema: 'nested' };
        }
      }
    }
  }

  return null;
}

function isOffloadCaptureCommand(command) {
  const text = String(command || '');
  return text.includes('aios.mjs') && text.includes('internal offload capture');
}

function findOffloadCaptureHook(postToolUseHooks) {
  for (let entryIndex = 0; entryIndex < postToolUseHooks.length; entryIndex += 1) {
    const entry = postToolUseHooks[entryIndex];
    if (!entry || typeof entry !== 'object') continue;

    if (isOffloadCaptureCommand(entry.command)) {
      return { entryIndex, hookIndex: -1, command: entry.command, schema: 'top-level' };
    }

    if (Array.isArray(entry.hooks)) {
      for (let hookIndex = 0; hookIndex < entry.hooks.length; hookIndex += 1) {
        const hook = entry.hooks[hookIndex];
        if (hook && typeof hook === 'object' && isOffloadCaptureCommand(hook.command)) {
          return { entryIndex, hookIndex, command: hook.command, schema: 'nested' };
        }
      }
    }
  }

  return null;
}

function upsertSaveGuardHook(stopHooks, agent, hookCommand) {
  const existing = findSaveGuardHook(stopHooks);

  if (!existing) {
    return { action: 'add', stopHooks: [...stopHooks, buildHookEntry(agent, hookCommand)] };
  }

  const needsSchemaUpgrade = agent === 'claude' && existing.schema !== 'nested';
  if (existing.command === hookCommand && !needsSchemaUpgrade) {
    return { action: 'skip', stopHooks };
  }

  const nextStopHooks = [...stopHooks];
  const entry = nextStopHooks[existing.entryIndex];

  if (agent === 'claude') {
    if (existing.hookIndex >= 0 && Array.isArray(entry.hooks)) {
      const nextHooks = [...entry.hooks];
      nextHooks[existing.hookIndex] = {
        ...nextHooks[existing.hookIndex],
        type: nextHooks[existing.hookIndex].type || 'command',
        command: hookCommand,
      };
      nextStopHooks[existing.entryIndex] = {
        ...entry,
        hooks: nextHooks,
      };
    } else {
      nextStopHooks[existing.entryIndex] = buildHookEntry(agent, hookCommand);
    }
    return { action: 'update', stopHooks: nextStopHooks };
  }

  nextStopHooks[existing.entryIndex] = {
    ...entry,
    command: hookCommand,
  };
  return { action: 'update', stopHooks: nextStopHooks };
}

function upsertOffloadCaptureHook(postToolUseHooks, agent, hookCommand) {
  const existing = findOffloadCaptureHook(postToolUseHooks);

  if (!existing) {
    return { action: 'add', postToolUseHooks: [...postToolUseHooks, buildHookEntry(agent, hookCommand)] };
  }

  const needsSchemaUpgrade = agent === 'claude' && existing.schema !== 'nested';
  if (existing.command === hookCommand && !needsSchemaUpgrade) {
    return { action: 'skip', postToolUseHooks };
  }

  const nextPostToolUseHooks = [...postToolUseHooks];
  const entry = nextPostToolUseHooks[existing.entryIndex];

  if (agent === 'claude') {
    if (existing.hookIndex >= 0 && Array.isArray(entry.hooks)) {
      const nextHooks = [...entry.hooks];
      nextHooks[existing.hookIndex] = {
        ...nextHooks[existing.hookIndex],
        type: nextHooks[existing.hookIndex].type || 'command',
        command: hookCommand,
      };
      nextPostToolUseHooks[existing.entryIndex] = {
        ...entry,
        hooks: nextHooks,
      };
    } else {
      nextPostToolUseHooks[existing.entryIndex] = buildHookEntry(agent, hookCommand);
    }
    return { action: 'update', postToolUseHooks: nextPostToolUseHooks };
  }

  nextPostToolUseHooks[existing.entryIndex] = {
    ...entry,
    command: hookCommand,
  };
  return { action: 'update', postToolUseHooks: nextPostToolUseHooks };
}

function combineHookActions(stopAction, offloadAction) {
  if (stopAction === 'update' || offloadAction === 'update') return 'update';
  if (stopAction === 'add' || offloadAction === 'add') return 'add';
  return 'skip';
}

export function ensureHook(workspaceRoot, agent, { dryRun = false, env = process.env } = {}) {
  const cfg = AGENT_CONFIG[agent];
  if (!cfg || !cfg.hookFile) return null;

  const hookPath = resolve(workspaceRoot, cfg.hookFile);
  const hookCommand = buildSaveGuardCommand(cfg.cli, workspaceRoot, { env });
  const offloadCommand = agent === 'claude'
    ? buildOffloadCaptureCommand(cfg.cli, workspaceRoot, { env })
    : '';

  let settings = {};
  try {
    settings = JSON.parse(readFileSync(hookPath, 'utf8'));
  } catch {
    // will create
  }

  // Check if hook already exists
  const hooks = settings.hooks || {};
  const stopHooks = hooks.Stop || [];
  const postToolUseHooks = hooks.PostToolUse || [];
  const hookPlan = upsertSaveGuardHook(stopHooks, agent, hookCommand);
  const offloadPlan = offloadCommand
    ? upsertOffloadCaptureHook(postToolUseHooks, agent, offloadCommand)
    : { action: 'skip', postToolUseHooks };
  const combinedAction = combineHookActions(hookPlan.action, offloadPlan.action);

  if (combinedAction === 'skip') {
    return { path: hookPath, action: 'skip', reason: 'save guard and offload hooks already present' };
  }

  if (dryRun) {
    const action = combinedAction === 'update' ? 'would-update' : 'would-add';
    const verb = combinedAction === 'update' ? 'would update' : 'would add';
    return { path: hookPath, action, reason: `${verb} hooks: Stop=${hookCommand}${offloadCommand ? `; PostToolUse=${offloadCommand}` : ''}` };
  }

  settings.hooks = {
    ...hooks,
    Stop: hookPlan.stopHooks,
  };
  if (offloadCommand) {
    settings.hooks.PostToolUse = offloadPlan.postToolUseHooks;
  }

  mkdirSync(dirname(hookPath), { recursive: true });
  writeFileSync(hookPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
  return {
    path: hookPath,
    action: combinedAction === 'update' ? 'updated' : 'added',
    reason: combinedAction === 'update' ? 'hooks updated for auto-save/offload' : 'hooks added for auto-save/offload',
  };
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

export async function main(argv = process.argv.slice(2)) {
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

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error.message || String(error));
    process.exit(1);
  });
}
