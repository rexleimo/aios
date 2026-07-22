// scripts/lib/aios-init/hooks.mjs — AIOS hook 命令构建与 settings 注入
// 从 aios-init.mjs 拆分：save guard、offload capture、command rewrite hook 的构建与 upsert

import { basename, dirname, resolve } from 'node:path';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

import { AGENT_CONFIG } from './agent-config.mjs';

function shellQuote(value) {
  const text = String(value || '');
  return /^[A-Za-z0-9_./:@=-]+$/u.test(text) ? text : `'${text.replace(/'/g, `'\\''`)}'`;
}

export function resolveAiosRuntimeRoot(env = process.env, aiosRoot) {
  const explicitRoot = String(aiosRoot || '').trim();
  if (explicitRoot) return resolve(explicitRoot);

  const candidates = [env.AIOS_ROOT_DIR, env.AIOS_ROOT, env.ROOTPATH, env.AIOS_INSTALL_DIR];
  for (const candidate of candidates) {
    const root = String(candidate || '').trim();
    if (root) return resolve(root);
  }
  return aiosRoot;
}

export function buildSaveGuardCommand(agent, workspaceRoot, { env = process.env, aiosRoot } = {}) {
  const cfg = AGENT_CONFIG[agent];
  const root = resolve(workspaceRoot || process.cwd());
  const project = basename(root) || 'aios';
  const ctxAgentPath = resolve(resolveAiosRuntimeRoot(env, aiosRoot), 'scripts', 'ctx-agent.mjs');
  return [
    'node', shellQuote(ctxAgentPath),
    '--agent', cfg.bridgeName,
    '--workspace', shellQuote(root),
    '--project', shellQuote(project),
    '--save-guard', '--status', 'done', '--no-bootstrap',
  ].join(' ');
}

export function buildOffloadCaptureCommand(agent, workspaceRoot, { env = process.env, aiosRoot } = {}) {
  const cfg = AGENT_CONFIG[agent];
  const root = resolve(workspaceRoot || process.cwd());
  const aiosPath = resolve(resolveAiosRuntimeRoot(env, aiosRoot), 'scripts', 'aios.mjs');
  return [
    `AIOS_OFFLOAD_CLIENT=${shellQuote(cfg.bridgeName)}`,
    'node', shellQuote(aiosPath),
    'internal', 'offload', 'capture',
    '--workspace', shellQuote(root),
  ].join(' ');
}

export function buildCommandRewriteHookCommand(agent, workspaceRoot, { env = process.env, aiosRoot } = {}) {
  const cfg = AGENT_CONFIG[agent];
  const runtimeRoot = resolveAiosRuntimeRoot(env, aiosRoot);
  const hookPath = resolve(runtimeRoot, 'scripts', 'hooks', 'claude', 'aios-rewrite.sh');
  if (!cfg || cfg.cli !== 'claude') return '';
  return [`AIOS_ROOT_DIR=${shellQuote(runtimeRoot)}`, 'bash', shellQuote(hookPath)].join(' ');
}

function buildHookEntry(agent, command, { matcher = '' } = {}) {
  if (agent === 'claude') {
    return { matcher, hooks: [{ type: 'command', command }] };
  }
  return { matcher: '', command };
}

function isSaveGuardCommand(command) {
  const text = String(command || '');
  return text.includes('ctx-agent.mjs') && (
    text.includes('--save-guard') || text.includes('--checkpoint-status') || text.includes('checkpoint-status completed')
  );
}

function findHookInList(hooks, isMatchFn) {
  for (let entryIndex = 0; entryIndex < hooks.length; entryIndex += 1) {
    const entry = hooks[entryIndex];
    if (!entry || typeof entry !== 'object') continue;
    if (isMatchFn(entry.command)) {
      return { entryIndex, hookIndex: -1, command: entry.command, schema: 'top-level' };
    }
    if (Array.isArray(entry.hooks)) {
      for (let hookIndex = 0; hookIndex < entry.hooks.length; hookIndex += 1) {
        const hook = entry.hooks[hookIndex];
        if (hook && typeof hook === 'object' && isMatchFn(hook.command)) {
          return { entryIndex, hookIndex, command: hook.command, schema: 'nested' };
        }
      }
    }
  }
  return null;
}

const findSaveGuardHook = (hooks) => findHookInList(hooks, isSaveGuardCommand);
const findOffloadCaptureHook = (hooks) => findHookInList(hooks, (cmd) => String(cmd || '').includes('aios.mjs') && cmd.includes('internal offload capture'));
const findCommandRewriteHook = (hooks) => findHookInList(hooks, (cmd) => String(cmd || '').includes('aios-rewrite.sh'));

function upsertHookList(hooks, agent, hookCommand, isMatchFn, buildEntry, matcher = '') {
  const existing = findHookInList(hooks, isMatchFn);
  if (!existing) {
    return { action: 'add', hooks: [...hooks, buildEntry(agent, hookCommand, { matcher })] };
  }
  const needsSchemaUpgrade = agent === 'claude' && existing.schema !== 'nested';
  if (existing.command === hookCommand && !needsSchemaUpgrade) {
    return { action: 'skip', hooks };
  }
  const nextHooks = [...hooks];
  const entry = nextHooks[existing.entryIndex];
  if (agent === 'claude') {
    if (existing.hookIndex >= 0 && Array.isArray(entry.hooks)) {
      const nextInner = [...entry.hooks];
      nextInner[existing.hookIndex] = { ...nextInner[existing.hookIndex], type: nextInner[existing.hookIndex].type || 'command', command: hookCommand };
      nextHooks[existing.entryIndex] = matcher ? { ...entry, matcher, hooks: nextInner } : { ...entry, hooks: nextInner };
    } else {
      nextHooks[existing.entryIndex] = buildEntry(agent, hookCommand, { matcher });
    }
    return { action: 'update', hooks: nextHooks };
  }
  nextHooks[existing.entryIndex] = { ...entry, command: hookCommand };
  return { action: 'update', hooks: nextHooks };
}

function combineHookActions(...actions) {
  if (actions.includes('update')) return 'update';
  if (actions.includes('add')) return 'add';
  return 'skip';
}

export function ensureHook(workspaceRoot, agent, { dryRun = false, env = process.env, aiosRoot } = {}) {
  const cfg = AGENT_CONFIG[agent];
  if (!cfg || !cfg.hookFile) return null;

  const hookPath = resolve(workspaceRoot, cfg.hookFile);
  const hookCommand = buildSaveGuardCommand(cfg.cli, workspaceRoot, { env, aiosRoot });
  const offloadCommand = agent === 'claude' ? buildOffloadCaptureCommand(cfg.cli, workspaceRoot, { env, aiosRoot }) : '';
  const commandRewriteCommand = agent === 'claude' ? buildCommandRewriteHookCommand(cfg.cli, workspaceRoot, { env, aiosRoot }) : '';

  let settings = {};
  try { settings = JSON.parse(readFileSync(hookPath, 'utf8')); } catch { /* will create */ }

  const hooks = settings.hooks || {};
  const stopHooks = hooks.Stop || [];
  const preToolUseHooks = hooks.PreToolUse || [];
  const postToolUseHooks = hooks.PostToolUse || [];

  const hookPlan = upsertHookList(stopHooks, agent, hookCommand, isSaveGuardCommand, buildHookEntry);
  const commandRewritePlan = commandRewriteCommand
    ? upsertHookList(preToolUseHooks, agent, commandRewriteCommand, (cmd) => String(cmd || '').includes('aios-rewrite.sh'), buildHookEntry, 'Bash')
    : { action: 'skip', hooks: preToolUseHooks };
  const offloadPlan = offloadCommand
    ? upsertHookList(postToolUseHooks, agent, offloadCommand, (cmd) => String(cmd || '').includes('internal offload capture'), buildHookEntry)
    : { action: 'skip', hooks: postToolUseHooks };
  const combinedAction = combineHookActions(hookPlan.action, commandRewritePlan.action, offloadPlan.action);

  if (combinedAction === 'skip') {
    return { path: hookPath, action: 'skip', reason: 'save guard, command rewrite, and offload hooks already present' };
  }
  if (dryRun) {
    const action = combinedAction === 'update' ? 'would-update' : 'would-add';
    const verb = combinedAction === 'update' ? 'would update' : 'would add';
    return { path: hookPath, action, reason: `${verb} hooks: Stop=${hookCommand}${commandRewriteCommand ? `; PreToolUse=${commandRewriteCommand}` : ''}${offloadCommand ? `; PostToolUse=${offloadCommand}` : ''}` };
  }

  settings.hooks = { ...hooks, Stop: hookPlan.hooks };
  if (commandRewriteCommand) settings.hooks.PreToolUse = commandRewritePlan.hooks;
  if (offloadCommand) settings.hooks.PostToolUse = offloadPlan.hooks;

  mkdirSync(dirname(hookPath), { recursive: true });
  writeFileSync(hookPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
  return {
    path: hookPath,
    action: combinedAction === 'update' ? 'updated' : 'added',
    reason: combinedAction === 'update' ? 'hooks updated for auto-save/rewrite/offload' : 'hooks added for auto-save/rewrite/offload',
  };
}
