/* 中文注释：集中导出拦截运行时公开能力，避免 CLI 和 Skill 层直接依赖内部目录。 */
export { createInterceptionEngine } from './core/engine.mjs';
export { readRawRef, writeRawRef, rawRefsSessionRoot } from './refs/raw-ref-store.mjs';
export { buildCompactPacket } from './packets/compact-packet.mjs';
export { shrinkToolOutput } from './shell/output-shrinker.mjs';
export { buildAiosMcpProxyServer, buildCapabilityMatrix, isAiosMcpProxyEntry, loadHostCapabilities, unwrapAiosMcpProxyEntry } from './clients/capabilities.mjs';
export { collectInterceptionMcpTargets, inspectMcpProxyTarget, inspectMcpProxyTargets } from './clients/capabilities.mjs';
