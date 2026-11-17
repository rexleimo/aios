'use client';

import { useState } from 'react';
import { BookOpen } from 'lucide-react';
import { Badge, Button, Empty, ErrorState, Heading, Loading, Panel, Select } from '../console-ui';
import { readSkills } from './resource-client';
import { SkillActionDialog, type SkillSelection } from './skill-action-dialog';
import type { InstalledSkill, SkillInventory } from './resource-types';
import { useResourceInventory } from './use-resource-inventory';

const OWNERSHIP: Record<string, string> = { owned: 'AIOS 持有', external: '外部持有，不覆盖', conflict: '内容冲突，不覆盖',
  linked: '链接目录，请管理源', unverified: '旧安装，归属待验证', error: '读取异常' };

export function SkillsPanel() {
  const { state, refresh } = useResourceInventory(readSkills);
  const [clientFilter, setClientFilter] = useState('all');
  const [dialog, setDialog] = useState<{ inventory: SkillInventory; selection: SkillSelection } | null>(null);
  const open = (selection: SkillSelection) => { if (state.status === 'ready') setDialog({ inventory: state.data, selection }); };
  const rows = state.status === 'ready' ? state.data.skills.filter(row => clientFilter === 'all' || row.client === clientFilter) : [];
  return (
    <>
      <Heading eyebrow="SKILLS" title="技能来自哪里，落在哪些客户端。"
        description="来自 aios skill list --json；目录登记、实际落点和客户端已加载是不同事实。"
        actions={<><Button variant="outline" onClick={refresh} disabled={state.status === 'loading'}>刷新技能清单</Button>
          <Button onClick={() => open({ action: 'install' })} disabled={state.status !== 'ready'}>安装技能</Button></>} />
      <div aria-live="polite" aria-busy={state.status === 'loading'}>
        {state.status === 'loading' && <Loading label="正在读取 Skills 清单…" />}
        {state.status === 'error' && <ErrorState message={`${state.unsupported ? '当前运行时不支持技能清单：' : '技能清单读取失败：'}${state.error}`} onRetry={refresh} />}
      </div>
      {state.status === 'ready' && (
        <>
          {state.data.warnings.length > 0 && <Panel className="mb-4 p-4"><h2 className="text-sm font-semibold">清单读取警告（可能不完整）</h2>
            <ul className="mt-2 space-y-2 text-xs text-rex-orange">{state.data.warnings.map((warning, index) => <li key={index} className="break-all">{warning.path ? `${warning.path}：` : ''}{warning.reason}</li>)}</ul></Panel>}
          <Panel className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rex-border p-4">
              <h2 className="text-sm font-semibold">技能落点 · {rows.length} / {state.data.skills.length}</h2>
              <Select aria-label="按客户端筛选技能" value={clientFilter} onValueChange={setClientFilter} className="max-w-60" size="sm"
                options={[{ value: 'all', label: '全部客户端' }, ...state.data.clients.map(client => ({ value: client.id, label: client.id }))]} />
            </div>
            {rows.length === 0 ? <Empty icon={BookOpen} title="清单中没有匹配的技能落点"><p>这不表示没有可安装技能，也不能据此判断客户端是否支持技能。</p></Empty>
              : <ul className="divide-y divide-rex-border">{rows.map((row, index) => <SkillRow key={`${row.client}/${row.scope}/${row.path}/${index}`} row={row} onAction={open} />)}</ul>}
          </Panel>
          <p className="mt-4 text-xs leading-6 text-rex-text-muted">本次目录提供 {state.data.available.length} 个可选来源。清单的客户端根目录不是已安装或运行中的证明；加载状态未提供证据时显示「未知」。</p>
        </>
      )}
      {dialog && <SkillActionDialog inventory={dialog.inventory} selection={dialog.selection} onClose={() => setDialog(null)} onChanged={refresh} />}
    </>
  );
}

function SkillRow({ row, onAction }: { row: InstalledSkill; onAction: (selection: SkillSelection) => void }) {
  const manageable = ['owned', 'unverified'].includes(row.ownership);
  return (
    <li className="space-y-3 p-4 text-xs">
      <div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold">{row.name}</h3>
        <Badge>{row.client} · {row.scope === 'global' ? '用户级' : '工程级'}</Badge>
        <Badge tone={row.ownership === 'owned' ? 'info' : 'warn'}>{OWNERSHIP[row.ownership] ?? `未识别归属：${row.ownership}`}</Badge>
        <Badge>加载：{row.loaded === true ? '已加载' : row.loaded === false ? '未加载' : '未知'}</Badge>
      </div>
      <p className="break-all text-rex-text-muted">来源：{row.source || '未记录'} · 类型：{row.kind === 'builtin' ? '内置' : '外部'} · 版本：{row.version || '未记录'}</p>
      <p className="break-all font-rex-mono text-[11px] text-rex-text-muted">落点：{row.path}</p>
      <p className="text-rex-text-muted">共享此落点：{row.affectedClients.join('、') || '未记录'} · 内容指纹：{row.fingerprint ? row.fingerprint.slice(0, 12) : '未记录'}</p>
      {row.reason && <p className="break-words text-rex-orange">{row.reason}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" disabled={!manageable} onClick={() => onAction({ action: 'sync', row })} aria-label={`同步 ${row.name}（${row.client}/${row.scope}）`}>同步</Button>
        <Button variant="outline" size="sm" disabled={!manageable} onClick={() => onAction({ action: 'remove', row })} aria-label={`移除 ${row.name}（${row.client}/${row.scope}）`}>移除</Button>
        {!manageable && <span className="text-[11px] text-rex-text-muted">不受管或有冲突的目录不允许直接改写。</span>}
      </div>
    </li>
  );
}
