import { resolveClientsWithCapability } from '../capabilities/index.mjs';
import { getClientRuntimeId } from '../runtime/identifiers.mjs';

// 纯函数：返回 team workflow 支持的 provider，opencode 等不支持者会被显式过滤。
export function resolveClientTeamProviders(client = 'all') {
  return resolveClientsWithCapability('team', client);
}

// 纯函数：返回 solo harness 支持的 provider，避免生命周期模块重复维护 provider 列表。
export function resolveClientHarnessProviders(client = 'all') {
  return resolveClientsWithCapability('harness', client);
}

// 纯函数：生成 team provider 到 runtime clientId 的映射，供 CLI 参数解析和 team ops 共用。
export function buildTeamProviderRuntimeClientMap(client = 'all') {
  return Object.fromEntries(resolveClientTeamProviders(client).map((clientId) => [
    clientId,
    getClientRuntimeId(clientId),
  ]));
}
