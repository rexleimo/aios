import { defaultModelRegistry } from './registry.mjs';
import { isDisabledEnvValue, normalizeId } from './shared.mjs';

export function isModelRouterEnabled(env = process.env) {
  if (env?.AIOS_MODEL_ROUTER === undefined && env?.AIOS_SUBAGENT_CLIENT && !env?.AIOS_MODEL_ROUTER_FORCE) return false;
  if (isDisabledEnvValue(env?.AIOS_MODEL_ROUTER)) return false;
  const disabled = String(env?.AIOS_DISABLE_MODEL_ROUTER ?? '').trim().toLowerCase();
  return !(disabled === '1' || disabled === 'true' || disabled === 'yes' || disabled === 'on');
}

// 纯函数：把 profile 参数、环境变量和 registry 默认值合并成合法 profile。
export function normalizeModelRouterProfile(profile, registry = defaultModelRegistry(), env = process.env) {
  const configured = registry?.routingProfiles && typeof registry.routingProfiles === 'object'
    ? Object.keys(registry.routingProfiles).map(normalizeId)
    : ['balanced', 'premium', 'budget'];
  const allowed = configured.length > 0 ? configured : ['balanced', 'premium', 'budget'];
  const requested = normalizeId(profile) || normalizeId(env?.AIOS_MODEL_ROUTER_PROFILE) || normalizeId(registry?.defaultProfile) || 'balanced';
  return allowed.includes(requested) ? requested : 'balanced';
}
