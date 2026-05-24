// 纯函数：对可 JSON 序列化对象做深拷贝，写 checkpoint 时隔离策略对象。
export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

// 纯函数：生成教师后端不可用时的标准响应，训练流程无需关心 fallback 细节。
export function createTeacherFailureResponse(backend) {
  return {
    backend_used: backend,
    call_status: 'failed_all_backends',
    latency_ms: 0,
    critique: null,
    reference_solution: null,
    shaping_score: 0,
    confidence: 0,
  };
}

// 纯函数：过滤空值并保持首次出现顺序去重。
export function dedupe(items) {
  return [...new Set(items.filter(Boolean))];
}

// 纯函数：统一 run/epoch/batch 序号格式，避免不同模块拼接出不兼容 ID。
export function formatSequenceId(prefix, value) {
  return `${prefix}-${String(value).padStart(3, '0')}`;
}

// 纯函数：生成稳定的训练运行 ID，便于日志、目录与摘要对齐。
export function createRunId({ seed }) {
  return `rl-shell-v1-s${seed}-${Date.now()}`;
}

// 纯函数：判断一轮训练是否达到终止预算，避免主流程重复写边界判断。
export function shouldStopRun({ episodesCompleted, updatesCompleted, config }) {
  return episodesCompleted >= Number(config.maxEpisodesPerRun || 1) || updatesCompleted >= Number(config.maxUpdatesPerRun || 1);
}
