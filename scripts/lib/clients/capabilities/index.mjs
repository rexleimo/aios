import {
  CAPABILITY_CLIENT_ORDER,
  CLIENT_DEFINITIONS,
} from '../core/definitions.mjs';
import {
  assertKnownCapability,
  assertKnownClient,
  normalizeClientValue,
  resolveClientSelection,
} from '../core/selection.mjs';

// 纯函数：读取单个客户端定义，不触发任何文件系统或环境副作用。
function getClientDefinition(client) {
  const normalized = assertKnownClient(normalizeClientValue(client));
  return CLIENT_DEFINITIONS[normalized];
}

// 纯函数：回答“某客户端是否支持某能力”，不改变客户端选择顺序。
export function supportsClientCapability(client, capability) {
  const normalizedCapability = assertKnownCapability(capability);
  return getClientDefinition(client).capabilities.includes(normalizedCapability);
}

// 纯函数：为偏好“获取能力值”语义的调用方保留清晰别名。
export function getClientCapability(client, capability) {
  return supportsClientCapability(client, capability);
}

// 纯函数：先应用用户选择，再按能力自己的稳定顺序过滤客户端。
export function resolveClientsWithCapability(capability, client = 'all') {
  const normalizedCapability = assertKnownCapability(capability);
  const selected = new Set(resolveClientSelection(client));
  return CAPABILITY_CLIENT_ORDER[normalizedCapability].filter((clientId) => (
    selected.has(clientId) && supportsClientCapability(clientId, normalizedCapability)
  ));
}

// 纯函数：同时返回选中、支持、不支持三组，专门服务跳过提示和报告展示。
export function resolveClientCapabilitySelection(capability, client = 'all') {
  const selected = resolveClientSelection(client);
  const supported = resolveClientsWithCapability(capability, client);
  const supportedSet = new Set(supported);
  return {
    capability,
    selected,
    supported,
    unsupported: selected.filter((clientId) => !supportedSet.has(clientId)),
  };
}

// 纯函数：聚合 agents 能力的客户端目标，隐藏能力名常量。
export function resolveClientAgentTargets(client = 'all') {
  return resolveClientsWithCapability('agents', client);
}

// 纯函数：聚合 superpowers 能力的客户端目标，隐藏能力名常量。
export function resolveClientSuperpowersClients(client = 'all') {
  return resolveClientsWithCapability('superpowers', client);
}

// 纯函数：聚合 native 能力的客户端目标，隐藏能力名常量。
export function resolveClientNativeClients(client = 'all') {
  return resolveClientsWithCapability('native', client);
}
