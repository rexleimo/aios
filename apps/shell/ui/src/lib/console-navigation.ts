// Route ownership for the current Console. Server routes and browser history share this table.
export const CONSOLE_VIEWS = {
  home: { href: '/', label: '首页', title: '概览', labelKey: 'nav.home', titleKey: 'nav.home.title' },
  tools: { href: '/tools', label: 'Agent 客户端', title: 'Agent 客户端', labelKey: 'nav.tools', titleKey: 'nav.tools.title' },
  routing: { href: '/routing', label: '模型路由', title: '模型路由', labelKey: 'nav.routing', titleKey: 'nav.routing.title' },
  // 兼容旧书签；策略从模型路由内部导航进入，不新增侧栏目的地。
  routingConfig: { href: '/routing/config', label: '模型分配', title: '模型分配', labelKey: 'nav.routingConfig', titleKey: 'nav.routingConfig.title' },
  mcp: { href: '/mcp', label: '资源库', title: '资源库', labelKey: 'nav.mcp', titleKey: 'nav.mcp.title' },
  memory: { href: '/memory', label: '记忆', title: '项目记忆', labelKey: 'nav.memory', titleKey: 'nav.memory.title' },
  activity: { href: '/activity', label: '活动记录', title: '活动记录', labelKey: 'nav.activity', titleKey: 'nav.activity.title' },
  settings: { href: '/settings', label: '设置', title: '应用设置', labelKey: 'nav.settings', titleKey: 'nav.settings.title' },
} as const;
export type ViewId = keyof typeof CONSOLE_VIEWS;
/** 导航 id：内置 ViewId 或插件贡献的 `plugin:<id>`。用于跨视图传递，不做 CONSOLE_VIEWS 索引。 */
export type NavId = string;
export const PRIMARY_VIEWS = (Object.keys(CONSOLE_VIEWS) as ViewId[])
  .filter(id => id !== 'settings' && id !== 'routingConfig')
  .map(id => ({ id, ...CONSOLE_VIEWS[id] }));

// Old bookmarks enter the corresponding new view; the retired interface is never rendered.
export const LEGACY_ROUTES: Readonly<Record<string, string>> = {
  '/prototype': '/',
  '/overview': '/',
  '/sessions': '/activity',
  '/usage': '/activity',
  '/matrix': '/tools',
};

export function viewForPath(pathname: string): ViewId | undefined {
  return (Object.keys(CONSOLE_VIEWS) as ViewId[]).find(id => CONSOLE_VIEWS[id].href === pathname);
}

export function legacyDestination(pathname: string): string | undefined {
  return Object.hasOwn(LEGACY_ROUTES, pathname) ? LEGACY_ROUTES[pathname] : undefined;
}
