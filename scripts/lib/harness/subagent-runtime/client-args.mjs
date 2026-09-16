import {
  applyClientContract,
  buildClientModelArgs,
  defaultModelRegistry,
  isModelRouterEnabled,
  loadModelAvailability,
  normalizeModelRouting,
  recordModelDispatch,
} from '../../model-router.mjs';

import {
  clientSupportsModelProtocol,
  getClientModelRouting,
} from '../../clients/registry.mjs';
import { classifyChannelEvidence, recordModelAvailability } from '../../model-router/availability.mjs';

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

// 纯函数：把路由结论按 worker 自身客户端收敛（协议/通道/own-default），再产出启动参数。
function contractRoute(clientId = '', modelRouting = null, env = process.env, context = {}) {
  const route = normalizeModelRouting(modelRouting);
  if (!isModelRouterEnabled(env) || !route) return route;
  // 中文注释：可用性证据默认不读盘，保持离线确定性；显式注入或 AIOS_MODEL_AVAILABILITY=1 才启用。
  let availability = context.availability;
  if (availability === undefined && parseBooleanEnv(env?.AIOS_MODEL_AVAILABILITY, false)) {
    availability = loadModelAvailability({ cwd: context.rootDir, env }).cache;
  }
  return applyClientContract(route, defaultModelRegistry(), { clientId, availability, now: context.now });
}

export function buildRoutedExtraArgs(clientId = '', modelRouting = null, env = process.env, context = {}) {
  if (!isModelRouterEnabled(env)) return [];
  return buildClientModelArgs(clientId, contractRoute(clientId, modelRouting, env, context));
}

export function resolveExecutionClientId(defaultClientId = '', modelRouting = null, env = process.env) {
  const route = normalizeModelRouting(modelRouting);
  const own = getClientModelRouting(defaultClientId) !== 'relay';
  const protocols = Array.isArray(route?.modelProtocols) ? route.modelProtocols.filter(Boolean) : [];
  const mismatch = protocols.length > 0 && !protocols.some((protocol) => clientSupportsModelProtocol(defaultClientId, protocol));
  // 中文注释：route.clientId 只是“这个模型通常由哪个客户端启动”的提示，
  // 自动路由时不能覆盖 worker 自己的客户端——否则 pi worker 会被换成 claude 去跑。
  // 例外：显式声明的模型是用户指令，客户端要跟着模型走（AIOS_MODEL_PLANNER=gemini-3-pro
  // 就必须真的用 gemini 跑，而不是把模型换成 codex 能用的）。
  const explicit = route?.explicit === true;
  if (isModelRouterEnabled(env) && route?.clientId && (explicit || (!own && !mismatch))) return route.clientId;
  return normalizeText(defaultClientId);
}

// 副作用函数：把一次派发的成败回流给可用性状态机（memory/specs/model-availability.json）。
// 关闭方式：AIOS_MODEL_AVAILABILITY_FEEDBACK=0。只写本地文件，不联网。
function feedAvailabilityFromDispatch({ rootDir, modelRouting, success, elapsedMs, failureDetail }) {
  const route = normalizeModelRouting(modelRouting);
  const modelId = normalizeText(route?.modelId);
  if (!rootDir || !modelId) return null;
  if (parseBooleanEnv(process.env?.AIOS_MODEL_AVAILABILITY_FEEDBACK, true) === false) return null;
  const protocols = Array.isArray(route?.modelProtocols) ? route.modelProtocols.filter(Boolean) : [];
  const detail = String(failureDetail || '');
  const errorClass = success ? '' : (classifyChannelEvidence(detail) || 'dispatch-failed');
  // 只有通道级/网络级证据才写状态；agent 自己的失败不算模型通道坏了。
  if (!success && errorClass !== 'channel-unavailable' && errorClass !== 'network') return null;
  return recordModelAvailability({
    modelId,
    protocol: protocols[0] || '',
    ok: success === true,
    latencyMs: Number.isFinite(Number(elapsedMs)) ? Number(elapsedMs) : 0,
    errorClass,
    evidence: clipEvidence(detail),
  }, { cwd: rootDir });
}

function clipEvidence(text) {
  const value = String(text || '').replace(/\s+/gu, ' ').trim();
  return value.length > 240 ? `${value.slice(0, 240)}...` : value;
}

export function recordPhaseModelDispatch({ rootDir, job, modelRouting, success, elapsedMs, description, failureDetail = '' }) {
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
  feedAvailabilityFromDispatch({ rootDir, modelRouting: route, success, elapsedMs, failureDetail });
}
