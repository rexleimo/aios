// 角色 / 成本 / 速度的界面词表：监控页的只读默认表与配置页的覆盖编辑共用同一份，
// 避免两处各写一套导致同一个角色在两个面叫不同名字。
export const ROLES = ['planner', 'implementer', 'reviewer', 'security-reviewer', 'team-lead', 'team-member'];
export const ROLE_LABEL: Record<string, string> = {
  planner: '规划',
  implementer: '实现',
  reviewer: '审查',
  'security-reviewer': '安全审查',
  'team-lead': '团队负责',
  'team-member': '团队成员',
};
export const COST_LABEL: Record<string, string> = { lowest: '极省', low: '省', medium: '中等', high: '偏高', highest: '最高', unknown: '未知' };
export const SPEED_LABEL: Record<string, string> = { fast: '快', medium: '中', slow: '慢', unknown: '未知' };
export const costTone = (cost: string) => (cost === 'lowest' || cost === 'low' ? 'ok' : cost === 'high' || cost === 'highest' ? 'warn' : 'neutral');