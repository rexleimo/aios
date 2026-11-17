'use client';

// 状态驱动的三步引导。只负责呈现与派发动作；状态派生在 lib/gateway-setup-guide.mjs。
// 它接收 GatewayControl 已读到的 status，不自己发请求，不重复推导运行/就绪状态。
import { Check, ChevronRight } from 'lucide-react';
import { deriveSetupGuide } from '../../../lib/gateway-setup-guide.mjs';
import type { GatewayStatus } from './gateway-control';
import { Button, Panel } from '../console-ui';

export type GuideActionKind = 'start' | 'providers' | 'connect';

export function GatewaySetupGuide({
  status,
  pending,
  busy,
  error,
  canConnect,
  onAction,
}: {
  status: GatewayStatus | null;
  pending: boolean;
  busy: boolean;
  error: string;
  canConnect: boolean;
  onAction: (kind: GuideActionKind) => void;
}) {
  const guide = deriveSetupGuide(status, {
    pending,
    ...(status?.configuredModelCount !== undefined ? { modelCount: status.configuredModelCount } : {}),
  });
  const actionable = guide.nextAction.label && !pending && !busy
    && !(guide.kind === 'start' && !!error)
    && !(guide.kind === 'connect' && !canConnect);

  return (
    <Panel className="col-span-full min-w-0 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium tracking-[.08em] text-rex-text-muted">当前状态</p>
          {/* Fixed height: text never reflows as deferred reads resolve (layout invariant). */}
          <h2 className="mt-1 min-h-7 text-lg font-semibold tracking-tight">
            {guide.kind === 'ready' ? '一切就绪，可以开始用了' : guide.kind === 'loading' ? '正在读取网关状态…' : '还差一步就能开始用'}
          </h2>
          <p className="mt-1 min-h-12 text-xs leading-6 text-rex-text-muted sm:min-h-6">
            {guide.kind === 'ready'
              ? `网关在跑、${guide.connected} 个客户端接入、可路由模型已加载。下方只是历史日志，不代表在线。`
              : '按顺序做完三步即可。状态来自本机实读，历史请求不参与判断。'}
          </p>
        </div>
        <Button size="sm" className="min-w-28" disabled={!actionable} onClick={() => onAction(guide.kind as GuideActionKind)}>
          {guide.nextAction.label || '读取状态中'}
          <ChevronRight size={14} />
        </Button>
      </div>
      <ol className="mt-4 grid min-w-0 gap-2 sm:grid-cols-3" aria-label="接入步骤">
        {guide.steps.map((step, index) => (
          <li key={step.key} className="min-w-0 rounded-rex-md border border-rex-border bg-rex-panel/40 p-3">
            <div className="flex items-center gap-2">
              <span aria-hidden className={`grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-semibold ${
                step.state === 'done' ? 'bg-rex-green/15 text-rex-green' : step.state === 'next' ? 'bg-rex-cyan text-white' : 'bg-rex-panel text-rex-text-muted'}`}>
                {step.state === 'done' ? <Check size={13} /> : index + 1}
              </span>
              <span className="min-w-0 truncate text-xs font-medium">{step.title}</span>
              <span className={`ml-auto shrink-0 text-[10px] ${step.state === 'done' ? 'text-rex-green' : step.state === 'next' ? 'text-rex-cyan' : 'text-rex-text-muted'}`}>
                {step.state === 'done' ? '已完成' : step.state === 'next' ? '下一步' : '待办'}
              </span>
            </div>
            <p className="mt-2 min-h-10 text-[11px] leading-5 text-rex-text-muted">{step.detail}</p>
          </li>
        ))}
      </ol>
    </Panel>
  );
}
