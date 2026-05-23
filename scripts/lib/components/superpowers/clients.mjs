import { resolveClientCapabilitySelection } from '../../clients/registry.mjs';

// 纯函数：把用户选择收敛为支持 superpowers 的客户端集合，避免 Codex/Claude 分支散落。
export function resolveSuperpowersClients(client = 'all') {
  const selection = resolveClientCapabilitySelection('superpowers', client);
  return {
    ...selection,
    hasCodex: selection.supported.includes('codex'),
    hasClaude: selection.supported.includes('claude'),
  };
}
