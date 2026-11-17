'use client';

import { useState } from 'react';
import { clientLabel, type ConsoleFacts } from '../../../lib/console-facts';
import { Badge, Button, Heading, Modal, Panel, Select } from '../console-ui';
import { ClientUpdateDialog, type UpdatePreview } from './client-update-dialog';
import { useClientManagement, type ClientConnection, type ClientInstallation } from './use-client-management';
import { connectionMutationBlocked, connectionSummary, installationSummary, updatePreviewSupported } from './client-management-model.mjs';

const CONNECTABLE = new Set(['claude', 'codex', 'pi']);
const sourceLabel = (source: ClientInstallation['source']) => typeof source === 'string' ? source : source?.label || source?.kind || '来源未知';

export function ClientManagement({ facts, onDetails }: { facts: ConsoleFacts; onDetails: (id: string) => void }) {
  const state = useClientManagement();
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState('');
  const [failure, setFailure] = useState('');
  const [update, setUpdate] = useState<UpdatePreview | null>(null);
  const [connection, setConnection] = useState<{ id: string; connected: boolean; target: string; port: number; revision: string | null } | null>(null);
  const ids = [...new Set([...facts.clients.map(client => client.clientId), ...state.installations.map(client => client.id)])];
  const run = async (operation: () => Promise<void>) => {
    setFailure(''); setNotice('');
    try { await operation(); } catch (error) { setFailure(error instanceof Error ? error.message : String(error)); }
  };
  async function previewUpdate(client: ClientInstallation) {
    const result = await state.act('/api/clients', { action: 'preview-update', client: client.id });
    if (!result.preview || result.preview.client !== client.id) throw new Error('更新预览与所选客户端不一致。');
    setUpdate({ ...result.preview, client });
  }
  return <div className="space-y-5">
    <Heading eyebrow="AGENT CLIENTS" title="Agent 客户端" description="安装与版本、配置落点、网关接入是不同的事实。固定目标优先于自动分配；只有 AIOS Auto 进入角色与意图规则。" actions={<Button variant="outline" disabled={state.loading || state.busy} onClick={() => void state.reload()}>刷新客户端状态</Button>} />
    {state.loading && <p role="status" className="text-xs text-rex-text-muted">正在读取客户端安装、网关与模型目录…</p>}
    {Object.entries(state.errors).map(([label, error]) => <p key={label} role="alert" className="text-xs leading-6 text-rex-danger">{label}未读到：{error}</p>)}
    {failure && <p role="alert" className="text-xs leading-6 text-rex-danger">{failure}</p>}
    {notice && <p role="status" className="text-xs leading-6 text-rex-cyan">{notice}</p>}
    <p className="text-xs leading-6 text-rex-text-muted">接入开关只修改该客户端的网关配置，不启动或停止网关。断开会尝试还原 AIOS 持有的配置；检测到人工改动时会拒绝覆盖。配置接入不代表上游生成已验证。</p>
    {ids.length === 0 && !state.loading && <Panel className="p-5 text-sm">没有读到客户端条目，请检查上方读取结果。</Panel>}
    {ids.map(id => {
      const fact = facts.clients.find(client => client.clientId === id);
      const installed = state.installations.find(client => client.id === id);
      const gateway = state.gateway?.clients?.find(client => client.client === id) as ClientConnection | undefined;
      const connected = gateway?.connected === true;
      const current = gateway?.target || gateway?.defaultTarget || 'auto';
      const target = selected[id] ?? current;
      const supported = CONNECTABLE.has(id);
      const unsafeConnection = connectionMutationBlocked(gateway);
      const options = [...state.targets];
      const native = gateway?.capabilities?.native;
      const nativeSupported = native === true || typeof native === 'object' && native.supported === true;
      const nativeReason = typeof native === 'object' ? native.reason : gateway?.capabilities?.nativeReason;
      if (nativeSupported) options.unshift({ value: 'native', label: '客户端自行选择 · 不固定目标' });
      if (target && !options.some(option => option.value === target)) options.push({ value: target, label: `${target} · 当前引用未在目录中` });
      return <Panel key={id} className="min-w-0 p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0"><h2 className="break-words text-base font-semibold">{clientLabel(id).name}</h2><p className="mt-1 text-xs text-rex-text-muted">{id}</p></div>
          <label className="flex items-center gap-3 text-xs font-medium"><span>接入网关</span><button type="button" role="switch" aria-label={`${clientLabel(id).name} 接入网关`} aria-checked={connected} disabled={state.loading || state.busy || !supported || unsafeConnection || !state.gateway || !connected && (!state.gateway.running || !state.gateway.ready || !state.targetRevision)} onClick={() => state.gateway && setConnection({ id, connected, target, port: state.gateway.port, revision: state.targetRevision })} className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rex-cyan disabled:opacity-40 ${connected ? 'bg-rex-cyan' : 'bg-rex-border'}`}><span aria-hidden="true" className={`h-5 w-5 rounded-full bg-rex-bg transition-transform motion-reduce:transition-none ${connected ? 'translate-x-5' : 'translate-x-0.5'}`} /></button></label>
        </div>
        <dl className="mt-4 grid min-w-0 gap-x-5 gap-y-3 text-xs sm:grid-cols-[auto_minmax(0,1fr)]">
          <dt className="text-rex-text-muted">程序安装 / 版本</dt><dd className="break-all">{installed ? installationSummary(installed) : '安装信息未读到'}{installed?.installed === true && <span className="ml-2"><Badge tone="neutral">{sourceLabel(installed.source)}</Badge></span>}{installed?.executable && <p className="mt-1 font-rex-mono text-[11px] text-rex-text-muted">{installed.executable.path}{installed.executable.realPath !== installed.executable.path ? ` → ${installed.executable.realPath}` : ''}</p>}</dd>
          <dt className="text-rex-text-muted">配置落点</dt><dd className="break-all">{fact ? `${fact.scopes.length} 个落点 · ${fact.configFiles.length} 个已发现文件` : '未读到配置落点'}<span className="ml-2 text-rex-text-muted">配置存在不代表程序已安装</span></dd>
          <dt className="text-rex-text-muted">网关连接</dt><dd>{!supported ? '此客户端尚无安全接入适配器' : connectionSummary(gateway)}{supported && unsafeConnection && <p className="mt-1 text-rex-danger">请先检查配置及恢复记录，刷新后再操作；不会用未知状态覆盖现有配置。</p>}{supported && !connected && state.gateway && !state.gateway.ready && <p className="mt-1 text-rex-text-muted">请先在「模型路由」准备并启动有可用路由的网关。</p>}</dd>
          {gateway && <><dt className="text-rex-text-muted">恢复记录</dt><dd>{({ available: '有可用恢复记录', pending: '上次操作待恢复，请先检查', none: '无恢复记录', unknown: '恢复记录无法验证' } as Record<string, string>)[gateway.recovery?.status || 'unknown']}{gateway.ownership?.status === 'unowned' && ' · 当前配置不由 AIOS 持有'}</dd></>}
          <dt className="text-rex-text-muted">默认目标</dt><dd className="min-w-0 space-y-2"><Select aria-label={`${clientLabel(id).name} 默认目标`} value={target} onValueChange={value => setSelected(previous => ({ ...previous, [id]: value }))} options={options} disabled={!supported || state.loading || state.busy || state.targets.length === 0} /><p className="leading-6 text-rex-text-muted">{nativeSupported ? '客户端自行选择保留接入，只清除固定目标，与断开还原不同。' : nativeReason || '此客户端暂不支持接入后清除固定目标；可使用 Auto 或在客户端选择已发布的模型。'}</p>{connected && target !== current && <Button size="sm" variant="outline" disabled={state.loading || state.busy || unsafeConnection || !state.gateway?.ready || !state.targetRevision} onClick={() => state.gateway && setConnection({ id, connected: false, target, port: state.gateway.port, revision: state.targetRevision })}>应用默认目标</Button>}</dd>
        </dl>
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-rex-border pt-4"><Button size="sm" variant="outline" disabled={!fact} onClick={() => onDetails(id)}>配置与落点详情</Button><Button size="sm" variant="outline" disabled={state.busy || !installed?.update?.supported} onClick={() => installed && void run(() => previewUpdate(installed))}>预览客户端更新</Button>{installed && !installed.update?.supported && <p className="min-w-0 text-[11px] leading-5 text-rex-text-muted">{installed.update?.reason || '此安装来源尚无受支持的更新方式。'}</p>}</div>
      </Panel>;
    })}
    <Modal open={connection !== null} title={connection?.connected ? '断开并还原客户端配置？' : '写入客户端网关配置？'} description={connection?.connected ? '只还原此客户端由 AIOS 持有且未被人工修改的配置，不停止网关服务。' : `将使用当前网关端口 ${connection?.port || '未知'}，默认目标 ${connection?.target || 'auto'}。实际写入前会重新检查状态；已有备份与漂移保护继续生效。`} onOpenChange={open => { if (!open && !state.busy) setConnection(null); }}>
      <div className="flex flex-wrap justify-end gap-2"><Button variant="outline" disabled={state.busy} onClick={() => setConnection(null)}>取消</Button><Button disabled={state.busy} onClick={() => void run(async () => {
        if (!connection || !state.gateway) return;
        const pending = connection;
        try {
          if (!pending.connected && !pending.revision) throw new Error('请刷新模型目录后重新确认接入。');
          await state.act('/api/model-routing/gateway', { action: pending.connected ? 'disconnect' : 'connect', client: pending.id, ...(pending.connected ? {} : { port: pending.port, target: pending.target, expectedRevision: pending.revision }), confirm: true });
          setSelected(previous => { const next = { ...previous }; delete next[pending.id]; return next; });
          setNotice('客户端配置操作已完成并重新读取；请以更新后的状态为准。');
        } finally {
          setConnection(null); await state.reload();
        }
      })}>{state.busy ? '处理中…' : connection?.connected ? '确认断开并还原' : '确认写入接入配置'}</Button></div>
    </Modal>
    {update && <ClientUpdateDialog preview={update} busy={state.busy} onClose={() => setUpdate(null)} onConfirm={() => void run(async () => {
      if (!updatePreviewSupported(update)) throw new Error('请重新获取有效更新预览。');
      try {
        await state.act('/api/clients', { action: 'update', client: update.client.id, expectedRevision: update.revision, confirm: true });
        setNotice('更新命令已完成并重新读取版本；客户端不会自动重启。');
      } finally {
        setUpdate(null); await state.reload();
      }
    })} />}
  </div>;
}
