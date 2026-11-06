export type ServiceResult = 'written' | 'passed' | 'failed' | 'conflict';
export const RESULT = {
  written: { label: '配置已写入 · 尚未测试', tone: 'neutral' as const },
  passed: { label: '连接测试通过', tone: 'ok' as const },
  failed: { label: '连接测试失败', tone: 'danger' as const },
  conflict: { label: '配置已变更 · 未写入', tone: 'warn' as const },
};
