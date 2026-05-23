import { CLIENT_DEFINITIONS } from '../core/definitions.mjs';
import {
  assertKnownClient,
  normalizeClientValue,
  resolveClientSelection,
} from '../core/selection.mjs';

// 纯函数：读取单个客户端运行时定义，不依赖 PATH、环境变量或文件系统。
export function getClientRuntimeDefinition(client) {
  const normalized = assertKnownClient(normalizeClientValue(client));
  return CLIENT_DEFINITIONS[normalized];
}

// 纯函数：返回真实 CLI 命令名，例如 codex、claude、gemini、opencode。
export function getClientCommandName(client) {
  return getClientRuntimeDefinition(client).commandName;
}

// 纯函数：返回 AIOS 内部 runtime clientId，例如 codex-cli、claude-code。
export function getClientRuntimeId(client) {
  return getClientRuntimeDefinition(client).runtimeClientId;
}

// 纯函数：把 CLI 命令名反解为标准客户端名，让调用方不再写命令名映射表。
export function resolveClientFromCommandName(commandName = '') {
  const normalized = String(commandName || '').trim().toLowerCase();
  const entry = Object.entries(CLIENT_DEFINITIONS).find(([, definition]) => (
    definition.commandName === normalized
  ));
  return entry?.[0] || '';
}

// 纯函数：把 runtime clientId 反解为标准客户端名，让 handoff/HUD/subagent 共用同一套映射。
export function resolveClientFromRuntimeId(runtimeClientId = '') {
  const normalized = String(runtimeClientId || '').trim().toLowerCase();
  const entry = Object.entries(CLIENT_DEFINITIONS).find(([, definition]) => (
    definition.runtimeClientId === normalized
  ));
  return entry?.[0] || '';
}

// 纯函数：按用户选择返回命令名列表，供 PATH 检测和 Windows launcher 解析复用。
export function resolveClientCommandNames(client = 'all') {
  return resolveClientSelection(client).map((clientId) => getClientCommandName(clientId));
}

// 纯函数：按用户选择返回 runtime clientId 列表，供 subagent/handoff/HUD 复用。
export function resolveClientRuntimeIds(client = 'all') {
  return resolveClientSelection(client).map((clientId) => getClientRuntimeId(clientId));
}

// 纯函数：生成 runtime clientId 到 provider/client 的映射，避免各运行时重复维护。
export function buildRuntimeClientProviderMap(client = 'all') {
  return Object.fromEntries(resolveClientSelection(client).map((clientId) => [
    getClientRuntimeId(clientId),
    clientId,
  ]));
}
