import path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

import { clamp, normalizeMode } from './shared.mjs';

// 纯函数：生成新的默认状态，避免多个调用方各自拼装 counters 结构。
export function createDefaultState(config) {
  return {
    schema_version: 1,
    updated_at: null,
    effective_mode: config.mode,
    effective_rollout_rate: config.rollout_rate,
    counters: {
      total: 0,
      policy_applied: 0,
      baseline_routed: 0,
      policy_fallback: 0,
      policy_success: 0,
      policy_failure: 0,
      consecutive_policy_failures: 0,
      consecutive_policy_success: 0,
      downgrades: 0,
      promotions: 0,
    },
    recent: [],
    last_downgrade_reason: null,
    last_promotion_reason: null,
  };
}

export function normalizeState(raw, config) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw
    : createDefaultState(config);
  const counters = source.counters && typeof source.counters === 'object' && !Array.isArray(source.counters)
    ? source.counters
    : {};
  const recent = Array.isArray(source.recent)
    ? source.recent
      .map((entry) => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
        return {
          timestamp: typeof entry.timestamp === 'string' ? entry.timestamp : new Date().toISOString(),
          policy_applied: entry.policy_applied === true,
          policy_requested: entry.policy_requested === true,
          policy_fallback: entry.policy_fallback === true,
          success: entry.success === true,
          failed: entry.failed === true,
        };
      })
      .filter(Boolean)
      .slice(-config.eval_window_size)
    : [];

  return {
    schema_version: 1,
    updated_at: typeof source.updated_at === 'string' ? source.updated_at : null,
    effective_mode: normalizeMode(source.effective_mode || config.mode),
    effective_rollout_rate: clamp(source.effective_rollout_rate ?? config.rollout_rate, 0, 1),
    counters: {
      total: Number(counters.total || 0),
      policy_applied: Number(counters.policy_applied || 0),
      baseline_routed: Number(counters.baseline_routed || 0),
      policy_fallback: Number(counters.policy_fallback || 0),
      policy_success: Number(counters.policy_success || 0),
      policy_failure: Number(counters.policy_failure || 0),
      consecutive_policy_failures: Number(counters.consecutive_policy_failures || 0),
      consecutive_policy_success: Number(counters.consecutive_policy_success || 0),
      downgrades: Number(counters.downgrades || 0),
      promotions: Number(counters.promotions || 0),
    },
    recent,
    last_downgrade_reason: typeof source.last_downgrade_reason === 'string'
      ? source.last_downgrade_reason
      : null,
    last_promotion_reason: typeof source.last_promotion_reason === 'string'
      ? source.last_promotion_reason
      : null,
  };
}

async function readJsonObject(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch {
    return null;
  }
}

export async function loadPolicyReleaseState(config) {
  const state = await readJsonObject(config.state_path);
  return normalizeState(state, config);
}

export async function writePolicyReleaseState(config, state) {
  await mkdir(path.dirname(config.state_path), { recursive: true });
  await writeFile(config.state_path, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}
