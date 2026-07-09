import {
  buildClientModelArgs,
  isModelRouterEnabled,
  normalizeModelRouting,
  recordModelDispatch,
} from '../../model-router.mjs';

import {
  SUBAGENT_CLAUDE_UNATTENDED_ENV,
  SUBAGENT_CODEX_DISABLE_MCP_ENV,
  SUBAGENT_CODEX_UNATTENDED_ENV,
  SUBAGENT_GEMINI_UNATTENDED_ENV,
  SUBAGENT_GROK_UNATTENDED_ENV,
} from './constants.mjs';
import { normalizeText, parseBooleanEnv } from './text.mjs';

export function buildCodexConfigArgs(env = process.env) {
  const disableMcpStartup = parseBooleanEnv(env?.[SUBAGENT_CODEX_DISABLE_MCP_ENV], true);
  if (!disableMcpStartup) {
    return [];
  }
  return ['-c', 'mcp_servers={}', '-c', 'features.rmcp_client=false'];
}

export function buildCodexUnattendedArgs(env = process.env) {
  const enabled = parseBooleanEnv(env?.[SUBAGENT_CODEX_UNATTENDED_ENV], true);
  if (!enabled) {
    return [];
  }
  return ['--dangerously-bypass-approvals-and-sandbox'];
}

export function buildClaudeUnattendedArgs(env = process.env) {
  const enabled = parseBooleanEnv(env?.[SUBAGENT_CLAUDE_UNATTENDED_ENV], true);
  if (!enabled) {
    return [];
  }
  return ['--dangerously-skip-permissions'];
}

export function buildGeminiUnattendedArgs(env = process.env) {
  const enabled = parseBooleanEnv(env?.[SUBAGENT_GEMINI_UNATTENDED_ENV], true);
  if (!enabled) {
    return [];
  }
  return ['--yolo'];
}

export function buildGrokUnattendedArgs(env = process.env) {
  const enabled = parseBooleanEnv(env?.[SUBAGENT_GROK_UNATTENDED_ENV], true);
  if (!enabled) {
    return [];
  }
  return ['--always-approve'];
}

export function buildRoutedExtraArgs(clientId = '', modelRouting = null, env = process.env) {
  if (!isModelRouterEnabled(env)) return [];
  return buildClientModelArgs(clientId, modelRouting);
}

export function resolveExecutionClientId(defaultClientId = '', modelRouting = null, env = process.env) {
  const route = normalizeModelRouting(modelRouting);
  if (isModelRouterEnabled(env) && route?.clientId) return route.clientId;
  return normalizeText(defaultClientId);
}

export function recordPhaseModelDispatch({ rootDir, job, modelRouting, success, elapsedMs, description }) {
  const route = normalizeModelRouting(modelRouting);
  if (!route?.modelId || !rootDir) return;
  recordModelDispatch({
    workspaceRoot: rootDir,
    modelId: route.modelId,
    taskType: route.taskType,
    role: route.role || job?.role,
    success,
    latencyMs: elapsedMs,
    costEstimate: route.cost,
    description,
  });
}
