'use client';

import { useState } from 'react';
import { ChevronDown, GripVertical } from 'lucide-react';
import { clientLabel, landingTokenLabel, NON_CLIENT_HOSTS, type ConsoleFacts } from '../../../lib/console-facts';
import { Badge, Button, Heading, Modal, Panel, Select } from '../console-ui';
import { ClientUpdateDialog, type UpdatePreview } from './client-update-dialog';
import { useClientManagement, type ClientConnection, type ClientInstallation } from './use-client-management';
import { connectionMutationBlocked, connectionSummary, installationSummary, updatePreviewSupported } from './client-management-model.mjs';
import { AgentProfiles } from './agent-profiles';
import { ClientLogo } from './client-logo';

const CONNECTABLE = new Set(['claude', 'codex', 'pi']);
const sourceLabel = (source: ClientInstallation['source']) => typeof source === 'string' ? source : source?.label || source?.kind || '来源未知';

export function ClientManagement({ facts, onDetails }: { facts: ConsoleFacts; onDetails: (id: string) => void }) {
  const state = useClientManagement();
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showRest, setShowRest] = useState(false);
  const [notice, setNotice] = useState('');
  const [failure, setFailure] = useState('');
  const [update, setUpdate] = useState<UpdatePreview | null>(null);
  const [connection, setConnection] = useState<{ id: string; connected: boolean; target: string; port: number; revision: string | null } | null>(null);
  const ids = [...new Set([...facts.clients.map(c => c.clientId), ...state.installations.map(c => c.id)])].filter(id => !NON_CLIENT_HOSTS.has(id));
  const run = (operation: () => Promise<void>) => {
    setFailure(''); setNotice('');
    return operation().catch((error: unknown) => setFailure(error instanceof Error ? error.message : String(error)));
  };
  const previewUpdate = (client: ClientInstallation) => run(async () => {
    const result = await state.act('/api/clients', { action: 'preview-update', client: client.id });
    if (!result.preview || result.preview.client !== client.id) throw new Error('更新预览与所选客户端不一致。');
    setUpdate({ ...result.preview, client });
  });

  const upgradable = state.installations.filter(c => c.update?.supported === true);
  const configured = ids.filter(id => {
    const installed = state.installations.find(c => c.id === id);
    const gateway = state.gateway?.clients?.find(c => c.client === id);
    return installed?.installed === true || gateway?.connected === true;
  });
  const rest = ids.filter(id => !configured.includes(id));
  const visibleIds = showRest ? ids : configured;

  const renderRow = (id: string) => {
    const fact = facts.clients.find(c => c.clientId === id);
    const installed = state.installations.find(c => c.id === id);
    const gateway = state.gateway?.clients?.find(c => c.client === id) as ClientConnection | undefined;
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
    if (target && !options.some(o => o.value === target)) options.push({ value: target, label: `${target} · 当前引用未在目录中` });
    const isOpen = expanded === id;
    const currentLabel = options.find(o => o.value === current)?.label || current;
    const version = installed?.version || (installed?.installed === true ? '版本未读到' : '');
    const statusText = connected
      ? `已接入 · ${currentLabel}${nativeSupported ? ' · 客户端自带模型列表' : ''}`
      : (installed?.installed === true ? `未接入 · 用 ${clientLabel(id).name} 自己的设置` : '未接入 · 本机未检测到程序');

    const applyTarget = (value: string) => {
      setSelected(prev => ({ ...prev, [id]: value }));
      if (state.gateway) setConnection({ id, connected, target: value, port: state.gateway.port, revision: state.targetRevision });
    };
    const switchButton = (
      <button type="button" role="switch" aria-label={`${clientLabel(id).name} 接入网关`} aria-checked={connected}
        disabled={state.loading || state.busy || !supported || unsafeConnection || !state.gateway || !connected && (!state.gateway.running || !state.gateway.ready || !state.targetRevision)}
        onClick={(event) => { event.stopPropagation(); if (state.gateway) setConnection({ id, connected, target, port: state.gateway.port, revision: state.targetRevision }); }}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rex-cyan disabled:opacity-40 ${connected ? 'bg-rex-cyan' : 'bg-rex-border'}`}>
        <span aria-hidden="true" className={`h-5 w-5 rounded-full bg-rex-bg transition-transform motion-reduce:transition-none ${connected ? 'translate-x-5' : 'translate-x-0.5'}`} />
      </button>
    );

    return <div key={id} className="min-w-0">
      <div className="flex w-full min-w-0 items-center gap-3 px-4 py-3 sm:px-5">
        <button type="button" aria-label={`${clientLabel(id).name} 详情`} aria-expanded={isOpen} onClick={() => setExpanded(isOpen ? null : id)} className="flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-2 focus-visible:outline-rex-cyan">
          {isOpen ? <GripVertical size={14} className="shrink-0 text-rex-text-muted" /> : <ClientLogo id={id} />}
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2"><span className="truncate text-sm font-medium">{clientLabel(id).name}</span>{version && <span className="text-[11px] text-rex-text-muted">{version}</span>}{installed?.update?.supported === true && <Badge tone="warn">有新版本</Badge>}</span>
            <span className="block truncate text-[11px] text-rex-text-muted">{statusText}</span>
          </span>
        </button>
        <div className="hidden w-56 shrink-0 sm:block" onClick={e => e.stopPropagation()}>
          <Select aria-label={`${clientLabel(id).name} 模型`} value={target} onValueChange={applyTarget} options={options} disabled={state.loading || state.busy || state.targets.length === 0} />
        </div>
        {connected ? <Badge tone="ok">已接入</Badge> : <Badge tone="neutral">未接入</Badge>}
        {switchButton}
        <button type="button" aria-label={`${clientLabel(id).name} ${isOpen ? '收起' : '展开'}详情`} onClick={() => setExpanded(isOpen ? null : id)} className="shrink-0 rounded p-1 focus-visible:outline-2 focus-visible:outline-rex-cyan"><ChevronDown size={16} className={`text-rex-text-muted transition-transform duration-150 motion-reduce:transition-none ${isOpen ? 'rotate-180' : ''}`} /></button>
      </div>

      <div hidden={!isOpen} className="px-4 pb-4 sm:px-5">
        <div className="mb-3 sm:hidden" onClick={e => e.stopPropagation()}>
          <Select aria-label={`${clientLabel(id).name} 默认目标`} value={target} onValueChange={value => setSelected(prev => ({ ...prev, [id]: value }))} options={options} disabled={!supported || state.loading || state.busy || state.targets.length === 0} />
        </div>
        <dl className="grid min-w-0 gap-x-5 gap-y-3 text-xs sm:grid-cols-[auto_minmax(0,1fr)]">
          <dt className="text-rex-text-muted">默认目标</dt>
          <dd className="min-w-0 space-y-2">
            <span className="break-all">{currentLabel}</span>
            <p className="leading-6 text-rex-text-muted">{nativeSupported ? '客户端自行选择保留接入，只清除固定目标，与断开还原不同。' : nativeReason || '选模型即写入客户端配置；Auto 使用模型分配。'}</p>
            {connected && target !== current && <Button size="sm" variant="outline" disabled={state.loading || state.busy || unsafeConnection || !state.gateway?.ready || !state.targetRevision} onClick={() => state.gateway && setConnection({ id, connected: false, target, port: state.gateway.port, revision: state.targetRevision })}>应用默认目标</Button>}
          </dd>
          <dt className="text-rex-text-muted">程序安装 / 版本</dt>
          <dd className="break-all">{installed ? installationSummary(installed) : '安装信息未读到'}{installed?.installed === true && <span className="ml-2"><Badge tone="neutral">{sourceLabel(installed.source)}</Badge></span>}{installed?.executable && <p className="mt-1 font-rex-mono text-[11px] text-rex-text-muted">{installed.executable.path}{installed.executable.realPath !== installed.executable.path ? ` → ${installed.executable.realPath}` : ''}</p>}</dd>
          <dt className="text-rex-text-muted">网关连接</dt>
          <dd>{!supported ? '此客户端尚无安全接入适配器' : connectionSummary(gateway)}{supported && unsafeConnection && <p className="mt-1 text-rex-danger">请先检查配置及恢复记录，刷新后再操作；不会用未知状态覆盖现有配置。</p>}</dd>
          {gateway && <><dt className="text-rex-text-muted">恢复记录</dt><dd>{({ available: '有可用恢复记录', pending: '上次操作待恢复，请先检查', none: '无恢复记录', unknown: '恢复记录无法验证' } as Record<string, string>)[gateway.recovery?.status || 'unknown']}{gateway.ownership?.status === 'unowned' && ' · 当前配置不由 AIOS 持有'}</dd></>}
          <dt className="text-rex-text-muted">配置落点</dt>
          <dd className="break-all">{fact ? `${fact.scopes.length} 个落点 · ${fact.configFiles.length} 个已发现文件` : '未读到配置落点'}<span className="ml-2 text-rex-text-muted">配置存在不代表程序已安装</span></dd>
          {fact && fact.landingTokens.length > 0 && <><dt className="text-rex-text-muted">落点验证</dt><dd><ul className="space-y-1">{fact.landingTokens.map(entry => <li key={entry.scope}>{entry.scope}：{landingTokenLabel(entry.token).label}</li>)}</ul></dd></>}
        </dl>
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-rex-border pt-4">
          <Button size="sm" variant="outline" disabled={!fact} onClick={() => onDetails(id)}>配置详情</Button>
          <Button size="sm" variant="outline" disabled={state.busy || !installed?.update?.supported} onClick={() => installed && void previewUpdate(installed)}>预览客户端更新</Button>
          {connected && <Button size="sm" variant="danger" onClick={() => state.gateway && setConnection({ id, connected: true, target, port: state.gateway.port, revision: state.targetRevision })}>断开并还原</Button>}
          {installed && !installed.update?.supported && <p className="min-w-0 text-[11px] leading-5 text-rex-text-muted">{installed.update?.reason || '此安装来源尚无受支持的更新方式。'}</p>}
        </div>
      </div>
    </div>;
  };

  return <div className="space-y-5">
    <Heading eyebrow="AGENT CLIENTS" title="Agent 客户端" description="打开「接入」后，网关的模型会作为可选项出现在 agent 的模型列表里；也可在此直接选模型。点开查看配置落点与版本细节。" actions={<Button variant="outline" disabled={state.loading || state.busy} onClick={() => void state.reload()}>刷新客户端状态</Button>} />
    {state.loading && <p role="status" className="text-xs text-rex-text-muted">正在读取客户端安装、网关与模型目录…</p>}
    {Object.entries(state.errors).map(([label, error]) => <p key={label} role="alert" className="text-xs leading-6 text-rex-danger">{label}未读到：{error}</p>)}
    {failure && <p role="alert" className="text-xs leading-6 text-rex-danger">{failure}</p>}
    {notice && <p role="status" className="text-xs leading-6 text-rex-cyan">{notice}</p>}
    {upgradable.length > 0 && <div className="flex flex-wrap items-center justify-between gap-3 rounded-rex-md border border-rex-orange/30 bg-rex-orange/5 px-4 py-2.5 text-xs text-rex-text-body"><span>{upgradable.length} 个 Agent 有新版本：{upgradable.map(c => clientLabel(c.id).name).join('、')}</span><Button size="sm" variant="outline" onClick={() => upgradable.forEach(c => void previewUpdate(c))}>全部更新</Button></div>}
    {ids.length === 0 && !state.loading && <Panel className="p-5 text-sm">没有读到客户端条目，请检查上方读取结果。</Panel>}

    <Panel className="divide-y divide-rex-border overflow-hidden">
      {visibleIds.map(renderRow)}
      {rest.length > 0 && <div className="flex items-center justify-between px-4 py-2.5 sm:px-5">
        <button type="button" onClick={() => setShowRest(!showRest)} className="flex items-center gap-1.5 text-xs text-rex-text-muted hover:text-rex-text focus-visible:outline-2 focus-visible:outline-rex-cyan">
          显示其余 {rest.length} 个 <ChevronDown size={14} className={`transition-transform ${showRest ? 'rotate-180' : ''}`} />
        </button>
        <span className="text-[11px] text-rex-text-muted">管理安装与显示</span>
      </div>}
    </Panel>

    <Panel className="flex flex-wrap items-center justify-between gap-3 p-4 text-xs">
      <span className="text-rex-text-muted">安装其他 Agent · 插件中还有更多</span>
      <span className="text-rex-text-muted">可发现的客户端来自本机安装；插件提供的条目由插件系统接入。</span>
    </Panel>

    <AgentProfiles selected={selected} onApply={(targets) => { setSelected(prev => ({ ...prev, ...targets })); setNotice('已载入方案目标，点各客户端「应用默认目标」写入配置。'); }} />

    <Modal open={connection !== null} title={connection?.connected ? '断开并还原客户端配置？' : '写入客户端网关配置？'} description={connection?.connected ? '只还原此客户端由 AIOS 持有且未被人工修改的配置，不停止网关服务。' : `将使用当前网关端口 ${connection?.port || '未知'}，默认目标 ${connection?.target || 'auto'}。实际写入前会重新检查状态；已有备份与漂移保护继续生效。`} onOpenChange={open => { if (!open && !state.busy) setConnection(null); }}>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" disabled={state.busy} onClick={() => setConnection(null)}>取消</Button>
        <Button disabled={state.busy} onClick={() => {
          const pending = connection;
          if (!pending || !state.gateway) return;
          void run(async () => {
            if (!pending.connected && !pending.revision) throw new Error('请刷新模型目录后重新确认接入。');
            await state.act('/api/model-routing/gateway', { action: pending.connected ? 'disconnect' : 'connect', client: pending.id, ...(pending.connected ? {} : { port: pending.port, target: pending.target, expectedRevision: pending.revision }), confirm: true });
            setSelected(prev => { const next = { ...prev }; delete next[pending.id]; return next; });
            setNotice('客户端配置操作已完成并重新读取；请以更新后的状态为准。');
          }).finally(() => { setConnection(null); void state.reload(); });
        }}>{state.busy ? '处理中…' : connection?.connected ? '确认断开并还原' : '确认写入接入配置'}</Button>
      </div>
    </Modal>
    {update && <ClientUpdateDialog preview={update} busy={state.busy} onClose={() => setUpdate(null)} onConfirm={() => void run(async () => {
      if (!updatePreviewSupported(update)) throw new Error('请重新获取有效更新预览。');
      await state.act('/api/clients', { action: 'update', client: update.client.id, expectedRevision: update.revision, confirm: true });
      setNotice('更新命令已完成并重新读取版本；客户端不会自动重启。');
    })} />}
  </div>;
}
