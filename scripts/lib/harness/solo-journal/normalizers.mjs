/* 中文注释：solo journal 归一化函数保持纯函数，避免读写逻辑和 schema 清洗混在一起。 */
import path from 'node:path';

import { SOLO_STAGES } from './constants.mjs';

// 纯函数：统一文本修剪，并支持 fallback。
export { normalizeText } from '../../../../src/shared/normalize.mjs';

// 纯函数：数组字段去重、去空，保证写入 JSON 的结构稳定。
export function normalizeStringArray(value) {
  const raw = Array.isArray(value) ? value : [];
  return Array.from(new Set(raw.map((item) => String(item ?? '').trim()).filter(Boolean)));
}

// 纯函数：未知阶段降级到 development，避免状态文件写入非法枚举。
export function normalizeStage(value) {
  const normalized = normalizeText(value).toLowerCase();
  return SOLO_STAGES.has(normalized) ? normalized : 'development';
}

export function normalizeOptionalStage(value) {
  return normalizeText(value) ? normalizeStage(value) : '';
}

export function normalizeAbsolutePath(value) {
  const text = normalizeText(value);
  return text ? path.resolve(text) : '';
}

export function toPosixPath(filePath = '') {
  return String(filePath || '').replace(/\\/g, '/');
}

export function formatRelativePath(rootDir, absolutePath) {
  const root = path.resolve(rootDir || process.cwd());
  const absolute = path.resolve(absolutePath || '');
  if (absolute.startsWith(root)) {
    return toPosixPath(path.relative(root, absolute));
  }
  return toPosixPath(absolute);
}

export function defaultBackoff() {
  return {
    consecutiveInfraFailures: 0,
    nextDelayMs: 0,
    until: null,
  };
}

export function defaultWorktreeState(input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  return {
    enabled: source.enabled === true,
    baseRef: normalizeText(source.baseRef, 'HEAD'),
    path: normalizeText(source.path),
    workspacePath: normalizeText(source.workspacePath),
    initialHead: normalizeText(source.initialHead),
    preserved: source.preserved === true,
    cleanupReason: normalizeText(source.cleanupReason),
  };
}

export function defaultControl(sessionId, overrides = {}) {
  return {
    schemaVersion: 1,
    kind: 'solo-harness.control',
    sessionId: normalizeText(sessionId),
    stopRequested: overrides.stopRequested === true,
    reason: normalizeText(overrides.reason),
    requestedAt: overrides.stopRequested === true
      ? normalizeText(overrides.requestedAt, new Date().toISOString())
      : null,
    updatedAt: normalizeText(overrides.updatedAt, new Date().toISOString()),
  };
}

export function normalizeRunSummary(input = {}) {
  const sessionId = normalizeText(input.sessionId);
  if (!sessionId) {
    throw new Error('solo run summary requires sessionId');
  }

  return {
    schemaVersion: 1,
    kind: 'solo-harness.run-summary',
    sessionId,
    objective: normalizeText(input.objective),
    status: normalizeText(input.status, 'running'),
    provider: normalizeText(input.provider, 'codex'),
    clientId: normalizeText(input.clientId, 'codex-cli'),
    profile: normalizeText(input.profile, 'standard'),
    aiosRootDir: normalizeAbsolutePath(input.aiosRootDir),
    workspaceRoot: normalizeAbsolutePath(input.workspaceRoot),
    iterationCount: Number.isFinite(input.iterationCount) ? Math.max(0, Math.floor(input.iterationCount)) : 0,
    lastIteration: Number.isFinite(input.lastIteration) ? Math.max(0, Math.floor(input.lastIteration)) : 0,
    lastOutcome: normalizeText(input.lastOutcome),
    lastFailureClass: normalizeText(input.lastFailureClass, 'none'),
    lastStage: normalizeOptionalStage(input.lastStage),
    latestEvidence: normalizeStringArray(input.latestEvidence),
    stopRequested: input.stopRequested === true,
    backoff: {
      ...defaultBackoff(),
      ...(input.backoff && typeof input.backoff === 'object' ? input.backoff : {}),
    },
    worktree: defaultWorktreeState(input.worktree),
    continuity: {
      markdownPath: normalizeText(input.continuity?.markdownPath),
      jsonPath: normalizeText(input.continuity?.jsonPath),
    },
    createdAt: normalizeText(input.createdAt, new Date().toISOString()),
    updatedAt: normalizeText(input.updatedAt, new Date().toISOString()),
  };
}

export function normalizeIterationOutcome(input = {}) {
  const sessionId = normalizeText(input.sessionId);
  if (!sessionId) {
    throw new Error('solo iteration outcome requires sessionId');
  }

  const iteration = Number.isFinite(input.iteration) ? Math.max(1, Math.floor(input.iteration)) : 1;
  return {
    schemaVersion: 1,
    kind: 'solo-harness.iteration',
    sessionId,
    iteration,
    outcome: normalizeText(input.outcome, 'failed'),
    summary: normalizeText(input.summary, 'No summary recorded.'),
    stage: normalizeStage(input.stage),
    evidence: normalizeStringArray(input.evidence),
    keyChanges: normalizeStringArray(input.keyChanges),
    keyLearnings: normalizeStringArray(input.keyLearnings),
    nextAction: normalizeText(input.nextAction),
    shouldStop: input.shouldStop === true,
    failureClass: normalizeText(input.failureClass, 'none'),
    backoffAction: normalizeText(input.backoffAction, 'none'),
    checkpointStatus: normalizeText(input.checkpointStatus, 'running'),
    createdAt: normalizeText(input.createdAt, new Date().toISOString()),
  };
}
