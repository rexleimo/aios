import { t } from '../../../i18n/t.mjs';
// 角色 / 成本 / 速度的界面词表：监控页的只读默认表与配置页的覆盖编辑共用同一份，
// 避免两处各写一套导致同一个角色在两个面叫不同名字。
export const ROLES = ['planner', 'implementer', 'reviewer', 'security-reviewer', 'team-lead', 'team-member'];
export const ROLE_LABEL: Record<string, string> = {
  planner: t("规划"),
  implementer: t("实现"),
  reviewer: t("审查"),
  'security-reviewer': t("安全审查"),
  'team-lead': t("团队负责"),
  'team-member': t("团队成员"),
};
export const COST_LABEL: Record<string, string> = { lowest: t("极省"), low: t("省"), medium: t("中等"), high: t("偏高"), highest: t("最高"), unknown: t("未知") };
export const SPEED_LABEL: Record<string, string> = { fast: t("快"), medium: t("中"), slow: t("慢"), unknown: t("未知") };
export const costTone = (cost: string) => (cost === 'lowest' || cost === 'low' ? 'ok' : cost === 'high' || cost === 'highest' ? 'warn' : 'neutral');