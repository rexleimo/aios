import { readFile } from 'node:fs/promises';

import { clamp, computeHash, normalizeMode, parseBoolean } from './shared.mjs';

async function isKillSwitchActive(config) {
  const envKey = String(config.kill_switch_env_key || '').trim();
  if (envKey && parseBoolean(config.env?.[envKey], false)) {
    return true;
  }
  const filePath = String(config.kill_switch_file || '').trim();
  if (!filePath) {
    return false;
  }
  try {
    const content = String(await readFile(filePath, 'utf8')).trim().toLowerCase();
    if (!content) return true;
    return parseBoolean(content, true);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return false;
    }
    return false;
  }
}

function computeCanaryBucket({ taskId = '', checkpointId = '', attempt = 0 } = {}) {
  const hash = computeHash(`${taskId}:${checkpointId}:${attempt}`);
  return (hash % 10000) / 10000;
}

export async function decidePolicyReleaseRoute({
  config,
  state,
  taskId = '',
  checkpointId = '',
  attempt = 0,
  selectedExecutor = null,
} = {}) {
  const candidateExecutor = typeof selectedExecutor === 'string' && selectedExecutor.trim().length > 0
    ? selectedExecutor.trim()
    : null;
  if (!config.enabled) {
    return {
      mode: 'legacy',
      effective_mode: 'legacy',
      apply_policy_executor: Boolean(candidateExecutor),
      applied_executor: candidateExecutor,
      candidate_executor: candidateExecutor,
      execution_mode: config.requested_execution_mode,
      rollout_rate: 1,
      reason: candidateExecutor ? 'legacy_passthrough' : 'no_candidate_executor',
      downgraded: false,
    };
  }

  const killSwitch = await isKillSwitchActive(config);
  const effectiveMode = killSwitch ? 'off' : normalizeMode(state.effective_mode || config.mode);
  const rolloutRate = clamp(state.effective_rollout_rate ?? config.rollout_rate, 0, 1);

  if (!candidateExecutor) {
    return {
      mode: config.mode,
      effective_mode: effectiveMode,
      apply_policy_executor: false,
      applied_executor: null,
      candidate_executor: null,
      execution_mode: config.baseline_execution_mode,
      rollout_rate: rolloutRate,
      reason: 'no_candidate_executor',
      downgraded: false,
    };
  }

  if (effectiveMode === 'off') {
    return {
      mode: config.mode,
      effective_mode: effectiveMode,
      apply_policy_executor: false,
      applied_executor: null,
      candidate_executor: candidateExecutor,
      execution_mode: config.baseline_execution_mode,
      rollout_rate: rolloutRate,
      reason: killSwitch ? 'kill_switch_active' : 'mode_off',
      downgraded: false,
    };
  }

  if (effectiveMode === 'observe') {
    return {
      mode: config.mode,
      effective_mode: effectiveMode,
      apply_policy_executor: false,
      applied_executor: null,
      candidate_executor: candidateExecutor,
      execution_mode: config.baseline_execution_mode,
      rollout_rate: rolloutRate,
      reason: 'observe_mode',
      downgraded: false,
    };
  }

  if (effectiveMode === 'full') {
    return {
      mode: config.mode,
      effective_mode: effectiveMode,
      apply_policy_executor: true,
      applied_executor: candidateExecutor,
      candidate_executor: candidateExecutor,
      execution_mode: config.policy_execution_mode,
      rollout_rate: 1,
      reason: 'full_mode',
      downgraded: false,
    };
  }

  const bucket = computeCanaryBucket({
    taskId,
    checkpointId,
    attempt,
  });
  const apply = bucket < rolloutRate;
  return {
    mode: config.mode,
    effective_mode: effectiveMode,
    apply_policy_executor: apply,
    applied_executor: apply ? candidateExecutor : null,
    candidate_executor: candidateExecutor,
    execution_mode: apply ? config.policy_execution_mode : config.baseline_execution_mode,
    rollout_rate: rolloutRate,
    canary_bucket: bucket,
    reason: apply ? 'canary_sampled' : 'canary_holdout',
    downgraded: false,
  };
}
