'use client';

import { useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BookOpen,
  Box,
  ChevronDown,
  Clock,
  Folder,
  Home,
  Moon,
  Plug,
  Route,
  Settings2,
  ShieldCheck,
  Sun,
  Terminal,
} from 'lucide-react';
import { CONSOLE_VIEWS, PRIMARY_VIEWS, viewForPath } from '../../lib/console-navigation';
import { useT } from '../../i18n/provider';
import { LocaleSwitcher } from '../../i18n/switcher';
import type { ConsoleFacts } from '../../lib/console-facts';
import { HomeWorkspace, ToolsWorkspace } from './home-workspace';
import { MemoryWorkspace } from './memory-workspace';
import { ResourcesWorkspace } from './resources-workspace';
import { Button, Heading, Panel, Select } from './console-ui';
import { GatewayWorkspace } from './gateway-workspace';
import { PluginPanelView, type PluginPanelItem } from './plugin-panel-view';

const ICONS: Record<string, typeof Home> = { home: Home, tools: Terminal, routing: Route, routingConfig: Route, mcp: Plug, memory: BookOpen, activity: Activity, settings: Settings2 };
const BASE_NAV = PRIMARY_VIEWS.map(item => ({ ...item, icon: ICONS[item.id] as typeof Home }));

/** 主导航 = 内置视图 + 插件声明式贡献的 panel。插件 id 带 `plugin:` 前缀，不与内置冲突。 */
function buildNav(pluginViews: PluginPanelItem[]) {
  const extra = (pluginViews || []).map((item) => ({
    id: item.id,
    href: item.href,
    label: item.label,
    title: item.title,
    icon: Plug as typeof Home,
  }));
  return [...BASE_NAV, ...extra];
}

/** 采集时间怎么念：刚刚 / N 秒前 / N 分钟前——数据新鲜度是一条事实，不是装饰。 */
function ageLabel(iso: string, now: number, t: (key: string, values?: Record<string, unknown>) => string): string {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (seconds < 5) return t('shell.ageJustNow');
  if (seconds < 60) return t('shell.ageSeconds', { seconds });
  return t('shell.ageMinutes', { minutes: Math.round(seconds / 60) });
}

function CollectionAge({ generatedAt }: { generatedAt: string }) {
  const t = useT();
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const update = () => setNow(Date.now());
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, []);
  // Use the supplied timestamp until hydration completes; relative age depends on the live clock.
  return <>{now === null ? generatedAt : ageLabel(generatedAt, now, t)}</>;
}

/** 服务端解析「选了哪个工作区」的结果，递下来给界面说实情（界面自己不算路径）。 */
export interface WorkspaceSelection {
  requested: string;
  ok: boolean;
  reason?: string;
  detail?: string;
}

export function ConsoleWorkspace({
  initialView,
  facts,
  selection = { requested: '', ok: true },
}: {
  initialView: string;
  facts: ConsoleFacts;
  selection?: WorkspaceSelection;
}) {
  const t = useT();
  const [view, setView] = useState<string>(initialView);
  const pluginViews = facts.pluginViews ?? [];
  const nav = buildNav(pluginViews);
  const labelOf = (item: { id: string; label: string; title: string; labelKey?: string; titleKey?: string }) => ({
    label: item.labelKey ? t(item.labelKey) : item.label,
    title: item.titleKey ? t(item.titleKey) : item.title,
  });
  const findView = (id: string) => nav.find((item) => item.id === id) ?? nav[0];
  function navigate(next: string, section?: string) {
    const params = new URLSearchParams();
    const ws = new URLSearchParams(window.location.search).get('ws');
    if (ws) params.set('ws', ws);
    if (section) params.set('section', section);
    const href = `${findView(next).href}${params.size ? `?${params}` : ''}`;
    if (`${window.location.pathname}${window.location.search}` !== href) {
      window.history.pushState(null, '', href);
    }
    setView(next);
  }

  useEffect(() => {
    const onBackForward = () => {
      const found = buildNav(facts.pluginViews ?? []).find((item) => item.href === window.location.pathname);
      setView(found?.id ?? viewForPath(window.location.pathname) ?? 'home');
    };
    window.addEventListener('popstate', onBackForward);
    return () => window.removeEventListener('popstate', onBackForward);
  }, []);
  const [theme, setTheme] = useState('light');
  const [selectedToolId, setSelectedToolId] = useState<string | null>(null);
  // 首页改为路由总览后不再有「首页→某条记忆」的深链；target 保持稳定的空初值，
  // 记忆页用自己的内部选择。保留 useState 是为了引用稳定（避免每次渲染新对象触发其 effect）。
  const [memoryTarget] = useState({ id: '', nonce: 0 });
  // 当前选中的工作区以**服务端事实**为准（facts 就是按哪个根采集的），不是界面本地的一个选择状态：
  // 这样 URL、数据、下拉框三者不可能相互说不同的话。
  const selectedWorkspaceKey = facts.projects.find((item) => item.current)?.key ?? facts.projects[0]?.key ?? '';
  function selectWorkspace(key: string) {
    if (!key || key === selectedWorkspaceKey) return;
    // 真实换 URL 并让服务端重采集——这是「选择能改数据」与「选择只是饰品」的分界。
    window.location.href = `${findView(view).href}?ws=${encodeURIComponent(key)}`;
  }
  // 面板懒挂载：没打开过的面板不进首屏 HTML，省掉一次采集与一串 DOM。
  const [mounted, setMounted] = useState(() => new Set<string>([initialView]));
  useEffect(() => {
    setMounted((previous) => (previous.has(view) ? previous : new Set([...previous, view])));
  }, [view]);
  const project = facts.projects.find((item) => item.key === selectedWorkspaceKey) ?? facts.projects[0];
  useEffect(() => {
    const previous = document.documentElement.dataset.rexTheme;
    return () => {
      document.documentElement.dataset.rexTheme = previous ?? 'light';
    };
  }, []);
  function changeTheme(value: string) {
    setTheme(value);
    document.documentElement.dataset.rexTheme = value;
  }
  // 还没接线的视图：如实标注，不靠全局横幅把所有面板一起说成假的——首屏已经是真实数据。
  const navView = view === 'routingConfig' ? 'routing' : view;
  return (
    <div data-aios-app-root className="min-h-dvh bg-rex-bg font-rex-body text-rex-text">
      <a
        href="#console-content"
        className="fixed top-2 left-2 z-[60] -translate-y-20 rounded-lg bg-rex-cyan px-4 py-2 text-white focus:translate-y-0"
      >
        {t('shell.skipToContent')}
      </a>
      <aside className="fixed inset-y-0 left-0 z-20 flex w-[68px] flex-col border-r border-rex-border bg-rex-panel/60 md:w-[212px]">
        <div className="flex h-[78px] items-center gap-2.5 px-[18px] md:px-6">
          <span className="grid size-9 shrink-0 place-items-center rounded-rex-md border border-rex-border bg-rex-panel">
            <img src="/aios-mark.png" alt="AIOS" width={30} height={30} className="size-[30px] object-contain" />
          </span>
          <span className="hidden md:block">
            <span className="block font-rex-display text-lg leading-5 font-semibold tracking-tight">AIOS</span>
            <span className="text-[10px] tracking-wide text-rex-text-muted">{t('shell.tagline')}</span>
          </span>
        </div>
        <div className="mx-3 hidden rounded-lg border border-rex-border bg-rex-bg px-3 py-2.5 md:block">
          <div className="flex items-center gap-2 text-xs font-medium">
            <Box size={14} className="text-rex-text-muted" />
            {project?.name ?? t('shell.localWorkspace')}
          </div>
          <p className="mt-1 pl-[22px] text-[10px] break-all text-rex-text-muted">{facts.rootDir}</p>
        </div>
        <nav aria-label={t('shell.navAria')} className="mt-7 space-y-1 px-3">
          {nav.map((item) => (
              <button
                key={item.id}
                title={labelOf(item).label}
                aria-label={labelOf(item).label}
                onClick={() => navigate(item.id)}
                aria-current={navView === item.id ? 'page' : undefined}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-rex-cyan ${navView === item.id ? 'bg-rex-bg font-medium text-rex-text shadow-sm ring-1 ring-rex-border' : 'text-rex-text-muted hover:bg-rex-panel-strong/60 hover:text-rex-text'}`}
              >
                <item.icon
                  size={17}
                  strokeWidth={1.7}
                  className={`shrink-0 ${navView === item.id ? 'text-rex-cyan' : ''}`}
                />
                <span className="hidden md:inline">{labelOf(item).label}</span>
                {item.id === 'mcp' && facts.issues.length > 0 && (
                  <span className="ml-auto hidden size-4 items-center justify-center rounded bg-rex-orange/10 text-[10px] text-rex-text-body md:flex">
                    {facts.issues.length}
                  </span>
                )}
              </button>
          ))}
        </nav>
        <div className="mx-4 mt-auto mb-5 hidden rounded-xl border border-rex-border p-3.5 md:block">
          <BookOpen size={17} className="mb-2 text-rex-cyan" />
          <p className="text-xs font-medium">{t('shell.knowledgeTitle')}</p>
          <p className="mt-1 text-[11px] leading-5 text-rex-text-muted">
            {t('shell.knowledgeBody', { count: facts.memories.length })}
          </p>
          <button
            onClick={() => navigate('memory')}
            className="mt-3 flex items-center gap-1 rounded text-[11px] font-medium text-rex-cyan focus-visible:outline-2 focus-visible:outline-rex-cyan"
          >
            {t('shell.openMemory')}
            <ArrowUpRight size={12} />
          </button>
        </div>
        <div className="mt-auto border-t border-rex-border px-3 py-3 md:mt-0">
          <button
            title={t('shell.settings')}
            onClick={() => navigate('settings')}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-xs text-rex-text-muted hover:bg-rex-panel focus-visible:outline-2 focus-visible:outline-rex-cyan"
          >
            <Settings2 size={17} className="shrink-0" />
            <span className="hidden md:inline">{t('shell.settings')}</span>
          </button>
        </div>
      </aside>
      <div className="ml-[68px] min-w-0 md:ml-[212px]">
        <div className="sticky top-0 z-10 border-b border-rex-border bg-rex-bg/95 backdrop-blur-sm">
          <div className="flex min-h-[60px] flex-wrap items-center gap-3 px-4 lg:px-8">
            <span className="hidden text-xs text-rex-text-muted sm:inline">{t('shell.localWorkspace')}</span>
            <span className="hidden text-rex-text-muted sm:inline">/</span>
            <span className="text-xs font-medium">{labelOf(findView(view)).title}</span>
            <div className="ml-auto flex min-w-0 max-w-full items-center gap-2 text-xs">
              <Folder size={14} className="hidden text-rex-text-muted sm:block" />
              <label htmlFor="console-workspace" className="sr-only">
                {t('shell.selectWorkspace')}
              </label>
              {/* 中文注释：选完直接换 URL 让**服务端重新采集**。旧版只 setProjectId，
                  而没有任何东西读它：切项目后下面所有数字还是服务自己那个根，
                  界面在暗示它在按选择过滤。现在 key 是唯一回传量，路径不由页面交出。 */}
              <Select
                size="sm"
                aria-label={t('shell.selectWorkspace')}
                value={selectedWorkspaceKey}
                onValueChange={selectWorkspace}
                className="max-w-[170px] sm:max-w-[220px]"
                options={facts.projects.map((item) => ({
                  value: item.key,
                  label: `${item.name}${item.current ? t('shell.workspaceSelectCurrent') : item.missing ? t('shell.workspaceSelectMissing') : ''}${t('shell.workspaceSelectMemos', { count: item.memos })}`,
                }))}
              />
              <LocaleSwitcher />
              <ChevronDown size={12} className="hidden" />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-rex-border bg-rex-panel/70 px-4 py-2 text-[11px] leading-5 text-rex-text-muted lg:px-8">
            <span className="inline-flex items-center gap-1.5 font-medium text-rex-text-body">
              <Clock size={13} />
              <CollectionAge generatedAt={facts.generatedAt} />
            </span>
            <span>
              {t('shell.workspace')} <strong className="font-medium text-rex-text-body">{project?.name ?? facts.rootDir}</strong>
              {' · '}
              <span className="break-all">{facts.rootDir}</span>
              {' · '}{t('shell.oneCollection')}
              {facts.totalMs}ms · {facts.services.rows.length} {t('shell.serviceInstances')} ·{' '}
              {facts.memories.length < (project?.memos ?? 0) ? (
                <>{t('shell.readBack', { read: facts.memories.length, total: project?.memos })}</>
              ) : (
                <>{t('common.memoryCount', { count: project?.memos ?? facts.memories.length })}</>
              )}
            </span>
            {facts.sessionsAudit?.ok === true && facts.sessionsAudit.withoutMeta.length > 0 && (
              <span title={facts.sessionsAudit.withoutMeta.join(', ')}>
                {t('shell.sessionsAudit', { count: facts.sessions.length, skipped: facts.sessionsAudit.withoutMeta.length })}
              </span>
            )}
            {!selection.ok && (
              <span className="inline-flex items-center gap-1.5 text-rex-danger">
                <AlertTriangle size={13} />
                {t('shell.workspaceNotApplied', { reason: selection.reason, detail: selection.detail })}
              </span>
            )}
            {facts.degraded.length > 0 && (
              <span className="inline-flex items-center gap-1.5 text-rex-danger">
                <AlertTriangle size={13} />
                {t('shell.unread', { count: facts.degraded.length })}
              </span>
            )}
          </div>
        </div>
        <main id="console-content" className="mx-auto max-w-[1440px] px-4 py-7 lg:px-8 lg:py-9" tabIndex={-1}>
          <div hidden={view !== 'home'}>
            <HomeWorkspace facts={facts} navigate={navigate} active={view === 'home'} />
          </div>
          {mounted.has('tools') && (
            <div hidden={view !== 'tools'}>
              <ToolsWorkspace facts={facts} onMcp={() => navigate('mcp')} selectedId={selectedToolId} onSelect={setSelectedToolId} />
            </div>
          )}
          {(mounted.has('routing') || mounted.has('routingConfig')) && (
            <div hidden={view !== 'routing' && view !== 'routingConfig'}>
              <GatewayWorkspace facts={facts} active={view === 'routing' || view === 'routingConfig'} view={view} navigate={navigate} />
            </div>
          )}
          {mounted.has('mcp') && (
            <div hidden={view !== 'mcp'}>
              <ResourcesWorkspace facts={facts} />
            </div>
          )}
          <div hidden={view !== 'memory'}>
            <MemoryWorkspace facts={facts} target={memoryTarget} />
          </div>
          <div hidden={view !== 'activity'}>
            <Heading
              eyebrow="ACTIVITY"
              title={t('shell.activityTitle')}
              description={t('shell.activityDesc')}
            />
            <Panel className="divide-y divide-rex-border px-5">
              {facts.sessions.map((session) => (
                <div key={session.sessionId} className="flex gap-3 py-5">
                  <span className="mt-0.5 size-2 shrink-0 rounded-full bg-rex-text-muted" />
                  <div>
                    <h2 className="text-sm font-medium">{session.goal || session.sessionId}</h2>
                    <p className="mt-2 text-xs leading-5 text-rex-text-muted">
                      {session.project} · {session.agent} · {session.status} · {session.events} {t('shell.events')}
                    </p>
                  </div>
                  <span className="ml-auto shrink-0 text-[10px] text-rex-text-muted">{session.updatedAt}</span>
                </div>
              ))}
              {facts.sessions.length === 0 && (
                <p className="py-6 text-sm text-rex-text-muted">{t('shell.noSessions')}</p>
              )}
            </Panel>
          </div>
          {pluginViews.map((item) => (
            <PluginPanelView key={item.id} item={item} active={view === item.id} />
          ))}
          <div hidden={view !== 'settings'}>
            <Heading
              eyebrow="PREFERENCES"
              title={t('shell.settingsTitle')}
              description={t('shell.settingsDesc')}
            />
            <Panel className="max-w-2xl p-6">
              <h2 className="mb-4 text-sm font-semibold">{t('shell.theme')}</h2>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { id: 'light', name: t('shell.themeLight'), icon: Sun },
                  { id: 'dark', name: t('shell.themeDark'), icon: Moon },
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => changeTheme(item.id)}
                    aria-pressed={theme === item.id}
                    className={`flex items-center gap-3 rounded-xl border p-4 text-sm focus-visible:outline-2 focus-visible:outline-rex-cyan ${theme === item.id ? 'border-rex-cyan bg-rex-cyan/5' : 'border-rex-border'}`}
                  >
                    <item.icon size={18} />
                    {item.name}
                  </button>
                ))}
              </div>
              <div className="mt-7 border-t border-rex-border pt-5">
                <h2 className="mb-2 text-sm font-semibold">{t('shell.configTarget')}</h2>
                <p className="text-xs leading-6 text-rex-text-muted">
                  {project?.name}
                  <br />
                  {facts.rootDir}
                </p>
                <p className="mt-3 flex items-center gap-2 text-xs leading-5 text-rex-text-muted">
                  <ShieldCheck size={15} className="shrink-0" />
                  {t('shell.memoryScopeHint')}
                </p>
              </div>
              <Button variant="outline" className="mt-6" onClick={() => window.location.reload()}>
                {t('shell.recollect')}
              </Button>
            </Panel>
          </div>
        </main>
        <footer className="mx-4 mt-2 flex flex-wrap items-center gap-2 border-t border-rex-border py-4 text-[10px] leading-5 text-rex-text-muted lg:mx-8">
          <LockHint />
          <span className="ml-auto">
            {t('shell.readItems')}{facts.timings.map((entry) => `${entry.item} ${entry.ms}ms`).join(' · ')}
          </span>
        </footer>
      </div>
    </div>
  );
}

function LockHint() {
  const t = useT();
  return (
    <span className="flex items-center gap-1.5">
      <ShieldCheck size={12} />
      {t('shell.readOnlyHint')}
    </span>
  );
}
