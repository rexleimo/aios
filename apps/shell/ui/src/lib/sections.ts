// The navigation is data, not markup: the sidebar and the `[section]` route both read it,
// so a page cannot exist in one and be missing from the other.
export type SectionId =
  | 'overview'
  | 'sessions'
  | 'memory'
  | 'tools'
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
    id: 'tools',
    href: '/tools',
    label: '我的 AI 工具',
    group: '观测',
    description: '每个客户端接了什么、能不能用、缺什么、怎么修；技能与集成在这里是细节。',
    source: 'config/host-capabilities.json + aios status --json',
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
