// scripts/lib/lifecycle/work.mjs — aios work 统一并发调度入口
// 中文注释：work 只做语义翻译（选项 → env → runOrchestrate），调度/守卫/证据全部复用既有引擎。

import { runOrchestrate } from './orchestrate.mjs';
import { normalizeWorkOptions, buildWorkRuntimeEnv } from './work/options.mjs';

export async function runWorkCommand(
  options = {},
  { rootDir, io = console, env = process.env, orchestrateRunner = runOrchestrate } = {}
) {
  const opts = normalizeWorkOptions(options, env);
  const runtimeEnv = buildWorkRuntimeEnv(opts, env);

  return orchestrateRunner({
    blueprint: opts.blueprint,
    taskTitle: opts.taskTitle,
    contextSummary: opts.contextSummary,
    planPath: opts.planPath,
    sessionId: opts.sessionId,
    resumeSessionId: opts.resumeSessionId,
    retryBlocked: opts.retryBlocked,
    force: opts.force,
    limit: opts.limit,
    dispatchMode: opts.dispatchMode,
    executionMode: opts.executionMode,
    preflightMode: opts.preflightMode,
    format: opts.format,
  }, {
    rootDir,
    env: runtimeEnv,
    io,
  });
}
