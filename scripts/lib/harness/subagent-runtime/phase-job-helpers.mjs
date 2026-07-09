import path from 'node:path';
import { buildClientStructuredOutputOptions } from '../subagent-clients/structured-output.mjs';
import { CODEX_OUTPUT_SCHEMA_REL, AGENT_ID_ENV } from './constants.mjs';
import { resolveRepoRoot } from './paths.mjs';
import { normalizeText, safeFileSlug } from './text.mjs';

export function resolveAgentForJob(job, spec) {
  const agentId = normalizeText(job?.launchSpec?.agentRefId);
  if (!agentId) return null;
  return spec.agents[agentId] || null;
}

/* 中文注释：把当前 job 的 agent id 注入子进程环境变量，让 memo CLI 默认使用该 agent 命名空间。显式 --agent 仍然优先生效。 */
export function injectAgentIdEnv(env, agentId) {
  const normalized = normalizeText(agentId);
  if (!normalized) return env;
  if (env && typeof env === 'object' && env[AGENT_ID_ENV] === normalized) return env;
  return { ...(env || {}), [AGENT_ID_ENV]: normalized };
}

export function normalizeResultAttempts(result, fallback = 0) {
  if (!Number.isFinite(result?.attempts)) return fallback;
  return Math.max(1, Math.floor(result.attempts));
}

export function buildStructuredOutput({ clientId, structuredOutputTempDir, rootDir, job }) {
  if (!structuredOutputTempDir || !rootDir) return null;
  return buildClientStructuredOutputOptions({
    clientId,
    tempDir: structuredOutputTempDir,
    schemaPath: path.join(resolveRepoRoot(), CODEX_OUTPUT_SCHEMA_REL),
    lastMessagePath: path.join(structuredOutputTempDir, `${safeFileSlug(job?.jobId)}.json`),
  });
}
