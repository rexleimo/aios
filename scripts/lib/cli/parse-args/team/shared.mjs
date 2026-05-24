/* 中文注释：team 子命令共用归一化逻辑，避免每个解析器重复维护 provider/session 规则。 */
import { TEAM_PROVIDER_CLIENT_MAP, normalizeTeamProvider } from '../shared.mjs';

export function finalizeTeamProvider(options) {
  options.provider = normalizeTeamProvider(options.provider);
  options.clientId = TEAM_PROVIDER_CLIENT_MAP[options.provider];
  return options;
}

export function hydrateSessionFromResume(options) {
  if (!options.sessionId && options.resumeSessionId) {
    options.sessionId = options.resumeSessionId;
  }
  return options;
}

export function normalizeQualityCategoryPrefixMode(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'any' || normalized === 'all') return normalized;
  throw new Error('--quality-category-prefix-mode must be one of: any, all');
}

export function normalizeSinceIso(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed)) {
    throw new Error('--since must be an ISO timestamp (e.g., 2026-04-06T00:00:00.000Z)');
  }
  return new Date(parsed).toISOString();
}
