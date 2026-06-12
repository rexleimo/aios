import { shouldAutoCreateMarker } from './workspace.mjs';

export function shouldDebug(env) {
  const value = (env.CTXDB_DEBUG || '').trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'yes' || value === 'on';
}

export function logBridgeDecision({
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
}) {
  if (!shouldDebug(env)) return;

  const reason = shouldWrap
    ? (aiosInitDone ? 'wrap (aios init detected)' : 'wrap')
    : blockedSubcommand
      ? 'blocked-subcommand'
      : !runner
        ? 'runner-missing'
        : !workspace
          ? 'workspace-missing'
          : 'mode-blocked';
  console.error(
    `[contextdb-shell-bridge] command=${opts.command} agent=${opts.agent} decision=${reason} workspace=${workspace || '-'}`
  );

  if (mode === 'opt-in') {
    console.error(
      `[contextdb-shell-bridge] opt-in marker created=${markerCreated ? 'yes' : 'no'} auto-create=${shouldAutoCreateMarker(env) ? 'on' : 'off'}`
    );
    if (markerCreateError) {
      console.error(`[contextdb-shell-bridge] opt-in marker create error=${markerCreateError}`);
    }
  }
}
