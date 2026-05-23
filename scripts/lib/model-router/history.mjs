import { runContextDbCli } from '../contextdb-cli.mjs';
import {
  ensureWorkspaceMemorySession,
  normalizeWorkspaceMemorySpace,
} from '../memo/workspace-memory.mjs';

import { normalizeId } from './shared.mjs';

function dispatchOutcomeSessionId(workspaceRoot, space = 'default') {
  const ws = normalizeWorkspaceMemorySpace(space);
  const { sessionId } = ensureWorkspaceMemorySession(workspaceRoot, ws);
  return sessionId;
}

export function recordModelDispatch({
  workspaceRoot,
  modelId,
  taskType,
  role,
  success,
  latencyMs,
  costEstimate,
  description,
} = {}) {
  try {
    const sessionId = dispatchOutcomeSessionId(workspaceRoot);
    const turnId = `model-dispatch:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const payload = JSON.stringify({
      kind: 'model.dispatch',
      schemaVersion: 1,
      modelId: normalizeId(modelId),
      taskType: normalizeId(taskType),
      role: normalizeId(role),
      success: success === true,
      latencyMs: Number.isFinite(latencyMs) ? latencyMs : 0,
      costEstimate: normalizeId(costEstimate) || 'unknown',
      description: String(description || '').slice(0, 200),
      timestamp: new Date().toISOString(),
    });

    const text = `[model-dispatch] model=${modelId} task=${taskType} role=${role} success=${success} latency=${latencyMs}ms cost=${costEstimate}`;
    const refs = ['model-dispatch', modelId, taskType, role].filter(Boolean);

    const args = [
      'event:add',
      '--workspace', workspaceRoot,
      '--session', sessionId,
      '--role', 'user',
      '--kind', 'model.dispatch',
      '--text', payload,
      '--turn-id', turnId,
      '--turn-type', 'side',
      '--environment', 'model-router',
      '--hindsight-status', 'evaluated',
      '--outcome', success ? 'success' : 'failure',
    ];
    if (refs.length > 0) {
      args.push('--refs', refs.join(','));
    }

    runContextDbCli(args);

    try {
      runContextDbCli(['index:sync', '--workspace', workspaceRoot]);
    } catch {
      // 尽力同步索引；主记录已写入时不要因为索引失败影响调度结果。
    }

    return { ok: true, sessionId, text };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function loadModelDispatchHistory({ workspaceRoot, limit = 50 } = {}) {
  try {
    const sessionId = dispatchOutcomeSessionId(workspaceRoot);
    const result = runContextDbCli([
      'search',
      '--workspace', workspaceRoot,
      '--session', sessionId,
      '--kinds', 'model.dispatch',
      '--query', 'model-dispatch',
      '--limit', String(limit),
    ]);
    const rows = Array.isArray(result?.results) ? result.results : [];
    return rows
      .map((row) => {
        try { return JSON.parse(row.text); } catch { return null; }
      })
      .filter((row) => row && row.kind === 'model.dispatch');
  } catch {
    return [];
  }
}
