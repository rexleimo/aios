import {
  isKnownClient,
  normalizeClientValue,
} from '../core/selection.mjs';
import {
  getClientRuntimeDefinition,
  resolveClientFromCommandName,
  resolveClientFromRuntimeId,
} from './identifiers.mjs';

// 纯函数：把客户端名、命令名或 runtime clientId 统一反解为标准客户端名。
function resolveRuntimeLikeClient(value = '') {
  const normalized = normalizeClientValue(value);
  return resolveClientFromRuntimeId(normalized)
    || resolveClientFromCommandName(normalized)
    || (isKnownClient(normalized) ? normalized : '');
}

// 纯函数：读取模型参数标记，例如 codex/gemini 使用 -m，claude 使用 --model。
export function getClientModelArgFlag(clientOrRuntime = '') {
  const client = resolveRuntimeLikeClient(clientOrRuntime);
  return client ? String(getClientRuntimeDefinition(client).modelArgFlag || '') : '';
}

// 纯函数：按 runtime clientId 构造模型参数，未知或暂不支持模型参数的客户端返回空数组。
export function buildRuntimeClientModelArgs(runtimeClientId = '', modelValue = '') {
  const flag = getClientModelArgFlag(runtimeClientId);
  const normalizedModel = String(modelValue || '').trim();
  return flag && normalizedModel ? [flag, normalizedModel] : [];
}


// 纯函数：读取客户端的模型路由模式：'relay'（可注入端点并按协议派模型）或 'own'（不派模型，用自身配置）。
// 未声明时保守回落 'own'，避免给没有端点证据的客户端派它 speak 不了的模型。
export function getClientModelRouting(clientOrRuntime = '') {
  const client = resolveRuntimeLikeClient(clientOrRuntime);
  if (!client) return 'own';
  const mode = String(getClientRuntimeDefinition(client).modelRouting || 'own');
  return mode === 'relay' ? 'relay' : 'own';
}

// 纯函数：客户端能 speak 的模型协议集合（relay 客户端才有；own 恒为空）。
export function getClientModelProtocols(clientOrRuntime = '') {
  const client = resolveRuntimeLikeClient(clientOrRuntime);
  if (!client || getClientModelRouting(client) !== 'relay') return [];
  return [...(getClientRuntimeDefinition(client).modelProtocols || [])];
}

// 纯函数：判断某客户端是否可以承载给定协议的模型；协议为空视为不限制（历史条目缺 protocol）。
export function clientSupportsModelProtocol(clientOrRuntime = '', protocol = '') {
  if (getClientModelRouting(clientOrRuntime) !== 'relay') return false;
  const wanted = String(protocol || '').trim().toLowerCase();
  if (!wanted) return true;
  return getClientModelProtocols(clientOrRuntime).includes(wanted);
}

// 纯函数：返回无人值守/跳过权限提示参数，调用方只负责注入位置。
export function getClientUnattendedArgs(clientOrCommand = '') {
  const client = resolveRuntimeLikeClient(clientOrCommand);
  return client ? [...(getClientRuntimeDefinition(client).unattendedArgs || [])] : [];
}

// 纯函数：返回需要插入权限参数的子命令锚点；没有特殊锚点时返回空字符串。
export function getClientUnattendedInsertAfterToken(clientOrCommand = '') {
  const client = resolveRuntimeLikeClient(clientOrCommand);
  return client ? String(getClientRuntimeDefinition(client).unattendedInsertAfterToken || '') : '';
}
