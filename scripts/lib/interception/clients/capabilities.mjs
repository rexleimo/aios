/* 中文注释：客户端能力矩阵只声明真实可达的拦截层级，避免对不同宿主过度承诺。 */
import fs from 'node:fs';
import path from 'node:path';

export {
  buildAiosMcpProxyServer,
  isAiosMcpProxyEntry,
  unwrapAiosMcpProxyEntry,
} from '../mcp/proxy-config.mjs';
export {
  collectInterceptionMcpTargets,
  inspectMcpProxyTarget,
  inspectMcpProxyTargets,
} from '../mcp/proxy-inspector.mjs';

export const INTERCEPTION_LEVELS = Object.freeze(['L0', 'L1', 'L2', 'L3']);
export const CLIENT_ORDER = Object.freeze(['aios-harness', 'codex', 'claude', 'gemini', 'opencode', 'cursor', 'generic-mcp']);

/* 中文注释：能力矩阵是跨客户端承诺的事实源，避免文档、Skill 和代码各说各话。 */
export function resolveInterceptionConfigPath(rootDir) {
  return path.join(rootDir, 'config', 'host-capabilities.json');
}

/* 中文注释：schemaVersion 校验让未来扩展矩阵时显式升级，而不是静默读错字段。 */
export function loadHostCapabilities(rootDir) {
  const filePath = resolveInterceptionConfigPath(rootDir);
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/u, ''));
  if (!parsed || typeof parsed !== 'object' || parsed.schemaVersion !== 1) {
    throw new Error(`invalid host capabilities config: ${filePath}`);
  }
  return parsed;
}

/* 中文注释：未知客户端降级到 L0；宁可保守，也不能冒充宿主支持未验证 hook。 */
export function getClientCapability(capabilities, client) {
  const entry = capabilities?.clients?.[client];
  if (!entry) {
    return {
      client,
      targetLevel: 'L0',
      effectiveLevel: 'L0',
      capabilities: [],
      limits: [`Unknown client: ${client}`],
    };
  }

  /* 中文注释：这里只记录已验证能力，不记录愿望清单；产品口径也必须从这里取。 */
  return {
    client,
    targetLevel: entry.targetLevel || 'L0',
    effectiveLevel: entry.targetLevel || 'L0',
    capabilities: Array.isArray(entry.capabilities) ? [...entry.capabilities] : [],
    limits: Array.isArray(entry.limits) ? [...entry.limits] : [],
  };
}

/* 中文注释：输出顺序固定，便于 proof/doctor 快照对比，也方便人读跨客户端差异。 */
export function buildCapabilityMatrix(rootDir, { clients = CLIENT_ORDER } = {}) {
  const capabilities = loadHostCapabilities(rootDir);
  return clients.map((client) => getClientCapability(capabilities, client));
}
