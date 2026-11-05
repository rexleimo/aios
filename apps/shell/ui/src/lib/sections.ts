// The navigation is data, not markup: the sidebar and the `[section]` route both read it,
// so a page cannot exist in one and be missing from the other.
export type SectionId =
  | 'overview'
  | 'sessions'
  | 'memory'
  | 'usage'
  | 'matrix'
  | 'skills'
  | 'team'
  | 'integrations'
  | 'settings';

export interface SectionMeta {
  id: SectionId;
  href: string;
  label: string;
  group: '使用' | '模型' | '观测' | '扩展' | '设置';
  description: string;
  /** Which command produces the page's facts — shown in the page footer. */
  source: string;
}

export const SECTIONS: readonly SectionMeta[] = [
  {
    id: 'overview',
    href: '/',
    label: '总览',
    group: '使用',
    description: 'AIOS 的当前状态：有多少客户端接入、证据缺口在哪、阻断项是什么。',
    source: 'aios status --json + config/host-capabilities.json',
  },
  {
    id: 'sessions',
    href: '/sessions',
    label: '会话',
    group: '使用',
    description: 'ContextDB 记下的每一次会话：目标、摘要、检查点、最近事件。',
    source: '.aios/context-db/sessions/',
  },
  {
    id: 'memory',
    href: '/memory',
    label: '记忆',
    group: '使用',
    description: '项目记忆的事件量、空间占用与召回反馈。',
    source: 'aios memory report --json',
  },
  {
    id: 'usage',
    href: '/usage',
    label: '用量',
    group: '模型',
    description: '按层记账的 token 用量：原始体积、压缩后体积、省下多少。',
    source: 'aios tokens report --json',
  },
  {
    id: 'matrix',
    href: '/matrix',
    label: '接入矩阵',
    group: '观测',
    description: '13 个客户端 × 7 个能力轴：谁声明了什么，谁的证据还缺。',
    source: 'apps/shell/data/load.mjs',
  },
  {
    id: 'skills',
    href: '/skills',
    label: '技能健康',
    group: '观测',
    description: '技能的安装与失败模式。',
    source: 'aios skill health --json',
  },
  {
    id: 'team',
    href: '/team',
    label: '团队与工作流',
    group: '观测',
    description: '默认 agent 目录与工作流配方：哪些能真跑，哪些被门挡住。',
    source: 'aios agents list --json + aios workflow list --json',
  },
  {
    id: 'integrations',
    href: '/integrations',
    label: '集成',
    group: '扩展',
    description: '第三方集成注册表：装了什么、需要什么环境变量。',
    source: 'aios integration list --json',
  },
  {
    id: 'settings',
    href: '/settings',
    label: '能力声明',
    group: '设置',
    description: '决定接入矩阵每一格的那份声明：在这里改，矩阵随之变。',
    source: 'config/host-capabilities.json',
  },
];

export const NAV_GROUPS = ['使用', '模型', '观测', '扩展', '设置'] as const;

export function sectionsIn(group: string): SectionMeta[] {
  return SECTIONS.filter((section) => section.group === group);
}

export function sectionById(id: string): SectionMeta | undefined {
  return SECTIONS.find((section) => section.id === id || section.href === `/${id}`);
}
