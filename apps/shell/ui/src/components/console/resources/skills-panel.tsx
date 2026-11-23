'use client';

import { t } from '../../../i18n/t.mjs';
import { useState } from 'react';
import { BookOpen } from 'lucide-react';
import { Badge, Button, Empty, ErrorState, Heading, Loading, Panel, Select } from '../console-ui';
import { readSkills } from './resource-client';
import { SkillActionDialog, type SkillSelection } from './skill-action-dialog';
import type { InstalledSkill, SkillInventory } from './resource-types';
import { useResourceInventory } from './use-resource-inventory';

const OWNERSHIP: Record<string, string> = { owned: t("AIOS 持有"), external: t("外部持有，不覆盖"), conflict: t("内容冲突，不覆盖"),
  linked: t("链接目录，请管理源"), unverified: t("旧安装，归属待验证"), error: t("读取异常") };

export function SkillsPanel() {
  const { state, refresh } = useResourceInventory(readSkills);
  const [clientFilter, setClientFilter] = useState('all');
  const [dialog, setDialog] = useState<{ inventory: SkillInventory; selection: SkillSelection } | null>(null);
  const open = (selection: SkillSelection) => { if (state.status === 'ready') setDialog({ inventory: state.data, selection }); };
  const rows = state.status === 'ready' ? state.data.skills.filter(row => clientFilter === 'all' || row.client === clientFilter) : [];
  return (
    <>
      <Heading eyebrow="SKILLS" title={t("技能来自哪里，落在哪些客户端。")}
        description={t("来自 aios skill list --json；目录登记、实际落点和客户端已加载是不同事实。")}
        actions={<><Button variant="outline" onClick={refresh} disabled={state.status === 'loading'}>{t("刷新技能清单")}</Button>
          <Button onClick={() => open({ action: 'install' })} disabled={state.status !== 'ready'}>{t("安装技能")}</Button></>} />
      <div aria-live="polite" aria-busy={state.status === 'loading'}>
        {state.status === 'loading' && <Loading label={t("正在读取 Skills 清单…")} />}
        {state.status === 'error' && <ErrorState message={`${state.unsupported ? t("当前运行时不支持技能清单：") : t("技能清单读取失败：")}${state.error}`} onRetry={refresh} />}
      </div>
      {state.status === 'ready' && (
        <>
          {state.data.warnings.length > 0 && <Panel className="mb-4 p-4"><h2 className="text-sm font-semibold">{t("清单读取警告（可能不完整）")}</h2>
            <ul className="mt-2 space-y-2 text-xs text-rex-orange">{state.data.warnings.map((warning, index) => <li key={index} className="break-all">{warning.path ? `${warning.path}：` : ''}{warning.reason}</li>)}</ul></Panel>}
          <Panel className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rex-border p-4">
              <h2 className="text-sm font-semibold">{t("技能落点 ·")} {rows.length} / {state.data.skills.length}</h2>
              <Select aria-label={t("按客户端筛选技能")} value={clientFilter} onValueChange={setClientFilter} className="max-w-60" size="sm"
                options={[{ value: 'all', label: t("全部客户端") }, ...state.data.clients.map(client => ({ value: client.id, label: client.id }))]} />
            </div>
            {rows.length === 0 ? <Empty icon={BookOpen} title={t("清单中没有匹配的技能落点")}><p>{t("这不表示没有可安装技能，也不能据此判断客户端是否支持技能。")}</p></Empty>
              : <ul className="divide-y divide-rex-border">{rows.map((row, index) => <SkillRow key={`${row.client}/${row.scope}/${row.path}/${index}`} row={row} onAction={open} />)}</ul>}
          </Panel>
          <p className="mt-4 text-xs leading-6 text-rex-text-muted">{t("本次目录提供")} {state.data.available.length}  {t("个可选来源。清单的客户端根目录不是已安装或运行中的证明；加载状态未提供证据时显示「未知」。")}</p>
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
        <Badge>{row.client} · {row.scope === 'global' ? t("用户级") : t("工程级")}</Badge>
        <Badge tone={row.ownership === 'owned' ? 'info' : 'warn'}>{OWNERSHIP[row.ownership] ?? t("未识别归属：{value0}", { value0: row.ownership })}</Badge>
        <Badge>{t("加载：")}{row.loaded === true ? t("已加载") : row.loaded === false ? t("未加载") : t("未知")}</Badge>
      </div>
      <p className="break-all text-rex-text-muted">{t("来源：")}{row.source || t("未记录")}  {t("· 类型：")}{row.kind === 'builtin' ? t("内置") : t("外部")}  {t("· 版本：")}{row.version || t("未记录")}</p>
      <p className="break-all font-rex-mono text-[11px] text-rex-text-muted">{t("落点：")}{row.path}</p>
      <p className="text-rex-text-muted">{t("共享此落点：")}{row.affectedClients.join('、') || t("未记录")}  {t("· 内容指纹：")}{row.fingerprint ? row.fingerprint.slice(0, 12) : t("未记录")}</p>
      {row.reason && <p className="break-words text-rex-orange">{row.reason}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" disabled={!manageable} onClick={() => onAction({ action: 'sync', row })} aria-label={t("同步 {value0}（{value1}/{value2}）", { value0: row.name, value1: row.client, value2: row.scope })}>{t("同步")}</Button>
        <Button variant="outline" size="sm" disabled={!manageable} onClick={() => onAction({ action: 'remove', row })} aria-label={t("移除 {value0}（{value1}/{value2}）", { value0: row.name, value1: row.client, value2: row.scope })}>{t("移除")}</Button>
        {!manageable && <span className="text-[11px] text-rex-text-muted">{t("不受管或有冲突的目录不允许直接改写。")}</span>}
      </div>
    </li>
  );
}
