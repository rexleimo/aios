import { computeContextualBanditPolicyDistribution, evaluateContextualBanditOpe } from '../../rl-core/ope-eval.mjs';
import { clamp } from '../shared.mjs';
import { ORCHESTRATOR_OPE_DEFAULT } from '../reward-config.mjs';

// 纯函数：规范化 OPE 日志行，丢弃缺少动作空间或选中动作的脏数据。
export function normalizeOpeLogRow(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const actionSpace = Array.isArray(raw.action_space)
    ? raw.action_space
      .map((action) => (typeof action === 'string' ? action.trim() : ''))
      .filter((action, index, source) => action.length > 0 && source.indexOf(action) === index)
    : [];
  const selectedAction = typeof raw.selected_action === 'string' ? raw.selected_action.trim() : '';
  if (actionSpace.length === 0 || !selectedAction || !actionSpace.includes(selectedAction)) {
    return null;
  }
  const actionProbabilities = raw.logging_action_probabilities
    && typeof raw.logging_action_probabilities === 'object'
    && !Array.isArray(raw.logging_action_probabilities)
    ? raw.logging_action_probabilities
    : {};
  return {
    timestamp: typeof raw.timestamp === 'string' ? raw.timestamp : new Date().toISOString(),
    batch_id: typeof raw.batch_id === 'string' ? raw.batch_id : '',
    behavior_version_id: typeof raw.behavior_version_id === 'string' ? raw.behavior_version_id : null,
    context_key: typeof raw.context_key === 'string' ? raw.context_key : 'default',
    action_space: actionSpace,
    selected_action: selectedAction,
    reward: Number(raw.reward || 0),
    logging_probability: clamp(Number(raw.logging_probability || 0), 0, 1),
    logging_action_probabilities: Object.fromEntries(
      actionSpace.map((action) => [action, clamp(Number(actionProbabilities[action] || 0), 0, 1)])
    ),
  };
}

// 纯函数：统一 OPE 指标结构，避免旧 checkpoint 缺字段造成报表分支。
export function normalizePolicyOpeMetrics(raw) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const normalizeInterval = (value) => {
    if (!Array.isArray(value) || value.length !== 2) {
      return [0, 0];
    }
    return [Number(value[0] || 0), Number(value[1] || 0)];
  };
  return {
    sample_count: Number(source.sample_count || 0),
    ips: Number(source.ips || 0),
    self_normalized_ips: Number(source.self_normalized_ips || 0),
    dr: Number(source.dr || 0),
    avg_logged_reward: Number(source.avg_logged_reward || 0),
    effective_sample_size: Number(source.effective_sample_size || 0),
    max_importance_weight: Number(source.max_importance_weight || 0),
    clip_weight: Number(source.clip_weight || 0),
    min_logging_probability: Number(source.min_logging_probability || 0),
    ips_ci95: normalizeInterval(source.ips_ci95),
    dr_ci95: normalizeInterval(source.dr_ci95),
  };
}

// 纯函数：把本批训练轨迹转成 OPE 日志行，只有 contextual bandit 轨迹会入库。
export function buildBatchOpeRows({ trajectories = [], batchId = '', behaviorVersionId = null } = {}) {
  return trajectories
    .filter((row) => row?.updateType === 'contextual_bandit')
    .map((row) => normalizeOpeLogRow({
      timestamp: new Date().toISOString(),
      batch_id: batchId,
      behavior_version_id: behaviorVersionId,
      context_key: row.contextKey,
      action_space: row.actions,
      selected_action: row.selectedAction,
      reward: row.reward,
      logging_probability: row.loggingActionProbability,
      logging_action_probabilities: row.loggingActionProbabilities,
    }))
    .filter(Boolean);
}

// 纯函数：对活跃策略和参考策略做同窗 OPE，输出可直接落 checkpoint 的结构。
export function composeOpeEvaluation({
  rows = [],
  activePolicy = null,
  referencePolicy = null,
  trainerConfig = {},
  opeConfig = ORCHESTRATOR_OPE_DEFAULT,
} = {}) {
  const policyDistributionResolver = (policy) => (event) => computeContextualBanditPolicyDistribution({
    policy,
    contextKey: event.context_key,
    actionSpace: event.action_space,
    temperature: trainerConfig.contextual_bandit_temperature,
  });
  const active = normalizePolicyOpeMetrics(evaluateContextualBanditOpe({
    events: rows,
    policyDistributionResolver: policyDistributionResolver(activePolicy || {}),
    clipWeight: opeConfig.clip_weight,
    minLoggingProbability: opeConfig.min_logging_probability,
  }));
  const reference = normalizePolicyOpeMetrics(evaluateContextualBanditOpe({
    events: rows,
    policyDistributionResolver: policyDistributionResolver(referencePolicy || {}),
    clipWeight: opeConfig.clip_weight,
    minLoggingProbability: opeConfig.min_logging_probability,
  }));
  return {
    window_size: rows.length,
    active_policy: active,
    reference_policy: reference,
    dr_lift_vs_reference: Number(active.dr || 0) - Number(reference.dr || 0),
  };
}
