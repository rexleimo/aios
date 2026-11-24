'use client';

import { t } from '../../../i18n/t.mjs';
import { useMemo, useState } from 'react';
import { AlertTriangle, Plug, Plus, ShieldCheck } from 'lucide-react';

import { clientLabel, landingTokenLabel, LANDING_TOKEN_EXPLANATION, type ConsoleFacts, type FactServiceRow } from '../../../lib/console-facts';
import { Badge, Button, Empty, Heading, Panel, SmallTitle } from '../console-ui';
import { McpWizard, type McpPreset } from '../flows/mcp-wizard';

const OWNERSHIP_LABELS: Record<string, string> = {
  owned: t("AIOS 登记并持有"),
  external: t("别人写的，AIOS 不覆盖"),
  conflict: t("同名但内容不一致"),
  'kept-differs': t("登记后被人工改过"),
  unknown: t("归属未记录"),
};

export function McpWorkspace({ facts }: { facts: ConsoleFacts }) {
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState<McpPreset | undefined>();
  const [presetError, setPresetError] = useState('');
  const [presetBusy, setPresetBusy] = useState(false);
  const [clientFilter, setClientFilter] = useState('all');
  const rows = facts.services.rows;
  const visible = useMemo(
    () => (clientFilter === 'all' ? rows : rows.filter((row) => row.clientId === clientFilter)),
    [rows, clientFilter],
  );
  const summary = facts.services.summary as Record<string, unknown> | null;
  const installed = facts.clients.filter((client) => client.installed);
  // 落点状态的种类由数据决定，不写死四个卡片：今天没有 verified 落点时就不该出现一张绿卡。
  const landingTally = useMemo(() => {
    const tally = new Map<string, number>();
    for (const row of rows) tally.set(row.status, (tally.get(row.status) ?? 0) + 1);
    return [...tally.entries()].sort((left, right) => right[1] - left[1]);
  }, [rows]);

  async function addSearch() {
    setPresetBusy(true);
    setPresetError('');
    try {
      const response = await fetch('/api/mcp/presets', { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || t("搜索预设读取失败"));
      setPreset(result.preset);
      setOpen(true);
    } catch (error) {
      setPresetError(error instanceof Error ? error.message : String(error));
    } finally {
      setPresetBusy(false);
    }
  }

  return (
    <>
      <Heading
        eyebrow="MCP SERVICES"
        title={t("服务装在哪里、谁的、读没读到。")}
        description={t("本机 {value0} 个服务配置实例、{value1} 个落点，全部来自 {value2} 的一次读取。", { value0: rows.length, value1: String(summary?.landings ?? 0), value2: '`aios mcp list --json`' })}
        actions={
          <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => void addSearch()} disabled={presetBusy || !facts.services.loaded || installed.length === 0}>
            {presetBusy ? t("读取搜索预设…") : t("添加 DeepSeek 搜索")}
          </Button><Button onClick={() => { setPreset(undefined); setOpen(true); }} disabled={!facts.services.loaded || installed.length === 0}>
            <Plus size={15} />
            
            {t("添加 MCP 服务")}
          </Button></div>
        }
      />
      {presetError && <p role="alert" className="mb-4 text-xs text-rex-danger">{presetError}</p>}
      {!facts.services.loaded ? (
        <Panel className="mb-6 border-rex-danger/40 p-5">
          <SmallTitle action={<Badge tone="danger">{t("读取失败")}</Badge>}>{t("服务清单没读到")}</SmallTitle>
          <p className="text-xs leading-6 text-rex-text-muted">
            {facts.services.error ?? t("能力进程没有返回可读的清单。")}
          </p>
        </Panel>
      ) : (
        <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label={t("服务配置实例")} value={String(rows.length)} note={t("按 (客户端, 范围, 名字) 计数")} />
          <StatCard label={t("落点")} value={String(summary?.landings ?? 0)} note={t("可写 {value0}", { value0: String(summary?.writableLandings ?? 0) })} />
          <StatCard
            label={t("归属：AIOS 持有 / 外部")}
            value={`${String(summary?.owned ?? 0)} / ${String(summary?.external ?? 0)}`}
            note={t("外部条目不会被覆盖，adopt 才接管")}
          />
          <StatCard
            label={t("落点已验证")}
            value={`${String(summary?.landingVerified ?? 0)} / ${String(summary?.landings ?? 0)}`}
            note={Number(summary?.landingUnverified ?? 0) > 0 ? t("{value0} 个未验证", { value0: String(summary?.landingUnverified) }) : t("全部有证据卡")}
            warn={Number(summary?.landingError ?? 0) > 0}
          />
        </div>
      )}
      {landingTally.length > 0 && (
        <Panel className="mb-6 p-5">
          <SmallTitle>{t("落点状态分别是什么意思")}</SmallTitle>
          <ul className="grid gap-2 text-xs leading-5 text-rex-text-muted sm:grid-cols-2">
            {landingTally.map(([token, count]) => (
              <li key={token} className="flex items-start gap-2">
                <Badge tone={landingTokenLabel(token).tone}>
                  {landingTokenLabel(token).label} × {count}
                </Badge>
                <span>{LANDING_TOKEN_EXPLANATION[token] ?? t("这个状态的含义尚未登记，不编造解释。")}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 flex items-start gap-2 border-t border-rex-border pt-3 text-[11px] leading-5 text-rex-text-muted">
            <ShieldCheck size={14} className="mt-0.5 shrink-0" />
            
            {t("配置写入、落点验证与连接测试是三条不同的事实。当前界面只读配置并做 dry-run 预览，")}
            <strong className="font-medium text-rex-text-body">{t("不启动真实服务进程")}</strong>{t("，所以这里不会声称任何服务「能连上」。")}
          </p>
        </Panel>
      )}
      <Panel className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-rex-border px-5 py-3">
          <h2 className="text-sm font-semibold">{t("服务清单")}</h2>
          <div className="ml-auto flex flex-wrap gap-1">
            <FilterChip label={t("全部 {value0}", { value0: rows.length })} active={clientFilter === 'all'} onClick={() => setClientFilter('all')} />
            {installed.map((client) => (
              <FilterChip
                key={client.clientId}
                label={`${clientLabel(client.clientId).name} ${client.services}`}
                active={clientFilter === client.clientId}
                onClick={() => setClientFilter(client.clientId)}
              />
            ))}
          </div>
        </div>
        {visible.length === 0 ? (
          <Empty icon={Plug} title={t("这台机器上没有 MCP 服务配置")}>
            <p>
              {clientFilter === 'all'
                ? t("已声明支持的客户端在本机没有服务落点。在任意客户端里配置一个 MCP 服务后，回来重新采集。")
                : t("这个客户端的落点里没有服务条目。")}
            </p>
          </Empty>
        ) : (
          <div className="max-h-[560px] overflow-y-auto">
            <div className="hidden grid-cols-[minmax(0,1.2fr)_110px_90px_minmax(0,1fr)_130px] gap-3 border-b border-rex-border bg-rex-panel/40 px-5 py-2.5 text-[11px] text-rex-text-muted lg:grid">
              <span>{t("服务")}</span>
              <span>{t("客户端")}</span>
              <span>{t("范围")}</span>
              <span>{t("归属 / 配置落点")}</span>
              <span className="text-right">{t("落点状态")}</span>
            </div>
            {visible.map((row) => (
              <ServiceRow key={row.id} row={row} />
            ))}
          </div>
        )}
      </Panel>
      {facts.degraded.length > 0 && (
        <p className="mt-4 flex items-start gap-2 text-[11px] leading-5 text-rex-danger">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          
          {t("本次采集有")} {facts.degraded.length}  {t("项没读到：")}
          {facts.degraded.map((entry) => `${entry.item}（${entry.error}）`).join('；')}
        </p>
      )}
      {open && <McpWizard facts={facts} preset={preset} onClose={() => setOpen(false)} onDone={() => setOpen(false)} />}
    </>
  );
}

function ServiceRow({ row }: { row: FactServiceRow }) {
  const landing = landingTokenLabel(row.status);
  return (
    <div className="grid items-start gap-3 border-b border-rex-border p-4 text-xs last:border-0 lg:grid-cols-[minmax(0,1.2fr)_110px_90px_minmax(0,1fr)_130px]">
      <div className="min-w-0">
        <p className="truncate font-medium text-rex-text-body">{row.name}</p>
        <p className="mt-1 text-[10px] text-rex-text-muted">{row.fields.join(' · ') || t("字段未记录")}</p>
      </div>
      <span className="truncate">{clientLabel(row.clientId).name}</span>
      <span className="text-rex-text-muted">{row.scope}</span>
      <div className="min-w-0">
        <p className="text-rex-text-muted">{OWNERSHIP_LABELS[row.ownership] ?? row.ownership}</p>
        <p className="mt-1 break-all font-rex-mono text-[10px] text-rex-text-muted">{row.file}</p>
      </div>
      <div className="lg:text-right">
        <Badge tone={landing.tone}>{landing.label}</Badge>
        {row.statusReason && <p className="mt-1 text-[10px] leading-4 text-rex-text-muted">{row.statusReason}</p>}
      </div>
    </div>
  );
}

function StatCard({ label, value, note, warn = false }: { label: string; value: string; note: string; warn?: boolean }) {
  return (
    <Panel className="p-4">
      <p className="text-[11px] text-rex-text-muted">{label}</p>
      <p className={`mt-1 font-rex-display text-2xl font-semibold ${warn ? 'text-rex-orange' : 'text-rex-text'}`}>{value}</p>
      <p className="mt-1 text-[10px] leading-4 text-rex-text-muted">{note}</p>
    </Panel>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-md px-2 py-1 text-[11px] focus-visible:outline-2 focus-visible:outline-rex-cyan ${active ? 'bg-rex-panel-strong font-medium text-rex-text' : 'text-rex-text-muted hover:bg-rex-panel'}`}
    >
      {label}
    </button>
  );
}
