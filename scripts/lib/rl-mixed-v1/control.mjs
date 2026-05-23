// 纯函数：构造控制状态初始快照，集中定义 RL 指针默认值。
export function buildControlSnapshot(initialCheckpointId) {
  return {
    active_checkpoint_id: initialCheckpointId,
    pre_update_ref_checkpoint_id: null,
    last_stable_checkpoint_id: initialCheckpointId,
    mode: 'collection',
    applied_event_ids: [],
    last_event_id: null,
  };
}

// 纯函数：稳定生成两个环境的组合 key，避免报告顺序受采样顺序影响。
export function orderedPair(left, right) {
  return [left, right].sort((a, b) => a.localeCompare(b)).join('+');
}

// 纯函数：从本批环境采样记录生成去重前组合列表，用于覆盖率统计。
export function buildBatchCombinations(batchEnvironments = []) {
  const unique = [...new Set(batchEnvironments)];
  const combinations = [];
  for (let index = 0; index < unique.length; index += 1) {
    for (let inner = index + 1; inner < unique.length; inner += 1) {
      combinations.push(orderedPair(unique[index], unique[inner]));
    }
  }
  return combinations;
}

// 纯函数：按活跃环境创建计数器，恢复或新跑时都使用相同结构。
export function normalizeEnvironmentCounts(activeEnvironments, counts = {}) {
  return Object.fromEntries(activeEnvironments.map((environment) => [environment, Number(counts[environment] || 0)]));
}
