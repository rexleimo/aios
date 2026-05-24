/* 中文注释：watchdog 运行层只编排信号采集、决策和输出。 */
import { buildWatchdogReadiness, decideWatchdogRecovery } from './recovery.mjs';
import { formatWatchdogText } from './rendering.mjs';
import { collectWatchdogSignals } from './signals.mjs';

export async function buildTeamWatchdogState(options = {}, context = {}) {
  const rootDir = context.rootDir || process.cwd();
  const signals = await collectWatchdogSignals({
    rootDir,
    sessionId: options.sessionId || options.resumeSessionId,
    workspaceRoot: options.workspaceRoot || rootDir,
    nowMs: Number.isFinite(Number(context.nowMs)) ? Number(context.nowMs) : Number(context.nowFn?.() ?? Date.now()),
    provider: options.provider,
    workers: options.workers,
  });
  const recovery = decideWatchdogRecovery(signals);
  return {
    sessionId: signals.sessionId,
    ...recovery,
    readiness: buildWatchdogReadiness(recovery),
  };
}

export async function runTeamWatchdog(options = {}, { rootDir, io = console, nowFn = () => Date.now() } = {}) {
  const state = await buildTeamWatchdogState(options, { rootDir, nowFn });
  if (options.json === true) {
    io.log(JSON.stringify(state, null, 2));
  } else {
    io.log(formatWatchdogText(state));
  }
  return { exitCode: state.sessionId ? 0 : 1 };
}
