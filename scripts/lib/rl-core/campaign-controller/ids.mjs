// 纯函数：统一生成 epoch/batch 这类递增 ID，避免运行器里散落字符串拼接。
export function formatSequenceId(prefix, value) {
  return `${prefix}-${String(value).padStart(3, '0')}`;
}
