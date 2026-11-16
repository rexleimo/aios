'use client';

import { ArrowRight } from 'lucide-react';
import { clientLabel, landingTokenLabel, LANDING_TOKEN_EXPLANATION, type ConsoleFacts, type FactClient } from '../../lib/console-facts';
import type { ViewId } from '../../lib/console-navigation';
import { Badge, Button, Heading, Modal, Panel, SmallTitle } from './console-ui';
import { AgentOverview } from './model-routing/agent-overview';

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
  active,
}: {
  facts: ConsoleFacts;
  navigate: (view: ViewId) => void;
  active: boolean;
}) {
  return (
    <>
      <Heading
        eyebrow="本机客户端 · 路由观测"
        title="最近请求与配置默认，分开看清。"
        description="查看客户端配置落点、最近请求的模型与时间，以及实现角色的配置默认。计数来自当前保留的网关日志，不代表客户端在线或网关运行状态。"
      />
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
      <AgentOverview clients={facts.clients} issues={facts.issues} active={active} navigate={navigate} />
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
