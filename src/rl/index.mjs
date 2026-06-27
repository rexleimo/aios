// src/rl/index.mjs — RL 域统一入口 barrel
// 5 个 RL 子域（core/shell-v1/browser-v1/orchestrator-v1/mixed-v1）的公共 API 统一导出
// 引用者既可使用此 barrel，也可继续使用 scripts/lib/rl-xxx/xxx.mjs 直接路径（向后兼容）

// === rl-core: RL 核心类型与训练器 ===
export {
  ENVIRONMENTS,
  COMPARISON_STATUSES,
  RELATIVE_OUTCOMES,
  REPLAY_ROUTES,
  CONTROL_MODES,
  TEACHER_CALL_STATUSES,
  UPDATE_RESULT_STATUSES,
  HOLDOUT_VALIDATION_STATUSES,
  EPOCH_OUTCOMES,
  TEACHER_TRIGGER_REASONS,
} from '../../scripts/lib/rl-core/contracts.mjs';

export {
  applyPointerTransition,
} from '../../scripts/lib/rl-core/checkpoint-registry.mjs';

export {
  normalizeEpisodeComparison,
  computeDegradationStreak,
  reduceDegradationStreak,
  summarizeComparisonResults,
} from '../../scripts/lib/rl-core/comparison-engine.mjs';

export {
  createControlStateStore,
  readControlSnapshot,
  writeControlSnapshot,
  applyControlEvent,
} from '../../scripts/lib/rl-core/control-state-store.mjs';

// === rl-orchestrator-v1: 编排器适配器（被 lifecycle/release-status 引用）===
export {
  normalizePolicyReleaseConfig,
} from '../../scripts/lib/rl-orchestrator-v1/policy-release-gate.mjs';

// === rl-shell-v1: Shell 任务执行 ===
// === rl-browser-v1: 浏览器任务执行 ===
// === rl-mixed-v1: 混合策略 ===
// 这三个子域目前只被 rl- 内部引用，暂不导出公共 API
