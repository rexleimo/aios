'use client';

import { t } from '../../i18n/t.mjs';
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  ArrowRight,
  Check,
  FileClock,
  LayoutDashboard,
  Plug,
  RotateCcw,
  Save,
  Settings2,
  ShieldCheck,
} from 'lucide-react';
import type { ConsoleFacts } from '../../lib/console-facts';
import type { NavId } from '../../lib/console-navigation';
import { Badge, Button, ErrorState, Heading, InlineFeedback, Loading, Modal, Panel } from './console-ui';
import { AgentOverview } from './model-routing/agent-overview';
import { GatewayControl } from './model-routing/gateway-control';
import { ModelSourceSection } from './model-routing/model-source-section';
import { RoutingConfigPanel } from './model-routing/routing-config';
import { RequestHistory } from './gateway/request-history';
import { RoutingGraph } from './model-routing/routing-graph';
import { useRoutingConfig } from './model-routing/use-routing-config';

const SECTIONS = [
  { id: 'overview', label: t("运行总览"), description: t("启停与客户端接入"), icon: LayoutDashboard },
  { id: 'providers', label: t("供应商与模型"), description: t("管理请求的上游"), icon: Plug },
  { id: 'policy', label: t("模型分配"), description: t("决定请求交给谁"), icon: Settings2 },
  { id: 'requests', label: t("请求记录"), description: t("查看实际路由结果"), icon: FileClock },
] as const;
type Section = (typeof SECTIONS)[number]['id'];

export function GatewayWorkspace({
  facts,
  active,
  navigate,
  view = 'routing',
}: {
  facts: ConsoleFacts;
  active: boolean;
  navigate: (view: NavId, section?: string) => void;
  view?: NavId;
}) {
  const params = useSearchParams();
  const requested = params.get('section');
  const section: Section =
    view === 'routingConfig'
      ? 'policy'
      : requested === 'providers' || requested === 'requests' || requested === 'policy'
        ? requested
        : 'overview';
  const routing = useRoutingConfig();
  const [confirm, setConfirm] = useState<'discard' | 'reload' | null>(null);
  const saving = routing.status === 'saving';

  function selectSection(next: Section) {
    navigate('routing', next === 'overview' ? undefined : next);
  }

  return (
    <div className="space-y-6">
      <Heading
        eyebrow="GATEWAY / CONTROL PLANE"
        title={t("模型网关")}
        description={t("接入客户端，配置模型来源，让每一次请求都有清晰的去向。")}
        actions={
          <Badge tone="info">
            <ShieldCheck size={12} />
            
            {t("本机控制台")}
          </Badge>
        }
      />

      <nav
        aria-label={t("网关工作区")}
        className="grid grid-cols-2 gap-2 rounded-rex-lg border border-rex-border bg-rex-panel/60 p-2 xl:grid-cols-4"
      >
        {SECTIONS.map((item, index) => (
          <button
            key={item.id}
            type="button"
            aria-current={section === item.id ? 'page' : undefined}
            onClick={() => selectSection(item.id)}
            className={`flex min-w-0 items-start gap-3 rounded-rex-md px-3 py-3 text-left transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-rex-cyan ${section === item.id ? 'bg-rex-bg shadow-sm ring-1 ring-rex-border' : 'hover:bg-rex-bg/70'}`}
          >
            <item.icon
              size={17}
              className={`mt-0.5 shrink-0 ${section === item.id ? 'text-rex-cyan' : 'text-rex-text-muted'}`}
            />
            <span className="min-w-0">
              <span
                className={`block text-xs font-semibold sm:text-sm ${section === item.id ? 'text-rex-text' : 'text-rex-text-muted'}`}
              >
                {item.label}
              </span>
              <span className="mt-1 hidden text-[11px] text-rex-text-muted sm:block">{item.description}</span>
            </span>
            <span className="ml-auto hidden font-rex-mono text-[10px] text-rex-text-muted 2xl:block">
              0{index + 1}
            </span>
          </button>
        ))}
      </nav>
      <p className="text-[11px] leading-5 text-rex-text-muted">
        
        {t("此处管理本机网关，注册表属于 Console 服务启动根。切换工作区只改变客户端事实的采集范围，不会切换为另一套网关。")}
      </p>

      <div hidden={section !== 'overview'} className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">{t("先接通，再分配。")}</h2>
            <p className="mt-1 text-xs leading-5 text-rex-text-muted">
              
              {t("运行状态、客户端接入和历史请求分别展示，互不推断。")}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => selectSection('providers')}>
            
            {t("管理模型来源")}
            <ArrowRight size={14} />
          </Button>
        </div>
        <div className="min-h-[480px]">
          <RoutingGraph models={routing.models} />
        </div>
        <GatewayControl active={active && section === 'overview'} navigate={navigate} />
        <AgentOverview
          clients={facts.clients}
          issues={[]}
          active={active && section === 'overview'}
          navigate={navigate}
          compact
        />
      </div>

      {(section === 'providers' || section === 'policy') &&
        !routing.editable &&
        (routing.status === 'error' ? (
          <ErrorState message={t("配置读取失败：{value0}", { value0: routing.error })} onRetry={() => void routing.reload()} />
        ) : (
          <Loading label={t("正在读取网关配置…")} />
        ))}
      {routing.editable && (
        <fieldset
          disabled={saving || routing.status === 'loading'}
          className="min-w-0 space-y-6 disabled:opacity-70"
          hidden={section !== 'providers' && section !== 'policy'}
        >
          <div hidden={section !== 'providers'}>
            <ModelSourceSection
              models={routing.managementModels}
              customModels={routing.editable.customModels}
              providers={routing.editable.providers}
              onChangeCustomModels={(customModels) =>
                routing.setEditable((prev) => (prev ? { ...prev, customModels } : prev))
              }
              onChangeProviders={(providers) =>
                routing.setEditable((prev) => (prev ? { ...prev, providers } : prev))
              }
              onRefresh={routing.refreshModels}
              saving={saving}
              dirty={routing.dirty}
            />
          </div>
          <div hidden={section !== 'policy'}>
            <RoutingConfigPanel routing={routing} />
          </div>
        </fieldset>
      )}
      {section === 'requests' && <RequestHistory active={active} models={routing.models} />}

      {routing.error && routing.editable && (
        <ErrorState
          message={t("配置快照未能更新，当前草稿已保留：{value0}", { value0: routing.error })}
          onRetry={() => setConfirm('reload')}
        />
      )}

      {routing.editable &&
        (routing.dirty || section === 'providers' || section === 'policy' || routing.feedback) && (
          <Panel className={`${routing.dirty ? 'sticky bottom-4 z-10' : ''} grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3 border-rex-cyan/25 bg-rex-bg/95 p-4 shadow-lg backdrop-blur-sm sm:flex sm:flex-wrap sm:items-center`}>
            <span
              className={`grid size-8 shrink-0 place-items-center rounded-rex-sm ${routing.dirty ? 'bg-rex-cyan/10 text-rex-cyan' : 'bg-rex-panel text-rex-text-muted'}`}
            >
              {routing.dirty ? <Save size={15} /> : <Check size={15} />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold">
                {saving ? t("正在写入配置…") : routing.dirty ? t("有未保存的修改") : t("与已读取配置一致")}
              </p>
               <p className="mt-1 text-[11px] leading-5 text-rex-text-muted">{t("所有分区共用草稿；保存仅写入磁盘，运行中的网关需重启加载。")}</p>
               {routing.dirty && <details className="mt-1 text-[11px] leading-5 text-rex-text-muted">
                 <summary className="cursor-pointer font-medium focus-visible:outline-2 focus-visible:outline-rex-cyan">{t("修改摘要（")}{routing.changes.length}  {t("项）")}</summary>
                 <ul className="mt-1 max-h-24 space-y-1 overflow-y-auto">{routing.changes.map((change) => <li key={change}>{change}</li>)}</ul>
               </details>}
              <InlineFeedback feedback={routing.feedback} />
            </div>
            <div className="col-span-2 flex flex-wrap justify-end gap-2 sm:ml-auto">
              <Button
                size="sm"
                variant="ghost"
                disabled={saving}
                onClick={() => setConfirm('reload')}
                aria-label={t("重新读取配置")}
              >
                <RotateCcw size={14} />
                
                {t("重新读取")}
              </Button>
              {routing.dirty && (
                <Button size="sm" variant="outline" disabled={saving} onClick={() => setConfirm('discard')}>
                  
                  {t("放弃修改")}
                </Button>
              )}
              <Button size="sm" disabled={!routing.dirty || saving} onClick={() => void routing.save()}>
                <Save size={14} />
                {saving ? t("保存中…") : t("保存全部修改")}
              </Button>
            </div>
          </Panel>
        )}
      <Modal
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
        title={confirm === 'reload' ? t("重新读取配置？") : t("放弃未保存的修改？")}
        description={
          confirm === 'reload'
            ? t("将读取磁盘上的最新配置。如有未保存修改，会被替换；这不会更改已保存的配置。")
            : t("供应商、模型和模型分配将恢复到最近一次读取的配置。此操作不会改写磁盘。")
        }
      >
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setConfirm(null)}>
            
            {t("继续编辑")}
          </Button>
          <Button
            variant={routing.dirty ? 'danger' : 'default'}
            onClick={() => {
              if (confirm === 'reload') void routing.reload();
              else routing.discard();
              setConfirm(null);
            }}
          >
            
            {t("确认")}{confirm === 'reload' ? t("重新读取") : t("放弃修改")}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
