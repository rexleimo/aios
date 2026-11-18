'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, FileClock, RefreshCw, Search } from 'lucide-react';
import { clientLabel } from '../../../lib/console-facts';
import {
  Badge,
  Button,
  Empty,
  ErrorState,
  Input,
  Loading,
  Modal,
  Panel,
  Select,
  SmallTitle,
} from '../console-ui';
import type { ModelOption } from '../model-routing/intent-routing-section';
import { ROLE_LABEL } from '../model-routing/labels';

interface IntentFallback {
  stage: string;
  reason: string;
  originalIntentId?: string;
  originalModelId?: string;
  fallbackModelId: string;
}
interface Decision {
  recordKey: string;
  at?: string;
  clientId?: string;
  modelId?: string;
  role?: string;
  intent?: string;
  status?: number;
  error?: string;
  latencyMs?: number;
  usage?: { input_tokens?: number; output_tokens?: number };
  intentFallback?: IntentFallback;
}
interface DecisionLog {
  counters: { requests: number; errors: number; autoRouted: number };
  recent: Decision[];
  byModel: Record<string, number>;
}

function timeLabel(at?: string) {
  const date = new Date(at || '');
  return Number.isNaN(date.getTime()) ? '未记录时间' : date.toLocaleString('zh-CN', { hour12: false });
}
const isError = (entry: Decision) => Boolean(entry.error) || Number(entry.status) >= 400;

export function RequestHistory({ active, models }: { active: boolean; models: ModelOption[] }) {
  const [log, setLog] = useState<DecisionLog | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [result, setResult] = useState('all');
  const [selected, setSelected] = useState<Decision | null>(null);
  // 每个请求用自己的 controller；abort 只影响它自己，不会锁住后续加载。
  // StrictMode 的 mount→cleanup→remount 会 abort 第一次请求，第二次必须能立即重发，
  // 不能依赖一个共享的 busy 锁（那会让 remount 的 load 被跳过，直到 5s 轮询才恢复）。
  const inFlight = useRef<Set<AbortController>>(new Set());
  const load = useCallback(async () => {
    const controller = new AbortController();
    inFlight.current.add(controller);
    setRefreshing(true);
    try {
      const response = await fetch('/api/model-routing/decisions?limit=100', { signal: controller.signal });
      const body = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok) throw new Error(body.detail || body.error || '读取失败');
      setLog(body);
      setError('');
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      inFlight.current.delete(controller);
      if (inFlight.current.size === 0) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    void load();
    const timer = window.setInterval(() => {
      if (!document.hidden) void load();
    }, 5000);
    return () => {
      for (const controller of inFlight.current) controller.abort();
      inFlight.current.clear();
      window.clearInterval(timer);
    };
  }, [active, load]);

  if (!log)
    return error ? (
      <ErrorState message={`请求记录读取失败：${error}`} onRetry={() => void load()} />
    ) : (
      <Loading label="正在读取请求记录…" />
    );

  const labelOf = (id?: string) => models.find((model) => model.id === id)?.label || id || '未记录模型';
  const rows = log.recent.filter((entry) => {
    const matchesResult = result === 'all' || (result === 'errors' ? isError(entry) : !isError(entry));
    const text = [entry.clientId, entry.modelId, labelOf(entry.modelId), entry.role, entry.intent]
      .join(' ')
      .toLowerCase();
    return matchesResult && text.includes(query.trim().toLowerCase());
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">每一次路由，都有据可查。</h2>
          <p className="mt-1 text-xs leading-6 text-rex-text-muted">
            只读网关决策日志。统计覆盖当前保留的日志，不代表网关运行状态，也不是账单。
          </p>
        </div>
        <Button size="sm" variant="outline" disabled={refreshing} onClick={() => void load()}>
          <RefreshCw size={14} className={refreshing ? 'animate-spin motion-reduce:animate-none' : ''} />
          刷新记录
        </Button>
      </div>
      {error && <ErrorState message={`刷新失败，保留上次快照：${error}`} onRetry={() => void load()} />}
      <Panel className="grid grid-cols-1 divide-y divide-rex-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {[
          { label: '日志内请求', value: log.counters.requests },
          { label: '意图路由', value: log.counters.autoRouted },
          { label: '失败请求', value: log.counters.errors },
        ].map((item) => (
          <div key={item.label} className="p-5">
            <p className="text-xs text-rex-text-muted">{item.label}</p>
            <p className="mt-3 font-rex-display text-3xl font-semibold tabular-nums tracking-tight">
              {item.value.toLocaleString()}
            </p>
          </div>
        ))}
      </Panel>
      <Panel className="overflow-hidden">
        <div className="border-b border-rex-border p-5">
          <SmallTitle action={<Badge tone="neutral">最近 {log.recent.length} 条</Badge>}>请求明细</SmallTitle>
          <div className="flex flex-wrap gap-3">
            <div className="relative min-w-0 flex-1 basis-48">
              <Search size={14} className="pointer-events-none absolute top-3 left-3 text-rex-text-muted" />
              <Input
                aria-label="搜索请求"
                className="pl-9"
                placeholder="搜索客户端、模型或意图…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <Select
              aria-label="筛选请求结果"
              value={result}
              onValueChange={setResult}
              className="w-32"
              options={[
                { value: 'all', label: '全部结果' },
                { value: 'success', label: '未记录错误' },
                { value: 'errors', label: '仅失败' },
              ]}
            />
          </div>
          <p className="mt-3 text-[11px] text-rex-text-muted">
            每 5 秒更新 · 筛选仅作用于最近 100 条，不改变上方日志总计。
          </p>
        </div>
        {rows.length === 0 ? (
          <Empty icon={FileClock} title={log.recent.length ? '没有符合条件的请求' : '还没有请求记录'}>
            {log.recent.length
              ? '换个关键词或选择全部结果。'
              : '启动网关并接入客户端后，实际经过网关的请求会出现在这里。'}
          </Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-xs">
              <thead className="bg-rex-panel/60 text-rex-text-muted">
                <tr>
                  {['时间 / 客户端', '实际模型', '路由依据', '结果', '耗时', '详情'].map((title) => (
                    <th key={title} className="px-5 py-3 font-medium">
                      {title}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-rex-border">
                {rows.map((entry, index) => (
                  <tr key={entry.recordKey} className="hover:bg-rex-panel/40">
                    <td className="px-5 py-4">
                      <span className="block font-medium">
                        {entry.clientId ? clientLabel(entry.clientId).name : '未标记客户端'}
                      </span>
                      <span className="mt-1 block whitespace-nowrap text-[10px] text-rex-text-muted">
                        {timeLabel(entry.at)}
                      </span>
                    </td>
                    <td className="max-w-64 px-5 py-4">
                      <span className="block break-all font-medium">{labelOf(entry.modelId)}</span>
                      <span className="mt-1 block break-all font-rex-mono text-[10px] text-rex-text-muted">
                        {entry.modelId}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-rex-text-muted">
                      <span className="block">
                        {entry.intent
                          ? `意图 · ${entry.intent}`
                          : entry.role
                            ? ROLE_LABEL[entry.role] || entry.role
                            : '默认路由'}
                      </span>
                      {entry.intentFallback && (
                        <Badge tone="danger" className="mt-1 cursor-help" title={[
                          entry.intentFallback.reason,
                          entry.intentFallback.originalIntentId
                            ? `原意图: ${entry.intentFallback.originalIntentId} → ${entry.intentFallback.originalModelId}`
                            : '',
                          `实际执行: ${entry.intentFallback.fallbackModelId}`,
                        ].filter(Boolean).join('\n')}>
                          回落 ({entry.intentFallback.stage})
                        </Badge>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <Badge tone={isError(entry) ? 'danger' : 'neutral'}>
                        {isError(entry) ? '失败' : entry.status ? `${entry.status}` : '未记录状态'}
                      </Badge>
                    </td>
                    <td className="px-5 py-4 font-rex-mono whitespace-nowrap text-rex-text-muted">
                      {typeof entry.latencyMs === 'number' ? `${entry.latencyMs} ms` : '未记录'}
                    </td>
                    <td className="px-5 py-4">
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`查看请求 ${index + 1}`}
                        onClick={() => setSelected(entry)}
                      >
                        <ArrowRight size={15} />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      {Object.keys(log.byModel).length > 0 && (
        <Panel className="p-5">
          <SmallTitle>模型请求分布</SmallTitle>
          <div className="grid gap-4 md:grid-cols-2">
            {Object.entries(log.byModel)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 8)
              .map(([model, count]) => (
                <div key={model}>
                  <div className="mb-2 flex items-center justify-between gap-3 text-xs">
                    <span className="truncate">{labelOf(model)}</span>
                    <span className="shrink-0 font-rex-mono text-rex-text-muted">{count} 次</span>
                  </div>
                  <div className="h-1 rounded-full bg-rex-panel-strong">
                    <div
                      className="h-full rounded-full bg-rex-cyan/70"
                      style={{ width: `${Math.max(1, (count / Math.max(1, log.counters.requests)) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
          </div>
        </Panel>
      )}
      <Modal
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        title="请求详情"
        description="仅展示决策元数据，不展示请求正文、密钥或响应内容。"
      >
        {selected && (
          <dl className="grid grid-cols-[90px_minmax(0,1fr)] gap-x-3 gap-y-4 text-xs">
            <dt className="text-rex-text-muted">记录时间</dt>
            <dd>{timeLabel(selected.at)}</dd>
            <dt className="text-rex-text-muted">实际模型</dt>
            <dd className="break-all">{selected.modelId || '未记录'}</dd>
            <dt className="text-rex-text-muted">路由依据</dt>
            <dd>{selected.intent || selected.role || '默认路由'}</dd>
            {selected.intentFallback && (
              <>
                <dt className="text-rex-text-muted">回落原因</dt>
                <dd className="break-all text-rex-danger">
                  {selected.intentFallback.reason}
                  {selected.intentFallback.originalIntentId
                    ? `（原意图 ${selected.intentFallback.originalIntentId} → ${selected.intentFallback.originalModelId}）`
                    : ''}
                </dd>
              </>
            )}
            <dt className="text-rex-text-muted">输入 tokens</dt>
            <dd>{selected.usage?.input_tokens ?? '未记录'}</dd>
            <dt className="text-rex-text-muted">输出 tokens</dt>
            <dd>{selected.usage?.output_tokens ?? '未记录'}</dd>
            <dt className="text-rex-text-muted">错误</dt>
            <dd className="break-all">{selected.error || '未记录错误'}</dd>
          </dl>
        )}
      </Modal>
    </div>
  );
}
