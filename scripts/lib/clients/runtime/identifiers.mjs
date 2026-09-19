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

// 纯函数：返回同一个客户端的全部可执行名候选（主名在前，发行版别名在后）。
// 一个产品可能有多个发行版命令名（如 Qoder 的 qoder / qoderclicn），检测必须全试，
// 而不是把"我们登记的那个名字"当成事实。
export function getClientCommandNames(client) {
  const definition = getClientRuntimeDefinition(client);
  const aliases = Array.isArray(definition.commandAliases) ? definition.commandAliases : [];
  return Object.freeze([definition.commandName, ...aliases.filter(Boolean)]);
}

// 纯函数：返回 AIOS 内部 runtime clientId，例如 codex-cli、claude-code。
export function getClientRuntimeId(client) {
  return getClientRuntimeDefinition(client).runtimeClientId;
}

// 纯函数：把 CLI 命令名反解为标准客户端名，让调用方不再写命令名映射表。
// 发行版别名也必须反解到同一个客户端，否则从进程名识别客户端时 CN 版会被认成未知客户端；
// 主名永远先判，所以别名不可能抢走另一个客户端家族的解析。
export function resolveClientFromCommandName(commandName = '') {
  const normalized = String(commandName || '').trim().toLowerCase();
  if (!normalized) {
    return '';
  }
  const entries = Object.entries(CLIENT_DEFINITIONS);
  const byPrimary = entries.find(([, definition]) => definition.commandName === normalized);
  if (byPrimary) {
    return byPrimary[0];
  }
  const byAlias = entries.find(([, definition]) => (
    (definition.commandAliases || []).some((alias) => String(alias).toLowerCase() === normalized)
  ));
  return byAlias?.[0] || '';
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
