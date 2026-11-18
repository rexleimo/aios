'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Waypoints } from 'lucide-react';
import { Badge, Empty, ErrorState, Loading, Panel, SmallTitle } from '../console-ui';
import type { ModelOption } from './intent-routing-section';

interface IntentFallback {
  stage: string;
  reason: string;
  originalIntentId?: string;
  originalModelId?: string;
  fallbackModelId: string;
}
interface DecisionEntry {
  at?: string;
  clientId?: string;
  role?: string;
  modelId?: string;
  intent?: string;
  status?: number;
  error?: string;
  latencyMs?: number;
  intentFallback?: IntentFallback;
}
interface DecisionsPayload {
  exists: boolean;
  path: string;
  counters: { requests: number; errors: number; autoRouted: number };
  byModel: Record<string, number>;
  byClient: Record<string, number>;
  recent: DecisionEntry[];
}

const POLL_MS = 2500;
const MAX_NODES = 6;
const NODE_H = 36;
const PITCH = 48;
const PAD_Y = 16;
const CLIENT_X = 8;
const CLIENT_W = 140;
const HUB_X = 258;
const HUB_W = 124;
const MODEL_X = 492;
const MODEL_W = 140;

// 按显示宽度截断：CJK 计 2 单位、其余 1 单位，预算 16 单位 ≈ 91px，避免和右侧计数重叠。
const truncate = (text: string, budget = 16) => {
  let used = 0;
  let out = '';
  for (const ch of text) {
    const width = /[⺀-鿿＀-￯]/.test(ch) ? 2 : 1;
    if (used + width > budget) return `${out}…`;
    used += width;
    out += ch;
  }
  return text;
};

function topNodes(counts: Record<string, number>, labelOf: (id: string) => string) {
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const head = sorted.slice(0, MAX_NODES).map(([id, count]) => ({ id, label: labelOf(id), count, aggregate: false }));
  const tail = sorted.slice(MAX_NODES);
  if (tail.length) head.push({ id: '__rest', label: `其他 ${tail.length} 项`, count: tail.reduce((sum, [, c]) => sum + c, 0), aggregate: true });
  return head;
}

export function RoutingGraph({ models }: { models: ModelOption[] }) {
  const [data, setData] = useState<DecisionsPayload | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [pollError, setPollError] = useState('');
  const [reducedMotion, setReducedMotion] = useState(false);
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await fetch(`/api/model-routing/decisions?limit=20`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || body.error || '读取失败');
      setData(body as DecisionsPayload);
      setStatus('ready');
      setPollError('');
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      setMessage(text);
      setPollError(text);
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

  if (status === 'loading') {
    return <Loading label="正在读取路由决策…" />;
  }
  if (status === 'error' || !data) {
    return <ErrorState message={`没读到路由决策：${message || '未知原因'}`} onRetry={() => { setStatus('loading'); void load(); }} />;
  }

  const labelOf = (id: string) => models.find((m) => m.id === id)?.label || id;
  const clients = topNodes(data.byClient, (id) => id);
  const modelNodes = topNodes(data.byModel, labelOf);
  const rows = Math.max(clients.length, modelNodes.length, 1);
  const height = PAD_Y * 2 + rows * PITCH - (PITCH - NODE_H);
  const hubY = height / 2;
  const centerY = (index: number) => PAD_Y + index * PITCH + NODE_H / 2;
  // 最近 20 条里出现过的客户端/模型 → 对应连线流动动画；其余静态。
  const activeClients = new Set(data.recent.map((entry) => entry.clientId || ''));
  const activeModels = new Set(data.recent.map((entry) => entry.modelId || ''));
  const empty = !data.exists || data.counters.requests === 0;

  return (
    <Panel className="p-6">
      <SmallTitle
        action={pollError
          ? <Badge tone="warn">刷新失败</Badge>
          : <Badge tone="ok"><span className="size-1.5 rounded-full bg-rex-green motion-safe:animate-pulse" />实时</Badge>}
      >
        实时路由图
      </SmallTitle>

      {empty ? (
        <Empty icon={Waypoints} title="网关还没处理过请求">
          启动网关 <code className="rounded bg-rex-panel px-1 py-0.5">aios model-router gateway</code> 并用
          <code className="rounded bg-rex-panel px-1 py-0.5">connect</code> 接入客户端后，这里会实时画出 客户端 → 网关 → 模型 的路由。
          <span className="mt-2 block text-[11px] text-rex-text-soft">决策日志：{data.path}</span>
        </Empty>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-3 gap-3">
            <Stat label="请求" value={data.counters.requests} />
            <Stat label="意图自动路由" value={data.counters.autoRouted} tone="text-rex-cyan" />
            <Stat label="错误" value={data.counters.errors} tone={data.counters.errors > 0 ? 'text-rex-danger' : undefined} />
          </div>

          <svg viewBox={`0 0 640 ${height}`} role="img" aria-label="实时路由图：客户端经本地网关路由到模型" className="w-full">
            {clients.map((node, index) => (
              <Wire key={`c-${node.id}`} x1={CLIENT_X + CLIENT_W} y1={centerY(index)} x2={HUB_X} y2={hubY}
                count={node.count} active={!node.aggregate && activeClients.has(node.id)} reducedMotion={reducedMotion} />
            ))}
            {modelNodes.map((node, index) => (
              <Wire key={`m-${node.id}`} x1={HUB_X + HUB_W} y1={hubY} x2={MODEL_X} y2={centerY(index)}
                count={node.count} active={!node.aggregate && activeModels.has(node.id)} reducedMotion={reducedMotion} />
            ))}
            {clients.map((node, index) => (
              <Node key={`cn-${node.id}`} x={CLIENT_X} y={centerY(index) - NODE_H / 2} w={CLIENT_W} label={node.label} count={node.count} />
            ))}
            {modelNodes.map((node, index) => (
              <Node key={`mn-${node.id}`} x={MODEL_X} y={centerY(index) - NODE_H / 2} w={MODEL_W} label={node.label} count={node.count} />
            ))}
            <g>
              <rect x={HUB_X} y={hubY - 22} width={HUB_W} height={44} rx={10}
                fill="var(--color-rex-cyan)" fillOpacity={0.08} stroke="var(--color-rex-cyan)" strokeOpacity={0.5} />
              <text x={HUB_X + HUB_W / 2} y={hubY - 2} textAnchor="middle" fontSize={12} fontWeight={600} fill="var(--color-rex-text)">本地网关</text>
              <text x={HUB_X + HUB_W / 2} y={hubY + 13} textAnchor="middle" fontSize={10} fill="var(--color-rex-text-muted)">127.0.0.1</text>
            </g>
          </svg>

          <div className="mt-4">
            <h3 className="mb-1 text-xs font-semibold text-rex-text-muted">
              最近决策{data.recent.some((entry) => entry.intentFallback) ? ` · 回落 ${data.recent.filter((entry) => entry.intentFallback).length}` : ''}
            </h3>
            <ul>
              {data.recent.slice(0, 8).map((entry, index) => {
                const ok = !entry.error && Number(entry.status) < 400;
                return (
                  <li key={`${entry.at}-${index}`} className="flex items-center gap-2 border-b border-rex-border/60 py-1.5 text-xs">
                    <span className="shrink-0 tabular-nums text-rex-text-soft">
                      {entry.at ? new Date(entry.at).toLocaleTimeString('zh-CN', { hour12: false }) : '—'}
                    </span>
                    <Badge tone="neutral">{entry.clientId || '未知客户端'}</Badge>
                    {entry.intent
                      ? <Badge tone="info">意图 {entry.intent}</Badge>
                      : entry.role
                        ? <Badge tone="violet">{entry.role}</Badge>
                        : <Badge tone="neutral">默认</Badge>}
                     {entry.intentFallback && (
                       <Badge tone="danger" className="cursor-help" title={[
                         entry.intentFallback.reason,
                         entry.intentFallback.originalIntentId
                           ? `原意图: ${entry.intentFallback.originalIntentId} → ${entry.intentFallback.originalModelId}`
                           : '',
                         `实际执行: ${entry.intentFallback.fallbackModelId}`,
                       ].filter(Boolean).join('\n')}>
                         回落 ({entry.intentFallback.stage})
                       </Badge>
                     )}
                    <span className="flex-1 truncate" title={entry.modelId}>{labelOf(entry.modelId || '') || '—'}</span>
                    <span className={`shrink-0 tabular-nums ${ok ? 'text-rex-green' : 'text-rex-danger'}`}>{entry.status ?? '—'}</span>
                    <span className="shrink-0 tabular-nums text-rex-text-soft">{Number(entry.latencyMs) || 0}ms</span>
                  </li>
                );
              })}
            </ul>
          </div>
          <p className="mt-3 text-[11px] text-rex-text-soft">每 2.5 秒刷新 · 只统计真实请求 · 决策日志 {data.path}</p>
        </>
      )}
    </Panel>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-xl border border-rex-border bg-rex-panel/40 px-3 py-2.5">
      <div className={`font-rex-display text-2xl font-semibold tabular-nums ${tone || 'text-rex-text'}`}>{value}</div>
      <div className="text-[11px] text-rex-text-muted">{label}</div>
    </div>
  );
}

function Wire({ x1, y1, x2, y2, count, active, reducedMotion }: {
  x1: number; y1: number; x2: number; y2: number; count: number; active: boolean; reducedMotion: boolean;
}) {
  const bend = Math.max(40, (x2 - x1) / 2);
  const path = `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;
  return (
    <path d={path} fill="none"
      stroke={active ? 'var(--color-rex-cyan)' : 'var(--color-rex-text-soft)'}
      strokeOpacity={active ? 0.9 : 0.45}
      strokeWidth={1 + Math.min(count, 10) * 0.3}
      strokeDasharray={active ? '5 5' : undefined}
    >
      {active && !reducedMotion && (
        <animate attributeName="stroke-dashoffset" from="0" to="-10" dur="0.7s" repeatCount="indefinite" />
      )}
    </path>
  );
}

function Node({ x, y, w, label, count }: { x: number; y: number; w: number; label: string; count: number }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={NODE_H} rx={10}
        fill="var(--color-rex-panel)" stroke="var(--color-rex-border)" />
      <text x={x + 10} y={y + NODE_H / 2 + 4} fontSize={11} fill="var(--color-rex-text)">{truncate(label)}</text>
      <text x={x + w - 10} y={y + NODE_H / 2 + 4} textAnchor="end" fontSize={10} fill="var(--color-rex-text-muted)">{count}</text>
    </g>
  );
}