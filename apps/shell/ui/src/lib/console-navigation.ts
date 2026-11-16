// Route ownership for the current Console. Server routes and browser history share this table.
export const CONSOLE_VIEWS = {
  home: { href: '/', label: '首页', title: '概览' },
  tools: { href: '/tools', label: 'AI 工具', title: 'AI 工具' },
  routing: { href: '/routing', label: '模型路由', title: '模型路由' },
  // 二级页：配置交互独立成页，监控页（/routing）不再堆编辑器。不进 PRIMARY_VIEWS。
  routingConfig: { href: '/routing/config', label: '路由配置', title: '路由配置' },
  mcp: { href: '/mcp', label: 'MCP 服务', title: 'MCP 服务' },
  memory: { href: '/memory', label: '记忆', title: '项目记忆' },
  activity: { href: '/activity', label: '活动记录', title: '活动记录' },
  settings: { href: '/settings', label: '设置', title: '应用设置' },
} as const;
export type ViewId = keyof typeof CONSOLE_VIEWS;
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
