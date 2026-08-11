// scripts/lib/lifecycle/work/options.mjs — aios work 命令的纯函数选项契约
// 中文注释：work 是 orchestrate 的语义化薄包装：默认 live 并发调度，dry-run 需显式；--serial 强制并发度 1。

import { buildDispatchRuntimeEnv } from '../../harness/orchestrator-runtimes/env.mjs';
import { normalizeOrchestratorBlueprint, normalizeOrchestratorFormat } from '../../harness/orchestrator.mjs';

export const WORK_DEFAULT_CLIENT_ID = 'codex-cli';
export const WORK_DEFAULT_CONCURRENCY = 3;

function normalizeLimit(raw) {
  const value = Number.parseInt(String(raw ?? '').trim(), 10);
  return Number.isFinite(value) && value > 0 ? value : 10;
}

export function normalizeWorkOptions(raw = {}, env = {}) {
  const taskTitle = String(raw.taskTitle || '').trim();
  const resumeSessionId = String(raw.resumeSessionId || '').trim();
  if (!taskTitle && !resumeSessionId) {
    throw new Error('work requires --task <title> (or --resume <session-id>)');
  }

  const sessionId = String(raw.sessionId || '').trim();
  const serial = raw.serial === true;
  const dryRun = raw.dryRun === true;
  const requestedConcurrency = Number.parseInt(String(raw.concurrency ?? '').trim(), 10);
  const concurrency = Number.isFinite(requestedConcurrency) && requestedConcurrency > 0
    ? requestedConcurrency
    : WORK_DEFAULT_CONCURRENCY;
  const clientId = String(raw.clientId || env.AIOS_SUBAGENT_CLIENT || WORK_DEFAULT_CLIENT_ID).trim();

  return {
    taskTitle,
    contextSummary: String(raw.contextSummary || '').trim(),
    clientId,
    concurrency: serial ? 1 : concurrency,
    serial,
    dryRun,
    // work 的承诺就是"干活即并发"：默认 live；--dry-run 显式降级为零成本预览。
    executionMode: dryRun ? 'dry-run' : 'live',
    dispatchMode: 'local',
    blueprint: normalizeOrchestratorBlueprint(raw.blueprint || 'feature'),
    planPath: String(raw.planPath || '').trim(),
    sessionId,
    resumeSessionId,
    retryBlocked: raw.retryBlocked === true,
    force: raw.force === true,
    preflightMode: sessionId ? 'auto' : 'none',
    format: normalizeOrchestratorFormat(raw.format || (raw.json === true ? 'json' : 'text')),
    limit: normalizeLimit(raw.limit),
  };
}

// 中文注释：薄适配器——把 work 的选项命名翻译成共享 runtime env 构建器入参，不复制实现。
export function buildWorkRuntimeEnv(options = {}, baseEnv = {}) {
  return buildDispatchRuntimeEnv({
    clientId: options.clientId,
    workers: options.concurrency,
    executionMode: options.executionMode,
  }, baseEnv);
}
