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
import type { ConsoleFacts } from '../../lib/console-facts';
import { HomeWorkspace, ToolsWorkspace } from './home-workspace';
import { MemoryWorkspace } from './memory-workspace';
import { ResourcesWorkspace } from './resources-workspace';
import { Button, Heading, Panel, Select } from './console-ui';
import { GatewayWorkspace } from './gateway-workspace';

const ICONS: Record<string, typeof Home> = { home: Home, tools: Terminal, routing: Route, routingConfig: Route, mcp: Plug, memory: BookOpen, activity: Activity, settings: Settings2 };
const BASE_NAV = PRIMARY_VIEWS.map(item => ({ ...item, icon: ICONS[item.id] as typeof Home }));
type PluginView = { id: string; href: string; label: string; title: string; source: string };

/** 主导航 = 内置视图 + 插件声明式贡献的 panel。插件 id 带 `plugin:` 前缀，不与内置冲突。 */
function buildNav(pluginViews: PluginView[]) {
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
function ageLabel(iso: string, now: number): string {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (seconds < 5) return '刚刚采集';
  if (seconds < 60) return `数据 ${seconds}s 前`;
  return `数据 ${Math.round(seconds / 60)}min 前`;
}

function CollectionAge({ generatedAt }: { generatedAt: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const update = () => setNow(Date.now());
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, []);
  // Use the supplied timestamp until hydration completes; relative age depends on the live clock.
  return <>{now === null ? `采集于 ${generatedAt}` : ageLabel(generatedAt, now)}</>;
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
  const [view, setView] = useState<string>(initialView);
  const pluginViews = facts.pluginViews ?? [];
  const nav = buildNav(pluginViews);
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
    <div className="min-h-dvh bg-rex-bg font-rex-body text-rex-text">
      <a
        href="#console-content"
        className="fixed top-2 left-2 z-[60] -translate-y-20 rounded-lg bg-rex-cyan px-4 py-2 text-white focus:translate-y-0"
      >
        跳到主要内容
      </a>
      <aside className="fixed inset-y-0 left-0 z-20 flex w-[68px] flex-col border-r border-rex-border bg-rex-panel/60 md:w-[212px]">
        <div className="flex h-[78px] items-center gap-2.5 px-[18px] md:px-6">
          <img
            src="/aios-mark.png"
            alt="AIOS"
            width={36}
            height={36}
            className="size-9 shrink-0 rounded-[10px]"
          />
          <span className="hidden md:block">
            <span className="block font-rex-display text-lg leading-5 font-semibold tracking-tight">AIOS</span>
            <span className="text-[10px] tracking-wide text-rex-text-muted">你的本机 AI 工作空间</span>
          </span>
        </div>
        <div className="mx-3 hidden rounded-lg border border-rex-border bg-rex-bg px-3 py-2.5 md:block">
          <div className="flex items-center gap-2 text-xs font-medium">
            <Box size={14} className="text-rex-text-muted" />
            {project?.name ?? '本机工作区'}
          </div>
          <p className="mt-1 pl-[22px] text-[10px] break-all text-rex-text-muted">{facts.rootDir}</p>
        </div>
        <nav aria-label="主导航" className="mt-7 space-y-1 px-3">
          {nav.map((item) => (
              <button
                key={item.id}
                title={item.label}
                aria-label={item.label}
                onClick={() => navigate(item.id)}
                aria-current={navView === item.id ? 'page' : undefined}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-rex-cyan ${navView === item.id ? 'bg-rex-bg font-medium text-rex-text shadow-sm ring-1 ring-rex-border' : 'text-rex-text-muted hover:bg-rex-panel-strong/60 hover:text-rex-text'}`}
              >
                <item.icon
                  size={17}
                  strokeWidth={1.7}
                  className={`shrink-0 ${navView === item.id ? 'text-rex-cyan' : ''}`}
                />
                <span className="hidden md:inline">{item.label}</span>
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
          <p className="text-xs font-medium">让经验留在项目里</p>
          <p className="mt-1 text-[11px] leading-5 text-rex-text-muted">
            本机 {facts.memories.length} 条记忆记录。
          </p>
          <button
            onClick={() => navigate('memory')}
            className="mt-3 flex items-center gap-1 rounded text-[11px] font-medium text-rex-cyan focus-visible:outline-2 focus-visible:outline-rex-cyan"
          >
            打开项目记忆
            <ArrowUpRight size={12} />
          </button>
        </div>
        <div className="mt-auto border-t border-rex-border px-3 py-3 md:mt-0">
          <button
            title="设置"
            onClick={() => navigate('settings')}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-xs text-rex-text-muted hover:bg-rex-panel focus-visible:outline-2 focus-visible:outline-rex-cyan"
          >
            <Settings2 size={17} className="shrink-0" />
            <span className="hidden md:inline">设置</span>
          </button>
        </div>
      </aside>
      <div className="ml-[68px] min-w-0 md:ml-[212px]">
        <div className="sticky top-0 z-10 border-b border-rex-border bg-rex-bg/95 backdrop-blur-sm">
          <div className="flex min-h-[60px] flex-wrap items-center gap-3 px-4 lg:px-8">
            <span className="hidden text-xs text-rex-text-muted sm:inline">本机工作区</span>
            <span className="hidden text-rex-text-muted sm:inline">/</span>
            <span className="text-xs font-medium">{findView(view).title}</span>
            <div className="ml-auto flex min-w-0 max-w-full items-center gap-2 text-xs">
              <Folder size={14} className="hidden text-rex-text-muted sm:block" />
              <label htmlFor="console-workspace" className="sr-only">
                选择工作区
              </label>
              {/* 中文注释：选完直接换 URL 让**服务端重新采集**。旧版只 setProjectId，
                  而没有任何东西读它：切项目后下面所有数字还是服务自己那个根，
                  界面在暗示它在按选择过滤。现在 key 是唯一回传量，路径不由页面交出。 */}
              <Select
                size="sm"
                aria-label="选择工作区"
                value={selectedWorkspaceKey}
                onValueChange={selectWorkspace}
                className="max-w-[170px] sm:max-w-[220px]"
                options={facts.projects.map((item) => ({
                  value: item.key,
                  label: `${item.name}${item.current ? ' · 当前' : item.missing ? ' · 路径已消失' : ''} · ${item.memos} 条记忆`,
                }))}
              />
              <ChevronDown size={12} className="hidden" />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-rex-border bg-rex-panel/70 px-4 py-2 text-[11px] leading-5 text-rex-text-muted lg:px-8">
            <span className="inline-flex items-center gap-1.5 font-medium text-rex-text-body">
              <Clock size={13} />
              <CollectionAge generatedAt={facts.generatedAt} />
            </span>
            <span>
              工作区 <strong className="font-medium text-rex-text-body">{project?.name ?? facts.rootDir}</strong>
              {' · '}
              <span className="break-all">{facts.rootDir}</span>
              {' · 一次采集 '}
              {facts.totalMs}ms · {facts.services.rows.length} 个服务配置实例 ·{' '}
              {facts.memories.length < (project?.memos ?? 0) ? (
                <>读回 {facts.memories.length} / 共 {project?.memos} 条记忆</>
              ) : (
                <>{project?.memos ?? facts.memories.length} 条记忆</>
              )}
            </span>
            {facts.sessionsAudit?.ok === true && facts.sessionsAudit.withoutMeta.length > 0 && (
              <span title={facts.sessionsAudit.withoutMeta.join(', ')}>
                会话 {facts.sessions.length} 条（另有 {facts.sessionsAudit.withoutMeta.length} 个目录没有会话元数据，未计入）
              </span>
            )}
            {!selection.ok && (
              <span className="inline-flex items-center gap-1.5 text-rex-danger">
                <AlertTriangle size={13} />
                你选的工作区没被采用（{selection.reason}）：{selection.detail}
              </span>
            )}
            {facts.degraded.length > 0 && (
              <span className="inline-flex items-center gap-1.5 text-rex-danger">
                <AlertTriangle size={13} />
                {facts.degraded.length} 项没读到（见下方原因）
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
              title="每一次改变，都有迹可循。"
              description="下面列出的是这台机器上真实存在过的会话记录，来自 .aios/context-db/sessions。"
            />
            <Panel className="divide-y divide-rex-border px-5">
              {facts.sessions.map((session) => (
                <div key={session.sessionId} className="flex gap-3 py-5">
                  <span className="mt-0.5 size-2 shrink-0 rounded-full bg-rex-text-muted" />
                  <div>
                    <h2 className="text-sm font-medium">{session.goal || session.sessionId}</h2>
                    <p className="mt-2 text-xs leading-5 text-rex-text-muted">
                      {session.project} · {session.agent} · {session.status} · {session.events} 条事件
                    </p>
                  </div>
                  <span className="ml-auto shrink-0 text-[10px] text-rex-text-muted">{session.updatedAt}</span>
                </div>
              ))}
              {facts.sessions.length === 0 && (
                <p className="py-6 text-sm text-rex-text-muted">这台机器上还没有会话记录。</p>
              )}
            </Panel>
          </div>
          {pluginViews.map((item) => (
            <PluginPanelView key={item.id} item={item} active={view === item.id} />
          ))}
          <div hidden={view !== 'settings'}>
            <Heading
              eyebrow="PREFERENCES"
              title="让工作空间，顺手一点。"
              description="主题只在当前页面生效。模型分配在「模型路由 → 模型分配」中管理。"
            />
            <Panel className="max-w-2xl p-6">
              <h2 className="mb-4 text-sm font-semibold">界面外观</h2>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { id: 'light', name: '明亮', icon: Sun },
                  { id: 'dark', name: '深色', icon: Moon },
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
                <h2 className="mb-2 text-sm font-semibold">当前配置目标</h2>
                <p className="text-xs leading-6 text-rex-text-muted">
                  {project?.name}
                  <br />
                  {facts.rootDir}
                </p>
                <p className="mt-3 flex items-center gap-2 text-xs leading-5 text-rex-text-muted">
                  <ShieldCheck size={15} className="shrink-0" />
                  项目记忆的阅读范围由记忆页单独选择。
                </p>
              </div>
              <Button variant="outline" className="mt-6" onClick={() => window.location.reload()}>
                重新采集本机状态
              </Button>
            </Panel>
          </div>
        </main>
        <footer className="mx-4 mt-2 flex flex-wrap items-center gap-2 border-t border-rex-border py-4 text-[10px] leading-5 text-rex-text-muted lg:mx-8">
          <LockHint />
          <span className="ml-auto">
            读取项：{facts.timings.map((entry) => `${entry.item} ${entry.ms}ms`).join(' · ')}
          </span>
        </footer>
      </div>
    </div>
  );
}

/** 插件声明式 panel 的通用渲染：展示来源插件、贡献内容与安装提示。 */
function PluginPanelView({ item, active }: { item: PluginView; active: boolean }) {
  return (
    <div hidden={!active}>
      <Heading
        eyebrow="PLUGIN PANEL"
        title={item.title}
        description={`由插件 ${item.source} 贡献的页面（声明式 panel）。`}
      />
      <Panel className="max-w-2xl p-6">
        <h2 className="text-sm font-semibold">这个页面来自插件</h2>
        <p className="mt-2 text-xs leading-6 text-rex-text-muted">
          插件 <code className="rounded bg-rex-panel px-1 py-0.5 font-rex-mono">{item.source}</code> 在 manifest 的
          <code className="mx-1 rounded bg-rex-panel px-1 py-0.5 font-rex-mono">contributes.panels</code>
          中声明了这个页面，路由 <code className="rounded bg-rex-panel px-1 py-0.5 font-rex-mono">{item.href}</code>。
        </p>
        <div className="mt-4 rounded-xl border border-rex-border bg-rex-panel/40 p-4 text-xs leading-6">
          <p className="font-medium">声明式贡献已生效</p>
          <p className="mt-1 text-rex-text-muted">
            这个页面本身就是证据：你能点开它、看到来源，说明 <code>plugins.json → manifest → 导航注入</code> 这条链路已经跑通。
            禁用或卸载插件后，这个入口会消失。
          </p>
        </div>
      </Panel>
    </div>
  );
}

function LockHint() {
  return (
    <span className="flex items-center gap-1.5">
      <ShieldCheck size={12} />
      本机状态只读采集；配置写入、接入与程序更新均需明确确认
    </span>
  );
}
