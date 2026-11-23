'use client';

import { t } from '../../../i18n/t.mjs';
// 实时路由图：客户端 → 本机 AIOS 网关 → 上游(magpie) → 模型。
// 真实链路：请求先打到我们自己的网关(127.0.0.1:8686)，网关经上游供应商 magpie(3425)
// 落到具体模型。magpie 在图中作为网关下方的一行上游标注，不占据中心节点。
// 每次请求沿 client→model 落一条决策，一个数据光点沿路径飞过去并点亮目标模型。
// 数据源是网关真实决策日志(/api/model-routing/decisions)，不编造请求；新记录到达即飞，
// 也可点「重放」把最近若干条真实决策依次飞一遍（历史 trace 回放，仍是真实数据）。
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bot, Cpu, Network, RotateCcw, Waypoints, Zap } from 'lucide-react';
import { Badge, Button, Empty, ErrorState, Loading, Panel, SmallTitle } from '../console-ui';
import type { ModelOption } from './intent-routing-section';

interface DecisionEntry {
  recordKey?: string;
  at?: string;
  clientId?: string;
  modelId?: string;
  upstreamModel?: string;
  providerId?: string;
}
interface DecisionsPayload {
  exists: boolean;
  path: string;
  counters: { requests: number; errors: number; autoRouted: number };
  byModel: Record<string, number>;
  byClient: Record<string, number>;
  recent: DecisionEntry[];
}

interface AgentNode { id: string; label: string; sub: string; count: number }
interface ProviderNode { id: string; label: string; model: string; count: number }

const POLL_MS = 2500;
const MAX_AGENTS = 4;
const MAX_PROVIDERS = 6;
const NODE_H = 42;
const PITCH = 58;
const PAD_Y = 26;
const AGENT_X = 16; const AGENT_W = 150;
const HUB_X = 306; const HUB_W = 132;
const PROVIDER_X = 572; const PROVIDER_W = 170;
const SVG_W = 758;
const HILITE = 'var(--color-rex-cyan)';

const CLIENT_LABELS: Record<string, string> = {
  claude: 'Claude Code', codex: 'Codex', gemini: 'Gemini CLI', opencode: 'OpenCode',
  workbuddy: 'WorkBuddy', grok: 'Grok', pi: 'Pi', qoder: 'Qoder', zcode: 'ZCode', cursor: 'Cursor',
};
const agentLabel = (id: string) => CLIENT_LABELS[id] || id || t("默认客户端");

/** upstreamModel「provider/model」→ 真实 provider 名；没有就用 providerId。 */
function providerOf(entry: DecisionEntry): string {
  const up = String(entry.upstreamModel || '');
  if (up.includes('/')) return up.split('/')[0] || 'unknown';
  return String(entry.providerId || 'unknown');
}
function modelShort(entry: DecisionEntry): string {
  const up = String(entry.upstreamModel || '');
  if (up.includes('/')) return up.split('/').slice(1).join('/');
  return String(entry.modelId || '');
}

/** 从真实决策聚合出 agent / provider 节点（纯函数，不碰 React）。 */
function buildGraph(recent: DecisionEntry[]) {
  const agents = new Map<string, number>();
  const providers = new Map<string, { count: number; model: string }>();
  for (const entry of recent) {
    const client = String(entry.clientId || '');
    agents.set(client, (agents.get(client) || 0) + 1);
    const provider = providerOf(entry);
    const prev = providers.get(provider);
    providers.set(provider, { count: (prev?.count || 0) + 1, model: prev?.model || modelShort(entry) });
  }
  const agentNodes: AgentNode[] = [...agents.entries()]
    .sort((a, b) => b[1] - a[1]).slice(0, MAX_AGENTS)
    .map(([id, count]) => ({ id, label: agentLabel(id), sub: id ? 'client' : 'default', count }));
  const providerNodes: ProviderNode[] = [...providers.entries()]
    .sort((a, b) => b[1].count - a[1].count).slice(0, MAX_PROVIDERS)
    .map(([id, v]) => ({ id, label: id, model: v.model, count: v.count }));
  return { agentNodes, providerNodes };
}

const truncate = (text: string, budget = 18) => {
  let used = 0; let out = '';
  for (const ch of text) {
    const width = /[⺀-鿿＀-￯]/.test(ch) ? 2 : 1;
    if (used + width > budget) return `${out}…`;
    used += width; out += ch;
  }
  return text;
};

export function RoutingGraph({ models }: { models: ModelOption[] }) {
  const [data, setData] = useState<DecisionsPayload | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [pollError, setPollError] = useState('');
  const [reducedMotion, setReducedMotion] = useState(false);
  const [replay, setReplay] = useState<{ entries: DecisionEntry[]; idx: number } | null>(null);
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await fetch('/api/model-routing/decisions?limit=60');
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || body.error || t("读取失败"));
      setData(body as DecisionsPayload);
      setStatus('ready');
      setPollError('');
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      setMessage(text); setPollError(text);
      setStatus((prev) => (prev === 'loading' ? 'error' : prev));
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(query.matches);
    const onChange = (event: MediaQueryListEvent) => setReducedMotion(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  // 重放：把最近若干条真实决策依次飞一遍，每条停留到动画结束再进下一条，末尾回到实时。
  useEffect(() => {
    if (!replay) return;
    const delay = replay.idx >= replay.entries.length - 1 ? 1500 : 1350;
    const timer = setTimeout(() => {
      if (replay.idx >= replay.entries.length - 1) setReplay(null);
      else setReplay({ ...replay, idx: replay.idx + 1 });
    }, delay);
    return () => clearTimeout(timer);
  }, [replay]);

  const graph = useMemo(() => buildGraph(data?.recent || []), [data]);

  if (status === 'loading') return <Loading label={t("正在读取路由决策…")} />;
  if (status === 'error' || !data) {
    return <ErrorState message={t("没读到路由决策：{value0}", { value0: message || t("未知原因") })} onRetry={() => { setStatus('loading'); void load(); }} />;
  }

  const { agentNodes, providerNodes } = graph;
  const rows = Math.max(agentNodes.length, providerNodes.length, 1);
  const height = PAD_Y * 2 + rows * PITCH - (PITCH - NODE_H);
  const hubY = height / 2;
  const agentY = (index: number) => PAD_Y + index * PITCH + NODE_H / 2;
  const providerY = (index: number) => PAD_Y + index * PITCH + NODE_H / 2;
  const empty = !data.exists || data.counters.requests === 0;

  const current = replay ? replay.entries[replay.idx] : data.recent[0];
  const flightKey = current ? `${current.recordKey || current.at || 'x'}:${replay ? replay.idx : 'live'}` : '';
  const currentAgentIdx = current ? agentNodes.findIndex((n) => n.id === String(current.clientId || '')) : -1;
  const currentProviderIdx = current ? providerNodes.findIndex((n) => n.id === providerOf(current)) : -1;
  const canFly = Boolean(current && !reducedMotion && currentAgentIdx >= 0 && currentProviderIdx >= 0);

  let flightPath = '';
  if (canFly && current) {
    const ay = agentY(currentAgentIdx);
    const py = providerY(currentProviderIdx);
    const bendA = (HUB_X - (AGENT_X + AGENT_W)) / 2;
    const bendB = (PROVIDER_X - (HUB_X + HUB_W)) / 2;
    const ax = AGENT_X + AGENT_W;
    const hx2 = HUB_X + HUB_W;
    flightPath = `M ${ax} ${ay} C ${ax + bendA} ${ay}, ${HUB_X - bendA} ${hubY}, ${HUB_X} ${hubY} `
      + `L ${hx2} ${hubY} C ${hx2 + bendB} ${hubY}, ${PROVIDER_X - bendB} ${py}, ${PROVIDER_X} ${py}`;
  }

  return (
    <Panel className="p-6">
      <SmallTitle
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => {
              if (data.recent.length) setReplay({ entries: data.recent.slice(0, 6), idx: 0 });
            }} disabled={!data.recent.length || Boolean(replay)}>
              <RotateCcw size={13} />  {t("重放路由")}
            </Button>
            {pollError
              ? <Badge tone="warn">{t("刷新失败")}</Badge>
              : <Badge tone="ok"><span className="size-1.5 rounded-full bg-rex-green motion-safe:animate-pulse" />{t("实时 · 网关正在做的决策")}</Badge>}
          </div>
        }
      >
        
        {t("路由")}
      </SmallTitle>

      {empty ? (
        <Empty icon={Waypoints} title={t("网关还没处理过请求")}>
          
          {t("启动网关并用 connect 接入客户端后，这里会实时画出 客户端 → 本机网关 → 模型 的路由；数据光点随每次请求飞行。")}
          <span className="mt-2 block text-[11px] text-rex-text-soft">{t("决策日志：")}{data.path}</span>
        </Empty>
      ) : (
        <>
          <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-semibold text-rex-text">
              
              {t("难题给强模型，简单的给便宜模型")}
              <span className="ml-2 text-xs font-normal text-rex-text-muted">{t("· 路由组 · 启用")} {models.length}  {t("个")}</span>
            </h2>
          </div>
          <p className="mb-4 text-xs leading-6 text-rex-text-muted">
            
            {t("请求先到本机网关，再经上游 magpie 落到模型。有余量的账号优先、失败后休息的排最后；每次请求实时显示落点。")}
          </p>

          <div className="mb-3 grid grid-cols-3 gap-3">
            <Stat icon={Zap} label={t("请求")} value={data.counters.requests} />
            <Stat icon={Cpu} label={t("意图自动路由")} value={data.counters.autoRouted} tone="text-rex-cyan" />
            <Stat icon={Bot} label={t("错误")} value={data.counters.errors} tone={data.counters.errors > 0 ? 'text-rex-danger' : undefined} />
          </div>

          <svg viewBox={`0 0 ${SVG_W} ${height}`} role="img" aria-label={t("实时路由图：客户端经本机 AIOS 网关与上游 magpie 路由到模型")} className="w-full">
            {/* 底层静态连线 */}
            {agentNodes.map((node, index) => (
              <Wire key={`ca-${node.id}`} x1={AGENT_X + AGENT_W} y1={agentY(index)} x2={HUB_X} y2={hubY}
                count={node.count} />
            ))}
            {providerNodes.map((node, index) => (
              <Wire key={`pp-${node.id}`} x1={HUB_X + HUB_W} y1={hubY} x2={PROVIDER_X} y2={providerY(index)}
                count={node.count} />
            ))}

            {/* 飞行光路画在节点下层，不穿过节点文字 */}
            {canFly && (
              <path key={`trail-${flightKey}`} d={flightPath} fill="none" stroke={HILITE}
                strokeWidth={1.8} strokeDasharray="5 8" strokeOpacity={0.5} pointerEvents="none">
                <animate attributeName="stroke-dashoffset" from="0" to="-26" dur="0.6s" repeatCount="indefinite" />
              </path>
            )}

            {/* 客户端节点 */}
            {agentNodes.map((node, index) => (
              <Node key={`an-${node.id}`} x={AGENT_X} y={agentY(index) - NODE_H / 2} w={AGENT_W}
                icon={<Bot size={15} color={HILITE} />} label={node.label} sub={node.sub} count={node.count} />
            ))}
            {/* 模型节点 */}
            {providerNodes.map((node, index) => (
              <Node key={`pn-${node.id}`} x={PROVIDER_X} y={providerY(index) - NODE_H / 2} w={PROVIDER_W}
                icon={<Cpu size={15} color={HILITE} />} label={node.label} sub={truncate(node.model)} count={node.count}
                highlight={index === currentProviderIdx && Boolean(current) && !reducedMotion} />
            ))}

            {/* 本机 AIOS 网关（中性图标；magpie 只是它的上游供应商） */}
            <GatewayHub y={hubY} />

            {/* 飞行数据光点 —— 最后绘制，浮在节点之上，不会被卡片遮挡 */}
            {canFly && (
              <g key={flightKey} pointerEvents="none">
                <circle r={10} fill={HILITE} fillOpacity={0.18} />
                <circle r={4.5} fill={HILITE} />
                <animateMotion dur="1.3s" fill="freeze" path={flightPath} />
              </g>
            )}
          </svg>

          <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] text-rex-text-muted">
            <Legend icon={<Bot size={12} color={HILITE} />} text={t("客户端")} />
            <Legend icon={<Network size={12} color={HILITE} />} text={t("本机网关 127.0.0.1:8686")} />
            <Legend icon={<Cpu size={12} color={HILITE} />} text={t("模型（上游 magpie）")} />
          </div>
          <p className="mt-3 text-[11px] text-rex-text-soft">
            
            {t("每")} {POLL_MS / 1000}{t("s 读一次真实决策日志 · 光点沿本次请求的路由飞行 · 完整记录在「请求记录」·")} {data.path}
          </p>
        </>
      )}
    </Panel>
  );
}

function Stat({ icon: Icon, label, value, tone }: { icon: typeof Zap; label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-xl border border-rex-border bg-rex-panel/40 px-3 py-2.5">
      <div className={`flex items-center gap-1.5 font-rex-display text-2xl font-semibold tabular-nums ${tone || 'text-rex-text'}`}>
        <Icon size={15} className="opacity-70" />{value}
      </div>
      <div className="text-[11px] text-rex-text-muted">{label}</div>
    </div>
  );
}

function Legend({ icon, text }: { icon: React.ReactNode; text: string }) {
  return <span className="inline-flex items-center gap-1.5">{icon}{text}</span>;
}

function GatewayHub({ y }: { y: number }) {
  return (
    <g>
      <rect x={HUB_X} y={y - 46} width={HUB_W} height={92} rx={14}
        fill="var(--color-rex-panel)" stroke={HILITE} strokeOpacity={0.55} strokeWidth={1.4} />
      <g transform={`translate(${HUB_X + HUB_W / 2 - 13},${y - 40})`}>
        <Network size={26} color={HILITE} />
      </g>
      <text x={HUB_X + HUB_W / 2} y={y - 2} textAnchor="middle" fontSize={13} fontWeight={700} fill="var(--color-rex-text)">{t("AIOS 网关")}</text>
      <text x={HUB_X + HUB_W / 2} y={y + 15} textAnchor="middle" fontSize={10.5} fill="var(--color-rex-text-muted)">127.0.0.1:8686</text>
      <line x1={HUB_X + 26} y1={y + 24} x2={HUB_X + HUB_W - 26} y2={y + 24} stroke="var(--color-rex-border)" strokeWidth={1} />
      <text x={HUB_X + HUB_W / 2} y={y + 38} textAnchor="middle" fontSize={9.5} fill="var(--color-rex-text-soft)">{t("上游 · magpie")}</text>
    </g>
  );
}

function Wire({ x1, y1, x2, y2, count }: {
  x1: number; y1: number; x2: number; y2: number; count: number;
}) {
  const bend = Math.max(40, (x2 - x1) / 2);
  const path = `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;
  return (
    <path d={path} fill="none" stroke="var(--color-rex-border)" strokeOpacity={0.85}
      strokeWidth={1.1 + Math.min(count, 10) * 0.22} />
  );
}

function Node({ x, y, w, icon, label, sub, count, highlight }: {
  x: number; y: number; w: number; icon: React.ReactNode; label: string; sub: string; count: number; highlight?: boolean;
}) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={NODE_H} rx={11}
        fill="var(--color-rex-panel)"
        stroke={highlight ? HILITE : 'var(--color-rex-border)'}
        strokeWidth={highlight ? 2 : 1}>
        {highlight && <animate attributeName="stroke-opacity" values="1;0.4;1" dur="1.1s" repeatCount="indefinite" />}
      </rect>
      <g transform={`translate(${x + 10},${y + NODE_H / 2 - 8})`}>{icon}</g>
      <text x={x + 31} y={y + NODE_H / 2 - 1} fontSize={11.5} fill="var(--color-rex-text)" fontWeight={600}>{truncate(label, 13)}</text>
      <text x={x + 31} y={y + NODE_H / 2 + 12} fontSize={9.5} fill="var(--color-rex-text-muted)">{truncate(sub, 15)}</text>
      <text x={x + w - 10} y={y + NODE_H / 2 + 4} textAnchor="end" fontSize={10} fill="var(--color-rex-text-muted)">{count}</text>
    </g>
  );
}
