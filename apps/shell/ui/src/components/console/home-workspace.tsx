'use client';

import { ArrowRight, BookOpen, Check, CircleAlert, Folder, Layers3, Plug, ShieldCheck, Terminal } from 'lucide-react';
import { TOOLS, MEMORIES, type DemoActivity, type ViewId } from './demo-data';
import { Badge, Button, Heading, Modal, Panel, SmallTitle, TextLink } from './console-ui';

export function HomeWorkspace({
  navigate,
  activities,
  recovered,
  openTool,
  openMemory,
}: {
  navigate: (view: ViewId) => void;
  activities: DemoActivity[];
  recovered: boolean;
  openTool: (id: string) => void;
  openMemory: (id: string) => void;
}) {
  return (
    <>
      <Heading
        eyebrow="YOUR LOCAL WORKSPACE"
        title="把工具管好，把精力留给创作。"
        description="你的 AI 工具、项目记忆与扩展，在一个地方井然有序。"
        actions={
          <Button onClick={() => navigate('tools')} variant="outline">
            <Terminal size={15} />
            管理 AI 工具
          </Button>
        }
      />
      <div className="mb-7 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border border-rex-border bg-rex-panel/50 px-5 py-3 text-xs text-rex-text-muted">
        <span className="flex items-center gap-2">
          <span className="size-1.5 rounded-full bg-rex-green" />
          {TOOLS.length} 个工具配置可读取
        </span>
        <span className="flex items-center gap-2">
          <Layers3 size={14} />9 个服务配置实例
        </span>
        <span className="flex items-center gap-2">
          <ShieldCheck size={14} />
          连接测试状态单独记录
        </span>
        <span className="ml-auto text-rex-text-muted">示例环境</span>
      </div>
      <SmallTitle action={<TextLink onClick={() => navigate('tools')}>查看全部工具</TextLink>}>你的 AI 工具</SmallTitle>
      <div className="mb-7 grid gap-4 lg:grid-cols-3">
        {TOOLS.map((tool) => (
          <Panel key={tool.id} className="group p-5">
            <div className="mb-5 flex items-start justify-between">
              <span className="grid size-11 place-items-center rounded-xl border border-rex-border bg-rex-panel font-rex-display text-xl font-semibold">
                {tool.monogram}
              </span>
              <Badge tone={tool.id === 'codex' && recovered ? 'ok' : tool.tone}>
                {tool.id === 'codex' && recovered ? '配置已读取' : tool.status}
              </Badge>
            </div>
            <h3 className="text-base font-semibold tracking-tight">{tool.name}</h3>
            <p className="mt-1 text-xs text-rex-text-muted">{tool.description}</p>
            <div className="mt-6 flex items-center justify-between border-t border-rex-border pt-4">
              <span className="text-xs text-rex-text-muted">{tool.services} 个 MCP 服务</span>
              <button
                onClick={() => openTool(tool.id)}
                className="flex items-center gap-2 rounded-md text-xs font-medium hover:text-rex-cyan focus-visible:outline-2 focus-visible:outline-rex-cyan"
              >
                管理
                <ArrowRight size={14} />
              </button>
            </div>
          </Panel>
        ))}
      </div>
      <div className="mb-7 grid items-start gap-5 xl:grid-cols-[1.1fr_1fr]">
        <Panel className="p-5">
          <SmallTitle action={<Badge tone={recovered ? 'ok' : 'warn'}>{recovered ? '已处理' : '1 项'}</Badge>}>
            需要你处理
          </SmallTitle>
          <div className="flex gap-3 rounded-xl bg-rex-panel/60 p-4">
            {recovered ? (
              <Check size={19} className="mt-0.5 shrink-0 text-rex-green" />
            ) : (
              <CircleAlert size={19} className="mt-0.5 shrink-0 text-rex-danger" />
            )}
            <div>
              <h3 className="text-sm font-medium">{recovered ? '浏览器服务已恢复' : 'Codex 的浏览器服务启动失败'}</h3>
              <p className="mt-1 text-xs leading-5 text-rex-text-muted">
                {recovered ? '本次原型模拟测试通过，可在活动记录中查看。' : '启动命令未找到。其他服务配置不受影响。'}
              </p>
              <div className="mt-3">
                <TextLink onClick={() => navigate('mcp')}>查看原因与恢复方式</TextLink>
              </div>
            </div>
          </div>
        </Panel>
        <Panel className="p-5">
          <SmallTitle action={<TextLink onClick={() => navigate('memory')}>打开记忆</TextLink>}>
            项目留下的经验
          </SmallTitle>
          {MEMORIES.slice(0, 2).map((memory) => (
            <button
              key={memory.id}
              onClick={() => openMemory(memory.id)}
              className="flex w-full gap-3 border-b border-rex-border py-3 text-left last:border-0 focus-visible:outline-2 focus-visible:outline-rex-cyan"
            >
              <BookOpen size={16} className="mt-1 shrink-0 text-rex-text-muted" />
              <span>
                <span className="block text-sm font-medium">{memory.title}</span>
                <span className="mt-1 block text-xs text-rex-text-muted">harness-cli · {memory.topic}</span>
              </span>
            </button>
          ))}
        </Panel>
      </div>
      <SmallTitle action={<TextLink onClick={() => navigate('activity')}>全部记录</TextLink>}>最近操作</SmallTitle>
      <Panel className="divide-y divide-rex-border px-5">
        {activities.slice(0, 3).map((activity) => (
          <div key={activity.id} className="flex items-center gap-3 py-3.5">
            <span className="rounded-full bg-rex-panel p-1.5 text-rex-text-muted">
              {activity.tone === 'warn' ? <CircleAlert size={14} /> : <Check size={14} />}
            </span>
            <div>
              <p className="text-sm">{activity.title}</p>
              <p className="mt-0.5 text-xs text-rex-text-muted">{activity.detail}</p>
            </div>
          </div>
        ))}
      </Panel>
    </>
  );
}

export function ToolsWorkspace({
  onMcp,
  selectedId,
  onSelect,
  recovered,
}: {
  onMcp: () => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  recovered: boolean;
}) {
  const selected = TOOLS.find((tool) => tool.id === selectedId);
  return (
    <>
      <Heading
        eyebrow="AI TOOLS"
        title="为你的工具，接好每一种能力。"
        description="先选择工具，再看它使用的服务、配置范围和需要处理的问题。"
      />
      <Panel className="overflow-hidden">
        {TOOLS.map((tool) => (
          <div key={tool.id} className="flex flex-wrap items-center gap-4 border-b border-rex-border p-5 last:border-0">
            <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-rex-panel font-rex-display text-xl font-semibold">
              {tool.monogram}
            </span>
            <div className="min-w-40 flex-1">
              <h2 className="font-semibold">{tool.name}</h2>
              <p className="mt-1 text-xs text-rex-text-muted">用户级配置 · {tool.services} 个服务</p>
            </div>
            <Badge tone={tool.id === 'codex' && recovered ? 'ok' : tool.tone}>
              {tool.id === 'codex' && recovered ? '配置已读取' : tool.status}
            </Badge>
            <Button variant="outline" onClick={() => onSelect(tool.id)}>
              查看工具详情
              <ArrowRight size={14} />
            </Button>
          </div>
        ))}
      </Panel>
      <div className="mt-5 flex gap-3 rounded-xl bg-rex-panel p-4 text-sm text-rex-text-muted">
        <Folder size={18} className="shrink-0" />
        项目级能力在配置时选择生效项目；工具的用户级设置适用于该用户的所有项目。
      </div>
      <Modal
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) onSelect(null);
        }}
        title={`${selected?.name ?? 'AI 工具'} · 工具详情`}
        description="工具的安装、配置读取和服务连接是不同的状态。以下为受控示例。"
      >
        {selected && (
          <div className="space-y-5">
            <dl className="grid grid-cols-[90px_1fr] gap-3 text-sm">
              <dt className="text-rex-text-muted">安装状态</dt>
              <dd>已检测到 · 示例</dd>
              <dt className="text-rex-text-muted">配置读取</dt>
              <dd>可读取</dd>
              <dt className="text-rex-text-muted">配置范围</dt>
              <dd>当前用户</dd>
              <dt className="text-rex-text-muted">MCP 服务</dt>
              <dd>{selected.services} 个配置实例</dd>
              <dt className="text-rex-text-muted">连接测试</dt>
              <dd>
                {selected.id === 'codex'
                  ? recovered
                    ? '浏览器服务模拟测试通过'
                    : '浏览器服务模拟测试失败'
                  : '尚未测试'}
              </dd>
            </dl>
            <div className="rounded-xl bg-rex-panel p-4 text-xs leading-6 text-rex-text-muted">
              读取配置成功，只说明文件可读取。服务连接结果需要独立测试后才能确认。
            </div>
            <details className="text-xs text-rex-text-muted">
              <summary className="cursor-pointer">配置文件（示例）</summary>
              <code className="mt-3 block rounded-lg bg-rex-panel p-3">
                {selected.id === 'claude'
                  ? '~/.claude.json'
                  : selected.id === 'codex'
                    ? '~/.codex/config.toml'
                    : '~/.gemini/settings.json'}
              </code>
            </details>
            <Button
              onClick={() => {
                onSelect(null);
                onMcp();
              }}
            >
              <Plug size={14} />
              打开 MCP 服务工作区
            </Button>
          </div>
        )}
      </Modal>
    </>
  );
}
