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
