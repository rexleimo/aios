'use client';

import { ArrowRight, BookOpen, Check, CircleAlert, Folder, Layers3, ShieldCheck } from 'lucide-react';
import { clientLabel, landingTokenLabel, LANDING_TOKEN_EXPLANATION, type ConsoleFacts, type FactClient } from '../../lib/console-facts';
import type { ViewId } from '../../lib/console-navigation';
import { Badge, Button, Heading, Modal, Panel, SmallTitle, TextLink } from './console-ui';

/** 一个客户端最坏的那条落点状态——首屏展示的是「需不需要你处理」，不是平均值。 */
function worstLanding(client: FactClient): { token: string; reason: string } {
  const order = ['landing-error', 'landing-unregistered', 'landing-unverified', 'landing-verified'];
  for (const token of order) {
    const hit = client.landingTokens.find((entry) => entry.token === token);
    if (hit) return { token: hit.token, reason: hit.reason };
  }
  return { token: client.declaredOnly ? 'landing-unregistered' : '', reason: '' };
}

function LandingBadge({ client }: { client: FactClient }) {
  const { token } = worstLanding(client);
  if (!token) return <Badge tone="neutral">未读到落点</Badge>;
  const { label, tone } = landingTokenLabel(token);
  return <Badge tone={tone}>{label}</Badge>;
}

export function HomeWorkspace({
  facts,
  navigate,
  openTool,
  openMemory,
}: {
  facts: ConsoleFacts;
  navigate: (view: ViewId) => void;
  openTool: (id: string) => void;
  openMemory: (id: string) => void;
}) {
  const installed = facts.clients.filter((client) => client.installed);
  const declaredOnly = facts.clients.filter((client) => client.declaredOnly);
  const services = facts.services;
  const memories = facts.memories.slice(0, 2);
  const sessions = facts.sessions.slice(0, 3);
  return (
    <>
      <Heading
        eyebrow="本机真实状态"
        title="你的 AI 工具，在这台机器上到底是什么样。"
        description="客户端、配置落点与服务数量都来自这台机器的读取结果；读不到的地方写「没读到 + 为什么」，不写示例。"
        actions={
          <Button onClick={() => navigate('tools')} variant="outline">
            <Folder size={15} />
            管理 AI 工具
          </Button>
        }
      />
      {/* 三条事实分开陈列（路线图 P1-4）：声明支持谁、本机有什么、读没读到——它们各自有出处。 */}
      <div className="mb-7 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border border-rex-border bg-rex-panel/50 px-5 py-3 text-xs text-rex-text-muted">
        <span className="flex items-center gap-2">
          <span className="size-1.5 rounded-full bg-rex-green" />
          {installed.length} 个客户端在本机有配置落点
        </span>
        <span className="flex items-center gap-2">
          <Layers3 size={14} />
          {services.rows.length} 个服务配置实例
        </span>
        <span className="flex items-center gap-2">
          <ShieldCheck size={14} />
          落点验证状态单独记录
        </span>
        <span className="ml-auto text-rex-text-muted">
          声明支持 {facts.declaredClientCount} 个 · 采集 {facts.totalMs}ms
        </span>
      </div>
      {facts.degraded.length > 0 && (
        <Panel className="mb-7 border-rex-danger/40 p-5">
          <SmallTitle action={<Badge tone="danger">{facts.degraded.length} 项</Badge>}>有东西没读到</SmallTitle>
          <ul className="space-y-2 text-xs leading-5 text-rex-text-muted">
            {facts.degraded.map((entry) => (
              <li key={entry.item}>
                <span className="font-medium text-rex-text">{entry.item}</span>：{entry.error}
              </li>
            ))}
          </ul>
        </Panel>
      )}
      <SmallTitle action={<TextLink onClick={() => navigate('tools')}>查看全部工具</TextLink>}>你的 AI 工具</SmallTitle>
      <div className="mb-7 grid gap-4 lg:grid-cols-3">
        {installed.map((client) => {
          const label = clientLabel(client.clientId);
          return (
            <Panel key={client.clientId} className="group p-5">
              <div className="mb-5 flex items-start justify-between">
                <span className="grid size-11 place-items-center rounded-xl border border-rex-border bg-rex-panel font-rex-display text-xl font-semibold">
                  {label.monogram}
                </span>
                <LandingBadge client={client} />
              </div>
              <h3 className="text-base font-semibold tracking-tight">{label.name}</h3>
              <p className="mt-1 text-xs text-rex-text-muted">{client.scopes.map((scope) => scope.scope).join(' · ')}</p>
              <div className="mt-6 flex items-center justify-between border-t border-rex-border pt-4">
                <span className="text-xs text-rex-text-muted">{client.services} 个 MCP 服务</span>
                <button
                  onClick={() => openTool(client.clientId)}
                  className="flex items-center gap-2 rounded-md text-xs font-medium hover:text-rex-cyan focus-visible:outline-2 focus-visible:outline-rex-cyan"
                >
                  管理
                  <ArrowRight size={14} />
                </button>
              </div>
            </Panel>
          );
        })}
        {installed.length === 0 && (
          <Panel className="p-5 lg:col-span-3">
            {/* 空状态不是错误状态（路线图 P1-3）：给路径，不给红字，也不给示例。 */}
            <SmallTitle>这台机器上还没有受支持客户端的配置落点</SmallTitle>
            <p className="text-xs leading-6 text-rex-text-muted">
              装好任意一个客户端并在它里面配置过一次 MCP，再回来刷新就能看到。
              {declaredOnly.length > 0 && `已声明支持但本机没有落点的：${declaredOnly.map((client) => client.clientId).join('、')}。`}
            </p>
          </Panel>
        )}
      </div>
      <div className="mb-7 grid items-start gap-5 xl:grid-cols-[1.1fr_1fr]">
        <Panel className="p-5">
          <SmallTitle action={<Badge tone={facts.issues.length > 0 ? 'warn' : 'neutral'}>{facts.issues.length} 项</Badge>}>
            需要你处理
          </SmallTitle>
          {facts.issues.length === 0 ? (
            <div className="flex gap-3 rounded-xl bg-rex-panel/60 p-4">
              <Check size={19} className="mt-0.5 shrink-0 text-rex-green" />
              <div>
                <h3 className="text-sm font-medium">这次采集没有数出需要处理的问题</h3>
                <p className="mt-1 text-xs leading-5 text-rex-text-muted">
                  判据来自 <code>aios mcp list --json</code> 的落点状态与归属冲突计数，不是「一切都好」的承诺。
                </p>
              </div>
            </div>
          ) : (
            <ul className="divide-y divide-rex-border">
              {facts.issues.slice(0, 3).map((issue, index) => (
                <li key={`${issue.kind}:${issue.clientId}:${issue.server ?? ''}:${index}`} className="flex gap-3 py-3 first:pt-0">
                  <CircleAlert size={19} className="mt-0.5 shrink-0 text-rex-danger" />
                  <div>
                    <h3 className="text-sm font-medium">
                      {issue.clientId ? `${clientLabel(issue.clientId).name}` : '本机配置'} · {issue.kind}
                    </h3>
                    <p className="mt-1 text-xs leading-5 text-rex-text-muted">{issue.detail}</p>
                    <p className="mt-1 text-[10px] text-rex-text-muted">出处：{issue.source}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3">
            <TextLink onClick={() => navigate('mcp')}>查看服务与落点</TextLink>
          </div>
        </Panel>
        <Panel className="p-5">
          <SmallTitle action={<TextLink onClick={() => navigate('memory')}>打开记忆</TextLink>}>
            项目留下的经验
          </SmallTitle>
          {memories.length === 0 ? (
            <p className="text-xs leading-6 text-rex-text-muted">
              {facts.degraded.some((entry) => entry.item === 'memo')
                ? `记忆没读到：${facts.degraded.find((entry) => entry.item === 'memo')?.error}`
                : '这台机器上还没有 memo 记录。'}
            </p>
          ) : (
            memories.map((memory) => (
              <button
                key={memory.id}
                onClick={() => openMemory(memory.id)}
                className="flex w-full gap-3 border-b border-rex-border py-3 text-left last:border-0 focus-visible:outline-2 focus-visible:outline-rex-cyan"
              >
                <BookOpen size={16} className="mt-1 shrink-0 text-rex-text-muted" />
                <span>
                  <span className="block text-sm font-medium line-clamp-1">{memory.excerpt}</span>
                  <span className="mt-1 block text-xs text-rex-text-muted">
                    {memory.space} · {memory.ts}
                    {memory.claimStatus ? ` · ${memory.claimStatus}` : ''}
                  </span>
                </span>
              </button>
            ))
          )}
        </Panel>
      </div>
      <SmallTitle action={<TextLink onClick={() => navigate('activity')}>全部记录</TextLink>}>最近的会话</SmallTitle>
      <Panel className="divide-y divide-rex-border px-5">
        {sessions.map((session) => (
          <div key={session.sessionId} className="flex items-center gap-3 py-3.5">
            <span className="rounded-full bg-rex-panel p-1.5 text-rex-text-muted">
              {session.status === 'running' ? <CircleAlert size={14} /> : <Check size={14} />}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm">{session.goal || session.sessionId}</p>
              <p className="mt-0.5 text-xs text-rex-text-muted">
                {session.project} · {session.agent} · {session.updatedAt}
              </p>
            </div>
          </div>
        ))}
        {sessions.length === 0 && <p className="py-4 text-xs text-rex-text-muted">还没有会话记录。</p>}
      </Panel>
      {declaredOnly.length > 0 && (
        <p className="mt-6 text-[11px] leading-5 text-rex-text-muted">
          另外 {declaredOnly.length} 个客户端由产品声明支持、但本机没有配置落点：
          {declaredOnly.map((client) => clientLabel(client.clientId).name).join('、')}。
          这不代表它们有问题，只代表这台机器上没有它们的痕迹。
          {facts.declaredOnlyReason ? `（声明表读取情况：${facts.declaredOnlyReason}）` : ''}
        </p>
      )}
    </>
  );
}

export function ToolsWorkspace({
  facts,
  onMcp,
  selectedId,
  onSelect,
}: {
  facts: ConsoleFacts;
  onMcp: () => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const selected = facts.clients.find((client) => client.clientId === selectedId);
  return (
    <>
      <Heading
        eyebrow="AI TOOLS"
        title="先看清工具在本机的落点，再谈服务。"
        description="每一行都是这台机器上读出来的结果：配置文件在哪、几个服务、落点验证到哪一步。"
      />
      <Panel className="overflow-hidden">
        {facts.clients.map((client) => {
          const label = clientLabel(client.clientId);
          return (
            <div key={client.clientId} className="flex flex-wrap items-center gap-4 border-b border-rex-border p-5 last:border-0">
              <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-rex-panel font-rex-display text-xl font-semibold">
                {label.monogram}
              </span>
              <div className="min-w-40 flex-1">
                <h2 className="font-semibold">{label.name}</h2>
                <p className="mt-1 text-xs break-all text-rex-text-muted">
                  {client.installed
                    ? client.configFiles[0] || '有落点但没有文件路径'
                    : '本机没有配置落点（仅产品声明支持）'}
                </p>
              </div>
              <span className="text-xs text-rex-text-muted">{client.services} 个服务</span>
              <LandingBadge client={client} />
              <Button variant="outline" onClick={() => onSelect(client.clientId)}>
                查看工具详情
                <ArrowRight size={14} />
              </Button>
            </div>
          );
        })}
      </Panel>
      <Modal
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) onSelect(null);
        }}
        title={`${selected ? clientLabel(selected.clientId).name : 'AI 工具'} · 工具详情`}
        description="配置读取、服务数量与落点验证是三条不同的事实，下面分开列出。"
      >
        {selected && (
          <div className="space-y-5">
            <dl className="grid grid-cols-[90px_1fr] gap-3 text-sm">
              <dt className="text-rex-text-muted">配置落点</dt>
              <dd>{selected.installed ? `${selected.scopes.length} 个（${selected.scopes.map((s) => s.scope).join('、')}）` : '本机没有'}</dd>
              <dt className="text-rex-text-muted">配置文件</dt>
              <dd className="break-all">{selected.configFiles.join('\n') || '无'}</dd>
              <dt className="text-rex-text-muted">服务数量</dt>
              <dd>{selected.services} 个配置实例</dd>
              <dt className="text-rex-text-muted">落点验证</dt>
              <dd>
                <ul className="space-y-1">
                  {selected.landingTokens.map((entry) => (
                    <li key={entry.scope}>
                      {entry.scope}：{landingTokenLabel(entry.token).label}
                      <span className="block text-[11px] text-rex-text-muted">
                        {entry.reason || LANDING_TOKEN_EXPLANATION[entry.token] || ''}
                      </span>
                    </li>
                  ))}
                  {selected.landingTokens.length === 0 && <li>没有可显示的落点状态。</li>}
                </ul>
              </dd>
              <dt className="text-rex-text-muted">连接测试</dt>
              <dd>未做——当前界面只读配置，不启动服务进程。</dd>
            </dl>
            <div className="rounded-xl bg-rex-panel p-4 text-xs leading-6 text-rex-text-muted">
              读取配置成功，只说明文件可读取。服务连接结果需要独立测试后才能确认。
            </div>
            <Button
              onClick={() => {
                onSelect(null);
                onMcp();
              }}
            >
              打开 MCP 服务工作区
            </Button>
          </div>
        )}
      </Modal>
    </>
  );
}
