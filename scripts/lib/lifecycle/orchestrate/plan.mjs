import {
  normalizeOrchestratorBlueprint,
  normalizeOrchestratorFormat,
} from '../../harness/orchestrator.mjs';
import { normalizePositiveInteger } from './shared.mjs';
import {
  normalizeOrchestrateDispatchMode,
  normalizeOrchestrateExecutionMode,
  normalizeOrchestratePreflightMode,
} from '../options.mjs';

// 纯函数：统一解析 orchestrate 命令选项，避免 CLI 预览和实际执行各自维护默认值。
export function normalizeOrchestrateOptions(rawOptions = {}) {
  const blueprintRaw = String(rawOptions.blueprint || '').trim();
  const taskTitleRaw = String(rawOptions.taskTitle || '').trim();
  const planPath = String(rawOptions.planPath || '').trim();
  const contextTaskId = String(rawOptions.contextTaskId || '').trim();
  const contextBudgetUnits = normalizePositiveInteger(rawOptions.contextBudgetUnits, 12_000);
  const resumeSessionIdRaw = String(rawOptions.resumeSessionId || '').trim();
  let sessionId = String(rawOptions.sessionId || '').trim();
  if (!sessionId && resumeSessionIdRaw) {
    sessionId = resumeSessionIdRaw;
  }
  const resumeSessionId = resumeSessionIdRaw || sessionId;
  const retryBlocked = rawOptions.retryBlocked === true;
  const force = rawOptions.force === true;
  const recommendationId = String(rawOptions.recommendationId || '').trim();
  const dispatchModeRaw = String(rawOptions.dispatchMode ?? '').trim();
  const executionModeRaw = String(rawOptions.executionMode ?? '').trim();
  const preflightModeRaw = String(rawOptions.preflightMode ?? '').trim();
  const phaseExecutor = String(rawOptions.phaseExecutor || '').trim();
  const dispatchModeProvided = dispatchModeRaw.length > 0;
  const executionModeProvided = executionModeRaw.length > 0;
  const preflightModeProvided = preflightModeRaw.length > 0;

  let dispatchMode = dispatchModeProvided ? normalizeOrchestrateDispatchMode(dispatchModeRaw) : 'none';
  let executionMode = executionModeProvided ? normalizeOrchestrateExecutionMode(executionModeRaw) : 'none';
  let preflightMode = preflightModeProvided ? normalizeOrchestratePreflightMode(preflightModeRaw) : 'none';

  // 默认走本地 dry-run，确保不指定调度参数时也能产生零成本 DAG 与证据。
  if (!dispatchModeProvided && !executionModeProvided) {
    dispatchMode = 'local';
    executionMode = 'dry-run';
  }

  // 只指定执行模式时补齐 local dispatch，避免 CLI 入口和运行入口产生不同解释。
  if (!dispatchModeProvided && executionModeProvided && executionMode !== 'none') {
    dispatchMode = 'local';
  }

  // 选择 local dispatch 但未指定执行模式时，默认 dry-run，避免误触 live。
  if (dispatchMode === 'local' && !executionModeProvided) {
    executionMode = 'dry-run';
  }

  if (recommendationId && !sessionId) {
    throw new Error('--recommendation requires --session');
  }
  if (executionMode !== 'none' && dispatchMode !== 'local') {
    throw new Error('--execute requires --dispatch local');
  }
  if (preflightMode !== 'none' && !sessionId) {
    throw new Error('--preflight requires --session');
  }
  if (retryBlocked && !resumeSessionId) {
    throw new Error('--retry-blocked requires --resume <session-id> or --session <session-id>');
  }

  return {
    blueprint: blueprintRaw ? normalizeOrchestratorBlueprint(blueprintRaw) : 'feature',
    blueprintExplicit: blueprintRaw.length > 0,
    taskTitle: taskTitleRaw || 'Untitled task',
    taskTitleExplicit: taskTitleRaw.length > 0,
    contextSummary: String(rawOptions.contextSummary || '').trim(),
    planPath,
    contextTaskId,
    contextBudgetUnits,
    sessionId,
    resumeSessionId,
    retryBlocked,
    force,
    limit: normalizePositiveInteger(rawOptions.limit, 10),
    recommendationId,
    dispatchMode,
    executionMode,
    preflightMode,
    phaseExecutor,
    format: normalizeOrchestratorFormat(rawOptions.format ?? 'text'),
  };
}

// 纯函数：把已归一化选项重新渲染成可复制命令，作为 dry-run/guard 提示的统一来源。
export function planOrchestrate(rawOptions = {}) {
  const options = normalizeOrchestrateOptions(rawOptions);
  const args = ['orchestrate'];

  if (!options.sessionId || options.blueprintExplicit) {
    args.push(options.blueprint);
  }
  if (!options.sessionId || options.taskTitleExplicit) {
    args.push('--task', JSON.stringify(options.taskTitle));
  }
  if (options.contextSummary) {
    args.push('--context', JSON.stringify(options.contextSummary));
  }
  if (options.planPath) {
    args.push('--plan', options.planPath);
  }
  if (options.contextTaskId) {
    args.push('--context-task', options.contextTaskId);
  }
  if (options.contextBudgetUnits !== 12_000) {
    args.push('--context-budget', String(options.contextBudgetUnits));
  }
  if (options.sessionId) {
    args.push('--session', options.sessionId);
    if (options.limit !== 10) {
      args.push('--limit', String(options.limit));
    }
  }
  if (options.resumeSessionId && options.resumeSessionId !== options.sessionId) {
    args.push('--resume', options.resumeSessionId);
  }
  if (options.recommendationId) {
    args.push('--recommendation', options.recommendationId);
  }
  if (options.retryBlocked) {
    args.push('--retry-blocked');
  }
  if (options.force) {
    args.push('--force');
  }
  if (options.dispatchMode !== 'none') {
    args.push('--dispatch', options.dispatchMode);
  }
  if (options.executionMode !== 'none') {
    args.push('--execute', options.executionMode);
  }
  if (options.preflightMode !== 'none') {
    args.push('--preflight', options.preflightMode);
  }
  if (options.format !== 'text') {
    args.push('--format', options.format);
  }
  return {
    command: 'orchestrate',
    options,
    preview: `node scripts/aios.mjs ${args.join(' ')}`,
  };
}
