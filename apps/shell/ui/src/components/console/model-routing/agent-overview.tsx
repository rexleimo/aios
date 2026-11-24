'use client';

import { t } from '../../../i18n/t.mjs';
// Client facts, request history and configured defaults are separate observations.
// Decision logs cannot establish whether a client or gateway process is running.
import { useCallback, useEffect, useRef, useState } from 'react';
import { CircleAlert, Waypoints } from 'lucide-react';
import { clientLabel, NON_CLIENT_HOSTS, type FactClient, type FactIssue } from '../../../lib/console-facts';
import type { NavId } from '../../../lib/console-navigation';
import { Badge, Empty, ErrorState, Panel, SmallTitle, TextLink } from '../console-ui';
import { ClientLogo } from '../clients/client-logo';

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
  intentFallback?: IntentFallback;
}
interface DecisionsPayload {
  exists: boolean;
  counters: { requests: number; errors: number; autoRouted: number };
  byClient: Record<string, number>;
  recent: DecisionEntry[];
}
interface RoutingConfig {
  models: { id: string; label: string }[];
  auto: { role: string; effectiveModelId: string }[];
  matrix: { default: Record<string, string>; clients: Record<string, Record<string, string>> };
}

const POLL_MS = 2500;
// Only this role's default is shown; other roles and intent routes can differ.
const HEADLINE_ROLE = 'implementer';

export function AgentOverview({
  clients,
  issues,
  active,
  navigate,
  compact = false,
}: {
  clients: FactClient[];
  issues: FactIssue[];
  active: boolean;
  navigate: (view: NavId) => void;
  compact?: boolean;
}) {
  // 拦截矩阵的宿主槽位（aios-harness/generic-mcp）不是可接入客户端，不在此展示。
  const visibleClients = clients.filter((client) => !NON_CLIENT_HOSTS.has(client.clientId));
  const [decisions, setDecisions] = useState<DecisionsPayload | null>(null);
  const [config, setConfig] = useState<RoutingConfig | null>(null);
  const [decisionsError, setDecisionsError] = useState('');
  const polling = useRef<AbortController | null>(null);
  const inFlight = useRef<AbortSignal | null>(null);

  const loadDecisions = useCallback(async () => {
    const signal = polling.current?.signal;
    if (!signal || signal.aborted || inFlight.current === signal) return;
    inFlight.current = signal;
    try {
      const res = await fetch('/api/model-routing/decisions?limit=50', { signal, cache: 'no-store' });
      const body = await res.json();
      if (signal.aborted) return;
      if (!res.ok) throw new Error(body.detail || body.error || t("读取失败"));
      setDecisions(body as DecisionsPayload);
      setDecisionsError('');
    } catch (error) {
      // Preserve both the last snapshot and the error until a successful refresh.
      if (!signal.aborted) setDecisionsError(error instanceof Error ? error.message : String(error));
    } finally {
      if (inFlight.current === signal) inFlight.current = null;
    }
  }, []);

  const loadConfig = useCallback(async (signal: AbortSignal) => {
    try {
      const res = await fetch('/api/config/model-routing', { signal, cache: 'no-store' });
      const body = await res.json();
      if (signal.aborted) return;
      if (!res.ok) {
        setConfig(null);
        return;
      }
      setConfig({
        models: Array.isArray(body.models) ? body.models : [],
        auto: Array.isArray(body.auto) ? body.auto : [],
        matrix: body.editable?.matrix || { default: {}, clients: {} },
      });
    } catch {
      // Config warnings belong to the parent; request history remains usable.
      if (!signal.aborted) setConfig(null);
    }
  }, []);

  // Home stays mounted between views. Abort pending reads when it is inactive.
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    polling.current = controller;
    void loadConfig(controller.signal);
    void loadDecisions();
    const timer = setInterval(() => void loadDecisions(), POLL_MS);
    return () => {
      clearInterval(timer);
      controller.abort();
      if (polling.current === controller) polling.current = null;
    };
  }, [active, loadConfig, loadDecisions]);

  const labelOf = (id: string) => config?.models.find((model) => model.id === id)?.label || id;
  const configuredFor = (clientId: string) => {
    if (!config) return '';
    const candidates = [
      config.matrix.clients[clientId]?.[HEADLINE_ROLE],
      config.matrix.default[HEADLINE_ROLE],
      config.auto.find((role) => role.role === HEADLINE_ROLE)?.effectiveModelId || '',
    ];
    return candidates.find((id) => config.models.some((model) => model.id === id)) || '';
  };

  const latestFor = (clientId: string) => decisions?.recent.find((entry) => entry.clientId === clientId);

  return (
    <div className="space-y-5">
      {decisionsError && (
        <ErrorState
          message={`${decisions ? t("日志刷新失败，以下保留上次成功读取的快照") : t("没读到网关决策日志")}：${decisionsError}`}
          onRetry={active ? () => void loadDecisions() : undefined}
        />
      )}
      <Panel className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <Badge tone="neutral">{t("决策日志")}</Badge>
          <Counter label={t("日志内请求")} value={decisions?.counters.requests} />
          <Counter label={t("含意图记录")} value={decisions?.counters.autoRouted} />
          <Counter label={t("错误记录")} value={decisions?.counters.errors} tone={decisions && decisions.counters.errors > 0 ? 'text-rex-danger' : undefined} />
        </div>
        <p className="mt-3 text-xs leading-5 text-rex-text-muted">
          
          {t("计数来自当前保留的网关日志，不是客户端在线状态或累计用量。")}
          {active ? t("当前视图每 2.5 秒读取一次。") : t("当前视图未轮询。")}
        </p>
      </Panel>

      {compact ? (
        <div className="flex min-h-24 flex-wrap items-center justify-between gap-2 rounded-rex-md border border-rex-border bg-rex-panel/40 px-4 py-3 text-xs">
          <span className="text-rex-text-muted">
            
            {t("最近请求涉及")} <span className="font-semibold text-rex-text">{visibleClients.length}</span>  {t("个客户端")}
            {decisions ? t(" · 日志内 {value0} 条请求", { value0: decisions.counters.requests }) : t(" · 日志读取中")}
            <span className="ml-1">{t("（仅为历史日志，不代表在线）")}</span>
          </span>
          <TextLink onClick={() => navigate('routingConfig')}>{t("查看分配明细")}</TextLink>
        </div>
      ) : (
      <Panel className="overflow-hidden">
        <div className="border-b border-rex-border p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-[15px] font-semibold">{t("客户端与模型")}</h2>
            <TextLink onClick={() => navigate('routingConfig')}>{t("管理模型分配")}</TextLink>
          </div>
          <p className="mt-2 text-xs leading-5 text-rex-text-muted">
            
            {t("最近请求仅查看日志末尾 50 条；未列出不代表从未请求。配置默认只展示实现角色，不代表所有角色或意图。")}
          </p>
          <p className="mt-2 min-h-10 text-xs leading-5 text-rex-text-muted sm:min-h-5">
            {!decisions ? t("尚未读到网关决策日志。") : decisions.counters.requests === 0 ? (decisions.exists ? t("当前日志内没有请求记录。") : t("尚未找到网关决策日志。")) : ''}{t("客户端配置落点不能证明已接入网关。")}
          </p>
        </div>
        {visibleClients.length === 0 && (
          <Empty icon={Waypoints} title={t("没有可展示的客户端")}>
            
            {t("当前工作区没有返回客户端事实；配置落点与请求记录分别采集。")}
          </Empty>
        )}
        <ul className="divide-y divide-rex-border">
          {visibleClients.map((client) => {
            const label = clientLabel(client.clientId);
            const latest = latestFor(client.clientId);
            const configured = configuredFor(client.clientId);
            return (
              <li key={client.clientId} className="grid min-w-0 gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-6">
                <div className="flex min-w-0 items-start gap-3">
                  <ClientLogo id={client.clientId} size="lg" />
                  <div className="min-w-0 space-y-1">
                    <h3 className="break-words text-sm font-semibold">{label.name}</h3>
                    <p className="break-all text-[11px] text-rex-text-muted">{client.clientId}</p>
                    <p className="text-xs leading-5 text-rex-text-muted">
                      {client.installed ? t("本机有配置落点") : client.declaredOnly ? t("仅声明支持 · 本机无落点") : t("本机无落点")}
                    </p>
                  </div>
                </div>
                <dl className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                  <div className="min-w-0">
                    <dt className="mb-1.5 text-[11px] text-rex-text-muted">{t("最近请求")}</dt>
                    <dd className="min-h-24 space-y-1">
                      {latest ? (
                        <>
                          <p className="break-all text-sm font-medium">{latest.modelId ? labelOf(latest.modelId) : t("未记录模型")}</p>
                          {latest.modelId && labelOf(latest.modelId) !== latest.modelId && (
                            <p className="break-all text-[11px] text-rex-text-muted">{latest.modelId}</p>
                          )}
                          {(latest.role || latest.intent) && (
                            <p className="flex flex-wrap gap-x-2 text-[11px] leading-5 text-rex-text-muted">
                              {latest.role && <span className="break-all">{t("角色")} {latest.role}</span>}
                              {latest.intent && <span className="break-all">{t("意图")} {latest.intent}</span>}
                            </p>
                          )}
                          {latest.intentFallback && (
                            <p>
                              <Badge tone="danger" className="cursor-help" title={[
                                latest.intentFallback.reason,
                                latest.intentFallback.originalIntentId
                                  ? t("原意图: {value0} → {value1}", { value0: latest.intentFallback.originalIntentId, value1: latest.intentFallback.originalModelId })
                                  : '',
                                t("实际执行: {value0}", { value0: latest.intentFallback.fallbackModelId }),
                              ].filter(Boolean).join('\n')}>
                                
                                {t("回落 (")}{latest.intentFallback.stage})
                              </Badge>
                            </p>
                          )}
                          {latest.at && <p className="break-words text-[11px] text-rex-text-muted"><RequestTime at={latest.at} /></p>}
                        </>
                      ) : (
                        <p className="text-xs leading-5 text-rex-text-muted">{decisions ? t("最近 50 条内无记录") : t("尚未读到日志")}</p>
                      )}
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="mb-1.5 text-[11px] text-rex-text-muted">{t("配置默认 · 实现角色")}</dt>
                    <dd className="min-h-12 space-y-1">
                      {configured ? (
                        <>
                          <p className="break-all text-sm font-medium">{labelOf(configured)}</p>
                          {labelOf(configured) !== configured && <p className="break-all text-[11px] text-rex-text-muted">{configured}</p>}
                        </>
                      ) : (
                        <p className="text-xs leading-5 text-rex-text-muted">{config ? t("未解析到默认模型") : t("尚未读到配置")}</p>
                      )}
                    </dd>
                  </div>
                  <div className="min-w-0 sm:col-span-2 xl:col-span-1">
                    <dt className="mb-1.5 text-[11px] text-rex-text-muted">{t("日志内请求")}</dt>
                    <dd className="text-sm font-medium tabular-nums">
                      {decisions ? decisions.byClient[client.clientId] ?? 0 : '—'}
                    </dd>
                  </div>
                </dl>
              </li>
            );
          })}
        </ul>
      </Panel>
      )}

      {issues.length > 0 && (
        <Panel className="border-rex-orange/40 p-5">
          <SmallTitle action={<Badge tone="warn">{issues.length}  {t("项")}</Badge>}>{t("需要你处理")}</SmallTitle>
          <ul className="space-y-2 text-xs leading-5 text-rex-text-muted">
            {issues.slice(0, 3).map((issue, index) => (
              <li key={`${issue.kind}:${issue.clientId}:${index}`} className="flex gap-2">
                <CircleAlert size={15} className="mt-0.5 shrink-0 text-rex-orange" />
                <span className="min-w-0 break-words">
                  <span className="font-medium text-rex-text">{issue.clientId ? clientLabel(issue.clientId).name : t("本机配置")} · {issue.kind}</span>
                  ：{issue.detail}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-3">
            <TextLink onClick={() => navigate('mcp')}>{t("查看服务与落点")}</TextLink>
          </div>
        </Panel>
      )}
    </div>
  );
}

function RequestTime({ at }: { at: string }) {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return <span>{at}</span>;
  return <time dateTime={at} title={at}>{date.toLocaleString('zh-CN', { hour12: false })}</time>;
}

function Counter({ label, value, tone }: { label: string; value?: number; tone?: string }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className={`inline-block min-w-[4ch] text-right font-rex-display text-xl font-semibold tabular-nums ${tone || 'text-rex-text'}`}>{value ?? '—'}</span>
      <span className="text-[11px] text-rex-text-muted">{label}</span>
    </span>
  );
}
