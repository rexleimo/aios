'use client';

// 总览页「接入客户端」：照 magpie 的 Agent 列表——一行一个客户端，图标 / 版本 / 更新 / AIOS 模型 ID
// 全部内联；接入由程序就地写全局配置（父组件的确认门 + /api/model-routing/gateway）。
// 手动接入说明归接入手册，不在列表里摊开 API 表单。
import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

import { clientLabel } from '../../../lib/console-facts';
import type { ViewId } from '../../../lib/console-navigation';
import { Badge, Button, InlineFeedback, Panel, Select, SmallTitle, type Feedback } from '../console-ui';
import { ClientUpdateDialog, type UpdatePreview } from '../clients/client-update-dialog';
import { installationSummary } from '../clients/client-management-model.mjs';
import { useClientManagement, type ClientInstallation } from '../clients/use-client-management';

const CLIENTS = ['claude', 'codex', 'pi'] as const;
type ClientId = typeof CLIENTS[number];

interface AccessClient {
  client: string;
  connected: boolean;
  launch?: string;
}
interface AccessGateway {
  url?: string;
  port: number;
  running: boolean;
  ready?: boolean;
  configuredRevision?: string | null;
  clients?: AccessClient[];
}

export function AgentAccessPanel({
  status, canConnect, busy, error, feedback, onConnect, onDisconnect, onNavigate,
}: {
  status: AccessGateway | null;
  canConnect: boolean;
  busy: boolean;
  error: string;
  feedback: Feedback | null;
  onConnect: (client: string, target: string) => void;
  onDisconnect: (client: string) => void;
  onNavigate: (view: ViewId) => void;
}) {
  const state = useClientManagement();
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState('');
  const [update, setUpdate] = useState<UpdatePreview | null>(null);
  const [failure, setFailure] = useState('');

  const connectedCount = status?.clients?.filter((item) => item.connected).length || 0;

  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      window.setTimeout(() => setCopied((current) => (current === key ? '' : current)), 1500);
    } catch {
      setFailure('复制失败：请手动选中内容复制。');
    }
  }

  async function previewUpdate(client: ClientInstallation) {
    setFailure('');
    try {
      const result = await state.act('/api/clients', { action: 'preview-update', client: client.id });
      if (!result.preview || result.preview.client !== client.id) throw new Error('更新预览与所选客户端不一致。');
      setUpdate({ ...result.preview, client });
    } catch (err) {
      setFailure(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <Panel className="min-w-0 p-6">
      <SmallTitle action={<Badge className="w-28 justify-center" tone="neutral">{status ? `${connectedCount} / ${CLIENTS.length} 已接入` : '读取接入状态…'}</Badge>}>
        接入客户端
      </SmallTitle>
      <p className="text-xs leading-6 text-rex-text-muted">就地接入，确认后改写配置并备份原值；开关只改配置，不启停网关。</p>
      {/* 固定高度：异步读取逐个返回时，下面列表/折叠区不因提示文案增减而跳动。 */}
      <div className="mt-1 min-h-12 text-xs leading-5">
        {error ? <p role="alert" className="text-rex-danger">网关状态刷新失败：{error}</p>
          : failure ? <p role="alert" className="text-rex-danger">{failure}</p>
            : Object.keys(state.errors).length > 0
              ? <p role="alert" className="text-rex-danger">{Object.values(state.errors).join('；')}未读到</p>
              : <InlineFeedback feedback={feedback} idle={canConnect ? '接入/还原会改写真实配置，操作前需确认。' : '先让运行中的网关加载就绪的模型路由，再接入客户端；已接入的仍可还原。'} />}
      </div>

      <ul className="mt-3 divide-y divide-rex-border rounded-rex-md border border-rex-border">
        {CLIENTS.map((id: ClientId) => {
          const item = status?.clients?.find((entry) => entry.client === id);
          const installed = state.installations.find((client) => client.id === id);
          const connected = item?.connected === true;
          const current = item && 'target' in item ? String((item as { target?: string | null }).target || 'auto') : 'auto';
          const target = selected[id] ?? current;
          const clientOptions = [...state.targets];
          if (target && !clientOptions.some((option) => option.value === target)) {
            clientOptions.unshift({ value: target, label: `${target} · 当前引用未在目录中` });
          }
          // 接入需要网关就绪且无刷新错误；还原（已接入）不依赖目录版本或刷新成功。
          const disabled = busy || state.busy || (connected ? !item : !item || state.loading || !!error || !canConnect);
          return (
            <li key={id} className="grid min-w-0 items-center gap-x-3 gap-y-2 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
              {/* 照 AgentOverview 的一行式：左侧身份块，右侧事实/操作块；不在行内换行堆三行。 */}
              <div className="flex min-w-0 items-center gap-3">
                <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-rex-md bg-rex-panel">
                  {/* 品牌图标来自 magpie（MIT），见 public/icons/NOTICE.md */}
                  <img src={`/icons/${id}.svg`} alt="" className="size-5" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium">{clientLabel(id).name}<span className="ml-2 font-normal text-rex-text-muted">{id}</span></p>
                  <p className="flex min-w-0 items-center gap-2 text-[11px] text-rex-text-muted">
                    <span className="truncate">{installed ? installationSummary(installed) : '版本未读到'}</span>
                    <Button className="shrink-0 px-1.5" size="sm" variant="ghost" disabled={state.busy || !installed?.update?.supported} onClick={() => installed && void previewUpdate(installed)}>更新</Button>
                  </p>
                </div>
              </div>
              <div className="flex min-w-0 items-center gap-2">
                <div className="min-w-0 flex-1">
                  <Select aria-label={`${clientLabel(id).name} 默认模型`} value={target} onValueChange={(value) => setSelected((previous) => ({ ...previous, [id]: value }))} options={clientOptions} disabled={disabled} />
                </div>
                <Badge className="w-14 shrink-0 justify-center" tone={!item ? 'neutral' : connected ? 'ok' : 'neutral'}>
                  {!item ? '未知' : connected ? '已接入' : '未接入'}
                </Badge>
                <button
                  type="button" role="switch" aria-label={`${clientLabel(id).name} 接入网关`} aria-checked={connected}
                  disabled={disabled}
                  onClick={() => connected ? onDisconnect(id) : onConnect(id, target)}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rex-cyan disabled:opacity-40 ${connected ? 'bg-rex-cyan' : 'bg-rex-border'}`}
                >
                  <span aria-hidden="true" className={`h-5 w-5 rounded-full bg-rex-bg transition-transform motion-reduce:transition-none ${connected ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-rex-text-muted">
        <Button size="sm" variant="outline" disabled={state.loading || state.busy} onClick={() => void state.reload()}>刷新客户端状态</Button>
        <button type="button" className="underline underline-offset-2" onClick={() => onNavigate('tools')}>完整配置与恢复记录</button>
      </div>

      <p className="mt-4 text-[11px] leading-5 text-rex-text-muted">
        接入由程序写入客户端全局配置并备份原值；手动接入步骤见接入手册。
      </p>

      <details className="group mt-3 text-[11px] leading-5 text-rex-text-muted">
        <summary className="cursor-pointer select-none">手动接入（隔离模式，不碰真实配置）</summary>
        <p className="mt-2">不想改真实配置时，用 <code className="rounded bg-rex-panel px-1 py-0.5">aios model-router connect --isolated --port {status?.port ?? '<port>'}</code> 生成隔离工件，再按下列命令启动客户端；还原用 <code className="rounded bg-rex-panel px-1 py-0.5">aios model-router disconnect</code>。</p>
        <div className="mt-2 space-y-2">
          {(status?.clients ?? []).map((item) => <CopyRow key={item.client} label={clientLabel(item.client).name} value={item.launch || ''} copied={copied === item.client} onCopy={() => void copy(item.launch || '', item.client)} />)}
        </div>
      </details>

      {update && <ClientUpdateDialog preview={update} busy={state.busy} onClose={() => setUpdate(null)} onConfirm={() => {
        const pending = update;
        void (async () => {
          try {
            const result = await state.act('/api/clients', { action: 'update', client: pending.client.id, expectedRevision: pending.revision, confirm: true });
            if (!result.ok) throw new Error('更新未完成');
            await state.reload();
          } catch (err) {
            setFailure(err instanceof Error ? err.message : String(err));
          } finally {
            setUpdate(null);
          }
        })();
      }} />}
    </Panel>
  );
}

function CopyRow({ label, value, copied, onCopy }: { label: string; value: string; copied: boolean; onCopy: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-20 shrink-0 break-all">{label}</span>
      <code className="min-w-0 flex-1 overflow-x-auto rounded-lg bg-rex-bg px-2.5 py-1.5 font-rex-mono text-[11px] whitespace-nowrap text-rex-text-body ring-1 ring-rex-border">{value || '—'}</code>
      <Button variant="ghost" size="icon" aria-label={copied ? '已复制' : `复制 ${label}`} onClick={onCopy}>
        {copied ? <Check size={15} className="text-rex-green" /> : <Copy size={15} />}
      </Button>
    </div>
  );
}
