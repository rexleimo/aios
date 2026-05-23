import {
  ALL_CLIENTS,
  getClientRuntimeId,
  resolveClientTeamProviders,
} from '../../clients/registry.mjs';
import { normalizeText } from './shared.mjs';

export const HUD_PROVIDER_AGENT_MAP = Object.freeze(Object.fromEntries(
  ALL_CLIENTS.map((client) => [client, getClientRuntimeId(client)])
));

export const AGENT_PROVIDER_MAP = Object.freeze(
  Object.fromEntries(Object.entries(HUD_PROVIDER_AGENT_MAP).map(([provider, agent]) => [agent, provider]))
);

export const HUD_PROVIDER_NAMES = new Set(ALL_CLIENTS);
export const TEAM_PROVIDER_NAMES = new Set(resolveClientTeamProviders('all'));

// 纯函数：校验 HUD provider，避免状态读取和命令建议层各自维护 provider 分支。
export function normalizeProvider(raw = '') {
  const value = normalizeText(raw).toLowerCase();
  if (!value) return '';
  if (HUD_PROVIDER_NAMES.has(value)) return value;
  return '';
}

// 纯函数：从 ContextDB agent 名反查客户端 provider，兼容 codex/claude/gemini/opencode。
export function inferProviderFromAgent(agent = '') {
  return AGENT_PROVIDER_MAP[normalizeText(agent)] || '';
}
