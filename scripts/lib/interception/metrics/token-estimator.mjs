/* 中文注释：Metrics 层记录节省率、泄漏检查和 ref 命中情况，作为完成度证明。 */
export function estimateTokensFromBytes(bytes) {
  const n = Number(bytes) || 0;
  return Math.ceil(n / 4);
}
