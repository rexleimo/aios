'use client';

// 监控面：只回答「现在谁在用哪个模型」。实时路由图 + 只读自动默认表 + 一个折叠的网关解释。
// 所有「改」的交互（意图 / 覆盖 / 供应商）在独立子页 /routing/config，不在这里堆编辑器。
import { useState, type ReactNode } from 'react';
import { ChevronDown, KeyRound, Languages, Network, Settings2, Waypoints, type LucideIcon } from 'lucide-react';
import { Badge, Button, ErrorState, Loading, Panel, SmallTitle } from './console-ui';
import { RoutingGraph } from './model-routing/routing-graph';
import { GatewayControl } from './model-routing/gateway-control';
import { COST_LABEL, ROLE_LABEL, SPEED_LABEL, costTone } from './model-routing/labels';
import { useRoutingConfig } from './model-routing/use-routing-config';

export function ModelRoutingPanel({ onConfigure, active = true }: { onConfigure: () => void; active?: boolean }) {
  const { auto, models, status, error, reload } = useRoutingConfig();
  const [showExplainer, setShowExplainer] = useState(false);
  const ready = auto.length > 0 || models.length > 0;

  if (status === 'loading' && !ready) {
    return <Loading label="正在读取模型路由…" className="max-w-3xl" />;
  }
  if (!ready) {
    return <ErrorState className="max-w-3xl" message={`没读到模型路由：${error || '未知原因'}`} onRetry={() => void reload()} />;
  }

  return (
    <div className="max-w-3xl space-y-5">
      {status === 'error' && <p className="text-xs text-rex-danger">刷新失败：{error}</p>}

      <RoutingGraph models={models} />

      <GatewayControl active={active} />

      <Panel className="p-6">
        <SmallTitle
          action={
            <Button variant="outline" size="sm" onClick={onConfigure}>
              <Settings2 size={14} />
              调整路由配置
            </Button>
          }
        >
          自动路由（默认）
        </SmallTitle>
        <p className="mb-4 text-xs leading-6 text-rex-text-muted">
          默认已为每个角色配好最合适的模型，无需手动选择。此表只读；要改意图或覆盖，点右上「调整路由配置」进入独立配置页。
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-rex-border text-left text-rex-text-muted">
                <th className="py-2 pr-3 font-medium">角色</th>
                <th className="py-2 pr-3 font-medium">自动分配的模型</th>
                <th className="py-2 pr-3 font-medium">成本</th>
                <th className="py-2 pr-3 font-medium">速度</th>
                <th className="py-2 font-medium">来源</th>
              </tr>
            </thead>
            <tbody>
              {auto.map((row) => (
                <tr key={row.role} className="border-b border-rex-border/60 align-top">
                  <td className="py-2.5 pr-3 font-medium">{ROLE_LABEL[row.role] || row.role}</td>
                  <td className="py-2.5 pr-3">
                    <span className="font-medium">{row.label || row.effectiveModelId || '—'}</span>
                    <span className="block text-[10px] text-rex-text-muted">{row.effectiveModelId}</span>
                    {row.overridden && row.autoModelId && (
                      <span className="block text-[10px] text-rex-text-muted">自动本来会选 {row.autoModelId}</span>
                    )}
                  </td>
                  <td className="py-2.5 pr-3"><Badge tone={costTone(row.cost)}>{COST_LABEL[row.cost] || row.cost}</Badge></td>
                  <td className="py-2.5 pr-3 text-rex-text-muted">{SPEED_LABEL[row.speed] || row.speed}</td>
                  <td className="py-2.5">{row.overridden ? <Badge tone="warn">已自定义</Badge> : <Badge tone="info">自动</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel className="p-6">
        <button
          type="button"
          onClick={() => setShowExplainer((value) => !value)}
          aria-expanded={showExplainer}
          className="flex w-full items-center justify-between gap-3 text-left focus-visible:outline-2 focus-visible:outline-rex-cyan"
        >
          <span className="text-[15px] font-semibold">本地模型网关是什么</span>
          <ChevronDown size={16} className={`text-rex-text-muted transition-transform duration-150 motion-reduce:transition-none ${showExplainer ? 'rotate-180' : ''}`} />
        </button>
        {showExplainer && (
          <div className="mt-4">
            <p className="mb-4 text-xs leading-6 text-rex-text-muted">
              网关是跑在你本机（127.0.0.1）的统一入口。把 AI 客户端的 base URL 指向它，就由它替你把每个请求转发到最合适的模型供应商——你不必为每次对话手动挑模型。
            </p>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Feature icon={Waypoints} title="按角色自动选模型">规划 / 审查用强模型，实现用快而省的模型；通道故障时自动切到备用。</Feature>
              <Feature icon={Languages} title="协议翻译（有边界）">Messages、Responses、Chat Completions 和 Gemini 可跨协议转换请求、非流式响应及流式事件，支持函数工具续轮；无法表示的状态、思考或多模态能力会明确拒绝。同协议保留供应商扩展。</Feature>
              <Feature icon={KeyRound} title="密钥只存环境变量">配置里只出现 env 引用，不落明文、不进日志。</Feature>
              <Feature icon={Network} title="单一配置源">CLI / 网关 / 界面读写同一份配置，改一处处处生效。</Feature>
            </ul>
            <p className="mt-4 text-[11px] leading-5 text-rex-text-muted">
              启动网关与接入客户端的操作都在上方「本地网关」「接入客户端」两张卡里：一键启停、每客户端一条可复制的启动命令。真实模型扣费验收需你显式批准后才跑。
            </p>
          </div>
        )}
      </Panel>
    </div>
  );
}

function Feature({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-2.5 rounded-xl border border-rex-border bg-rex-panel/40 p-3">
      <Icon size={16} strokeWidth={1.8} className="mt-0.5 shrink-0 text-rex-cyan" />
      <span className="text-xs leading-5">
        <span className="block font-medium text-rex-text">{title}</span>
        <span className="text-rex-text-muted">{children}</span>
      </span>
    </li>
  );
}
