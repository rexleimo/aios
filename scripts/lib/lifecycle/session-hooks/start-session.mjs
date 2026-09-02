/* 中文注释：会话启动时把当前会话注册进 ContextDB（session:new + registry index）。
 * 这是"记忆系统随工作流入口启用"的确定性数据面（方案 A）：工作流入口显式调用，
 * 不做语义判断；幂等可重入——同 session id 重复调用只刷新 index，不重复建会话。
 * 兼容说明：sessionId 生成规则与 lifecycle/harness/session.mjs 的 clientId-stamp 风格一致。
 */
import { existsSync } from 'node:fs';
import path from 'node:path';

import { resolveContextDbRoot } from '../../aios/state-root.mjs';
import { runContextDbCli } from '../../contextdb-cli.mjs';
import { writeIndex } from '../../contextdb/context-registry.mjs';

export function buildSessionId({ agent = 'agent', now = new Date() } = {}) {
  const clientId = String(agent || 'agent').trim().toLowerCase().replace(/[^a-z0-9-]+/gu, '-') || 'agent';
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  return `${clientId}-${stamp}`;
}

export function sessionMetaPath(rootDir, sessionId) {
  return path.join(
    resolveContextDbRoot(rootDir, { preferLegacyExisting: true }),
    'sessions',
    String(sessionId || ''),
    'meta.json',
  );
}

/**
 * Ensure a ContextDB session exists for the current workflow entry.
 * Idempotent: if sessions/<id>/meta.json already exists, only refresh the
 * registry index. runContextDbCliImpl is injectable for tests.
 */
export async function ensureContextDbSession({
  rootDir,
  sessionId = '',
  agent = 'agent',
  client = '',
  goal = '',
  runContextDbCliImpl = runContextDbCli,
} = {}) {
  const root = path.resolve(rootDir || process.cwd());
  const resolvedAgent = String(agent || 'agent').trim() || 'agent';
  const resolvedSessionId = String(sessionId || '').trim() || buildSessionId({ agent: resolvedAgent });
  const errors = [];
  const created = !existsSync(sessionMetaPath(root, resolvedSessionId));

  if (created) {
    try {
      runContextDbCliImpl(['init', '--workspace', root]);
      runContextDbCliImpl([
        'session:new',
        '--workspace', root,
        '--agent', resolvedAgent,
        '--project', path.basename(root),
        '--goal', String(goal || `AIOS session start (${client || resolvedAgent})`),
        '--session-id', resolvedSessionId,
        '--tags', `client:${client || resolvedAgent}`,
      ]);
    } catch (error) {
      errors.push(`contextdb session:new failed: ${error.message}`);
    }
  }

  try {
    await writeIndex({
      sessionId: resolvedSessionId,
      status: 'running',
      space: 'default',
      agent: resolvedAgent,
      workspaceRoot: root,
    });
  } catch (error) {
    errors.push(`registry index write failed: ${error.message}`);
  }

  return { sessionId: resolvedSessionId, created, errors };
}
