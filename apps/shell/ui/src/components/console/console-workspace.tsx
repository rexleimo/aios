'use client';

import { useEffect, useState } from 'react';
import {
  Activity,
  ArrowUpRight,
  BookOpen,
  Box,
  ChevronDown,
  Command,
  FlaskConical,
  Folder,
  Home,
  Moon,
  Plug,
  Settings2,
  ShieldCheck,
  Sun,
  Terminal,
} from 'lucide-react';
import { CONSOLE_VIEWS, PRIMARY_VIEWS, viewForPath, type ViewId } from '../../lib/console-navigation';
import { INITIAL_ACTIVITY, PROJECTS, type DemoActivity, type DemoProject } from './demo-data';
import { HomeWorkspace, ToolsWorkspace } from './home-workspace';
import { MemoryWorkspace } from './memory-workspace';
import { McpWorkspace } from './mcp-workspace';
import { Button, Heading, Panel } from './console-ui';

const ICONS = { home: Home, tools: Terminal, mcp: Plug, memory: BookOpen, activity: Activity, settings: Settings2 };
const NAV = PRIMARY_VIEWS.map(item => ({ ...item, icon: ICONS[item.id] }));

export function ConsoleWorkspace({ initialView }: { initialView: ViewId }) {
  const [view, setView] = useState<ViewId>(initialView);
  function navigate(next: ViewId) {
    if (window.location.pathname !== CONSOLE_VIEWS[next].href) {
      window.history.pushState(null, '', CONSOLE_VIEWS[next].href);
    }
    setView(next);
  }
  useEffect(() => {
    const onBackForward = () => setView(viewForPath(window.location.pathname) ?? 'home');
    window.addEventListener('popstate', onBackForward);
    return () => window.removeEventListener('popstate', onBackForward);
  }, []);
  const [projects, setProjects] = useState<DemoProject[]>(PROJECTS);
  const [projectId, setProjectId] = useState('harness');
  const [activities, setActivities] = useState<DemoActivity[]>(INITIAL_ACTIVITY);
  const [theme, setTheme] = useState('light');
  const [recovered, setRecovered] = useState(false);
  const [selectedToolId, setSelectedToolId] = useState<string | null>(null);
  const [memoryTarget, setMemoryTarget] = useState({ id: '', nonce: 0 });
  const project = projects.find((item) => item.id === projectId) ?? projects[0];
  function record(activity: DemoActivity) {
    setActivities((previous) => [activity, ...previous]);
  }
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
          <span className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-rex-text text-rex-bg">
            <Command size={19} strokeWidth={1.8} />
          </span>
          <span className="hidden md:block">
            <span className="block font-rex-display text-lg leading-5 font-semibold tracking-tight">AIOS</span>
            <span className="text-[10px] tracking-wide text-rex-text-muted">你的本机 AI 工作空间</span>
          </span>
        </div>
        <div className="mx-3 hidden rounded-lg border border-rex-border bg-rex-bg px-3 py-2.5 md:block">
          <div className="flex items-center gap-2 text-xs font-medium">
            <Box size={14} className="text-rex-text-muted" />
            个人工作空间
          </div>
          <p className="mt-1 pl-[22px] text-[10px] text-rex-text-muted">本机管理 · 示例环境</p>
        </div>
        <nav aria-label="主导航" className="mt-7 space-y-1 px-3">
          {NAV.map((item) => (
            <button
              key={item.id}
              title={item.label}
              aria-label={item.label}
              onClick={() => navigate(item.id)}
              aria-current={view === item.id ? 'page' : undefined}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-rex-cyan ${view === item.id ? 'bg-rex-bg font-medium text-rex-text shadow-sm ring-1 ring-rex-border' : 'text-rex-text-muted hover:bg-rex-panel-strong/60 hover:text-rex-text'}`}
            >
              <item.icon
                size={17}
                strokeWidth={1.7}
                className={`shrink-0 ${view === item.id ? 'text-rex-cyan' : ''}`}
              />
              <span className="hidden md:inline">{item.label}</span>
              {item.id === 'mcp' && !recovered && (
                <span className="ml-auto hidden size-4 items-center justify-center rounded bg-rex-orange/10 text-[10px] text-rex-text-body md:flex">
                  1
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="mx-4 mt-auto mb-5 hidden rounded-xl border border-rex-border p-3.5 md:block">
          <BookOpen size={17} className="mb-2 text-rex-cyan" />
          <p className="text-xs font-medium">让经验留在项目里</p>
          <p className="mt-1 text-[11px] leading-5 text-rex-text-muted">浏览与理解记忆，从选择一个项目开始。</p>
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
            <span className="hidden text-xs text-rex-text-muted sm:inline">个人工作空间</span>
            <span className="hidden text-rex-text-muted sm:inline">/</span>
            <span className="text-xs font-medium">{CONSOLE_VIEWS[view].title}</span>
            <div className="ml-auto flex items-center gap-2 text-xs">
              <Folder size={14} className="hidden text-rex-text-muted sm:block" />
              <label htmlFor="configuration-project" className="sr-only">
                配置目标项目
              </label>
              <select
                id="configuration-project"
                value={projectId}
                onChange={(event) => setProjectId(event.target.value)}
                className="max-w-[150px] rounded-md bg-transparent py-1.5 text-xs focus-visible:outline-2 focus-visible:outline-rex-cyan sm:max-w-[180px]"
              >
                {projects.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                    {projects.filter((candidate) => candidate.name === item.name).length > 1 ? ` · ${item.path}` : ''}
                  </option>
                ))}
              </select>
              <ChevronDown size={12} className="hidden" />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-rex-border bg-rex-panel/70 px-4 py-2 text-[11px] leading-5 text-rex-text-muted lg:px-8">
            <span className="inline-flex items-center gap-1.5 font-medium text-rex-text-body">
              <FlaskConical size={13} />
              交互原型
            </span>
            <span>示例数据 · 不读取私人文件 · 不修改真实配置</span>
            <span className="ml-auto hidden sm:inline">刷新可重置体验</span>
          </div>
        </div>
        <main id="console-content" className="mx-auto max-w-[1440px] px-4 py-7 lg:px-8 lg:py-9" tabIndex={-1}>
          <div hidden={view !== 'home'}>
            <HomeWorkspace
              navigate={navigate}
              activities={activities}
              recovered={recovered}
              openTool={(id) => {
                setSelectedToolId(id);
                navigate('tools');
              }}
              openMemory={(id) => {
                setMemoryTarget((previous) => ({ id, nonce: previous.nonce + 1 }));
                navigate('memory');
              }}
            />
          </div>
          <div hidden={view !== 'tools'}>
            <ToolsWorkspace
              onMcp={() => navigate('mcp')}
              selectedId={selectedToolId}
              onSelect={setSelectedToolId}
              recovered={recovered}
            />
          </div>
          <div hidden={view !== 'mcp'}>
            <McpWorkspace
              project={project}
              record={record}
              recovered={recovered}
              onRecovered={() => setRecovered(true)}
            />
          </div>
          <div hidden={view !== 'memory'}>
            <MemoryWorkspace
              target={memoryTarget}
              projects={projects}
              onAddProject={(item) => setProjects((previous) => [...previous, item])}
              record={record}
            />
          </div>
          <div hidden={view !== 'activity'}>
            <Heading
              eyebrow="ACTIVITY"
              title="每一次改变，都有迹可循。"
              description="这是本次原型体验里的操作记录。刷新页面后恢复初始示例。"
            />
            <Panel className="divide-y divide-rex-border px-5">
              {activities.map((activity) => (
                <div key={activity.id} className="flex gap-3 py-5">
                  <span className="mt-0.5 size-2 shrink-0 rounded-full bg-rex-text-muted" />
                  <div>
                    <h2 className="text-sm font-medium">{activity.title}</h2>
                    <p className="mt-2 text-xs leading-5 text-rex-text-muted">{activity.detail}</p>
                  </div>
                  <span className="ml-auto shrink-0 text-[10px] text-rex-text-muted">示例记录</span>
                </div>
              ))}
            </Panel>
          </div>
          <div hidden={view !== 'settings'}>
            <Heading
              eyebrow="PREFERENCES"
              title="让工作空间，顺手一点。"
              description="原型设置只在当前页面生效，不写入你的应用配置。"
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
                  {project.name}
                  <br />
                  {project.path}
                </p>
                <p className="mt-3 flex items-center gap-2 text-xs leading-5 text-rex-text-muted">
                  <ShieldCheck size={15} className="shrink-0" />
                  项目记忆的阅读范围由记忆页单独选择。
                </p>
              </div>
              <Button variant="outline" className="mt-6" onClick={() => window.location.reload()}>
                重置原型体验
              </Button>
            </Panel>
          </div>
        </main>
        <footer className="mx-4 mt-2 flex flex-wrap items-center gap-2 border-t border-rex-border py-4 text-[10px] leading-5 text-rex-text-muted lg:mx-8">
          <LockHint />
          <span className="ml-auto">AIOS Console · 产品交互预览</span>
        </footer>
      </div>
    </div>
  );
}
function LockHint() {
  return (
    <span className="flex items-center gap-1.5">
      <ShieldCheck size={12} />
      原型仅在页面内运行，模拟结果不代表真实工具状态
    </span>
  );
}
