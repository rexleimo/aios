import {
  ALL_CLIENTS,
  CLIENT_CAPABILITIES,
} from './definitions.mjs';

// 纯函数：把外部传入的 client 参数标准化，避免调用方各自处理大小写和空白。
export function normalizeClientValue(client = 'all') {
  return String(client || 'all').trim().toLowerCase();
}

// 纯函数：把能力名标准化，后续能力判断不再各自处理大小写和空白。
export function normalizeCapabilityValue(capability = '') {
  return String(capability || '').trim().toLowerCase();
}

// 纯函数：只判断客户端是否已注册，用于报告和条件分支，不抛异常。
export function isKnownClient(client) {
  return ALL_CLIENTS.includes(normalizeClientValue(client));
}

// 纯函数：只判断能力是否已注册，用于报告和条件分支，不抛异常。
export function isKnownCapability(capability) {
  return CLIENT_CAPABILITIES.includes(normalizeCapabilityValue(capability));
}

// 纯函数：统一校验客户端名称，并返回标准化值供调用链继续复用。
export function assertKnownClient(client) {
  const normalized = normalizeClientValue(client);
  if (!ALL_CLIENTS.includes(normalized)) {
    throw new Error(`unsupported client: ${normalized}`);
  }
  return normalized;
}

// 纯函数：统一校验能力名称，并返回标准化值，让功能模块只关心业务分支。
export function assertKnownCapability(capability) {
  const normalized = normalizeCapabilityValue(capability);
  if (!CLIENT_CAPABILITIES.includes(normalized)) {
    throw new Error(`unsupported client capability: ${normalized}`);
  }
  return normalized;
}

// 纯函数：只负责把 all 展开为稳定顺序的客户端列表，供安装、doctor、同步流程复用。
export function resolveClientSelection(client = 'all') {
  const normalized = normalizeClientValue(client);
  if (normalized === 'all') {
    return [...ALL_CLIENTS];
  }
  return [assertKnownClient(normalized)];
}
