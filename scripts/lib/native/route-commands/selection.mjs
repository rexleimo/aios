import { getClientHomes } from '../../platform/paths.mjs';
import { resolveClientSelection } from '../../clients/registry.mjs';

import { CLIENT_LAYOUTS } from './constants.mjs';

// 纯函数：校验并展开 route command 的客户端选择。
export function normalizeClientSelection(client = 'all') {
  try {
    return resolveClientSelection(client).filter((clientId) => CLIENT_LAYOUTS[clientId]);
  } catch {
    const normalized = String(client || 'all').trim().toLowerCase();
    throw new Error(`unsupported route command client: ${normalized}`);
  }
}

// 纯函数：合并环境推导的 home 与测试/调用侧传入的覆盖值。
export function resolveHomeMap(homeMap = {}, env = process.env) {
  return { ...getClientHomes(env), ...homeMap };
}
