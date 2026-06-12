import path from 'node:path';
import { normalizeCodeHome } from './code-home.mjs';
import { parseArgs, usage, validateOptions } from './cli.mjs';
import { writeBridgeContextIndex } from './context-index.mjs';
import { logBridgeDecision } from './debug.mjs';
import { buildPrivacyBanner, shouldPrintPrivacyBanner } from './privacy.mjs';
import { extractOneShotPrompt, isInteractivePassthrough } from './prompts.mjs';
import { spawnInherited } from './process-runner.mjs';
import {
  detectAiosMarker,
  detectRunner,
  detectWorkspaceRoot,
  isBlockedSubcommand,
  shouldWrapWorkspace,
  tryEnsureOptInMarker,
} from './workspace.mjs';

function validateOrExit(opts) {
  try {
    validateOptions(opts);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[contextdb-shell-bridge] ${message}`);
    usage();
    return false;
  }
}

function normalizePassthroughArgs(command, firstArg, passthroughArgs) {
  const isVersionArg = command === 'opencode'
    && (firstArg === 'version' || firstArg === 'VERSION');
  return isVersionArg
    ? ['--version', ...passthroughArgs.slice(1)]
    : passthroughArgs;
}

function buildWrappedRunnerArgs({ runner, workspace, opts, project, aiosInitDone }) {
  const args = [
    ...runner.args,
    '--workspace', workspace,
    '--agent', opts.agent,
    '--project', project,
  ];

  if (aiosInitDone) {
    args.push('--no-bootstrap');
  }

  const oneShot = extractOneShotPrompt(opts.command, opts.passthroughArgs);
  if (oneShot.printMode && oneShot.prompt) {
    args.push('--prompt', oneShot.prompt);
  }

  args.push('--', ...oneShot.remainingArgs);
  return args;
}

function buildDirectNativeBlockMessage({ opts, workspace, project }) {
  const command = [
    'node',
    path.join('scripts', 'ctx-agent.mjs'),
    '--agent',
    opts.agent,
    '--workspace',
    workspace,
    '--project',
    project || path.basename(workspace),
  ].join(' ');
  return [
    '[contextdb-shell-bridge] direct native agent execution blocked',
    'AIOS workspaces require pre_send/post_receive turn compression.',
    `Use: ${command}`,
    'Set CTXDB_ALLOW_DIRECT_NATIVE_AGENT=1 only for explicit diagnostics.',
  ].join('\n');
}

function shouldBlockDirectNativeAgent({ env, interactive, workspace, aiosInitDone, shouldWrap }) {
  if (env.CTXDB_ALLOW_DIRECT_NATIVE_AGENT === '1') return false;
  return Boolean(interactive && workspace && aiosInitDone && !shouldWrap);
}

function resolvePathKeys(env) {
  return Object.keys(env || {}).filter((key) => key.toLowerCase() === 'path');
}

function samePathEntry(left, right) {
  const a = path.resolve(String(left || ''));
  const b = path.resolve(String(right || ''));
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function buildChildEnv(env) {
  const shimDir = String(env.AIOS_NATIVE_SHIM_DIR || '').trim();
  if (!shimDir) return env;

  const next = { ...env };
  for (const key of resolvePathKeys(next)) {
    const entries = String(next[key] || '').split(path.delimiter);
    next[key] = entries.filter((entry) => entry && !samePathEntry(entry, shimDir)).join(path.delimiter);
  }
  return next;
}

async function prepareBridgeState(opts, env) {
  const firstArg = opts.passthroughArgs[0] || '';
  const blockedSubcommand = isBlockedSubcommand(opts.command, firstArg);
  const runner = blockedSubcommand ? null : detectRunner(env);
  const workspace = blockedSubcommand ? '' : detectWorkspaceRoot(opts.cwd);
  const project = env.CTXDB_REPO_NAME || (workspace ? path.basename(workspace) : '');

  if (workspace && !blockedSubcommand) {
    await writeBridgeContextIndex({ workspace, agent: opts.agent, env });
  }

  return { firstArg, blockedSubcommand, runner, workspace, project };
}

export async function main(argv = process.argv.slice(2)) {
  const opts = parseArgs(argv);
  if (opts.help) {
    usage();
    process.exit(0);
  }
  if (!validateOrExit(opts)) {
    process.exit(2);
  }

  const env = { ...process.env };
  if (opts.command === 'codex') {
    normalizeCodeHome(env, opts.cwd);
  }

  const {
    firstArg,
    blockedSubcommand,
    runner,
    workspace,
    project,
  } = await prepareBridgeState(opts, env);

  const aiosInitDone = workspace ? detectAiosMarker(workspace).found : false;
  const interactive = isInteractivePassthrough(opts.command, opts.passthroughArgs);

  const mode = (env.CTXDB_WRAP_MODE || 'repo-only').trim().toLowerCase();
  let markerCreated = false;
  let markerCreateError = '';
  if (!blockedSubcommand && runner && workspace && mode === 'opt-in') {
    const markerResult = tryEnsureOptInMarker(workspace, env);
    markerCreated = markerResult.created;
    markerCreateError = markerResult.error;
  }

  const allowedByMode = workspace ? shouldWrapWorkspace(workspace, env) : false;
  const shouldWrap = Boolean(!blockedSubcommand && runner && workspace && allowedByMode);
  logBridgeDecision({
    env,
    opts,
    shouldWrap,
    aiosInitDone,
    blockedSubcommand,
    runner,
    workspace,
    mode,
    markerCreated,
    markerCreateError,
  });

  if (shouldPrintPrivacyBanner(env, interactive)) {
    process.stderr.write(buildPrivacyBanner({
      command: opts.command,
      agent: opts.agent,
      shouldWrap,
      env,
    }));
  }

  const normalizedArgs = normalizePassthroughArgs(opts.command, firstArg, opts.passthroughArgs);
  if (shouldBlockDirectNativeAgent({ env, interactive, workspace, aiosInitDone, shouldWrap })) {
    process.stderr.write(`${buildDirectNativeBlockMessage({ opts, workspace, project })}\n`);
    process.exit(66);
  }

  if (!shouldWrap) {
    const code = spawnInherited(opts.command, normalizedArgs, opts.cwd, buildChildEnv(env));
    process.exit(code);
  }

  const args = buildWrappedRunnerArgs({ runner, workspace, opts, project, aiosInitDone });
  const code = spawnInherited(runner.command, args, opts.cwd, buildChildEnv(env));
  process.exit(code);
}
