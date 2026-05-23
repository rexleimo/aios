import path from 'node:path';
import { normalizeCodeHome } from './code-home.mjs';
import { parseArgs, usage, validateOptions } from './cli.mjs';
import { writeBridgeContextIndex } from './context-index.mjs';
import { logAutoPromptDecision, logBridgeDecision, shouldDebug } from './debug.mjs';
import { buildPrivacyBanner, shouldPrintPrivacyBanner } from './privacy.mjs';
import {
  buildInteractiveAutoPrompt,
  extractOneShotPrompt,
  isInteractivePassthrough,
  shouldInjectInteractiveAutoPrompt,
} from './prompts.mjs';
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
    args.push('--context-mode', 'slim', '--no-bootstrap');
  }

  const oneShot = extractOneShotPrompt(opts.command, opts.passthroughArgs);
  if (oneShot.printMode && oneShot.prompt) {
    args.push('--prompt', oneShot.prompt);
  }

  args.push('--', ...oneShot.remainingArgs);
  return args;
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

function maybeInjectAutoPrompt({ opts, env, interactive, runner, workspace, project, aiosInitDone }) {
  if (interactive && !env.CTXDB_AUTO_PROMPT && shouldInjectInteractiveAutoPrompt(env) && runner && workspace && !aiosInitDone) {
    env.CTXDB_AUTO_PROMPT = buildInteractiveAutoPrompt({
      agent: opts.agent,
      command: opts.command,
      workspaceRoot: workspace,
      project,
      env,
    });
    if (shouldDebug(env)) {
      const preview = String(env.CTXDB_AUTO_PROMPT || '').split(/\r?\n/u)[0] || 'continue';
      console.error(`[contextdb-shell-bridge] interactive detected; auto-prompt=${preview}`);
    }
    return;
  }

  if (interactive) {
    logAutoPromptDecision({ env, aiosInitDone, runner, workspace });
  }
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
  maybeInjectAutoPrompt({ opts, env, interactive, runner, workspace, project, aiosInitDone });

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
  if (!shouldWrap) {
    const code = spawnInherited(opts.command, normalizedArgs, opts.cwd, env);
    process.exit(code);
  }

  const args = buildWrappedRunnerArgs({ runner, workspace, opts, project, aiosInitDone });
  const code = spawnInherited(runner.command, args, opts.cwd, env);
  process.exit(code);
}
