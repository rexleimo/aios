'use client';

import { t } from '../../../i18n/t.mjs';
import { useState } from 'react';
import { Button, Field, Input, Modal, Select } from '../console-ui';
import { canApplyPreview, runSkillAction } from './resource-client';
import { SkillResults } from './skill-results';
import type { InstalledSkill, SkillAction, SkillActionReport, SkillInventory, SkillRequest, SkillScope } from './resource-types';

export interface SkillSelection { action: SkillAction; row?: InstalledSkill }
const ACTION_LABELS = { install: t("安装"), sync: t("同步"), remove: t("移除") };

export function SkillActionDialog({ inventory, selection, onClose, onChanged }: {
  inventory: SkillInventory;
  selection: SkillSelection;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { action, row } = selection;
  const [mode, setMode] = useState('catalog');
  const [catalogIndex, setCatalogIndex] = useState('');
  const [name, setName] = useState('');
  const [source, setSource] = useState('');
  const [scope, setScope] = useState<SkillScope>(row?.scope ?? 'global');
  const [clients, setClients] = useState<string[]>(row ? [row.client] : []);
  const [preview, setPreview] = useState<{ request: SkillRequest; report: SkillActionReport } | null>(null);
  const [result, setResult] = useState<SkillActionReport | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [running, setRunning] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const available = mode === 'catalog' && catalogIndex !== '' ? inventory.available[Number(catalogIndex)] : undefined;
  const request: SkillRequest = { resource: 'skills', action, name: row?.name ?? (mode === 'catalog' ? available?.name ?? '' : name.trim()),
    kind: row?.kind ?? available?.kind ?? 'external', scope, clients,
    ...(!row && mode === 'external' ? { source: source.trim() } : {}) };
  const eligible = inventory.clients.filter(client => !available || available.clients.includes(client.id));
  const valid = /^[a-z0-9][a-z0-9._-]{0,127}$/iu.test(request.name) && clients.length > 0
    && clients.every(id => eligible.some(client => client.id === id))
    && (!available || available.scopes.includes(scope))
    && (Boolean(row) || mode === 'catalog' && Boolean(available) || mode === 'external' && source.trim().length > 0
      && source.trim().length <= 2048 && !source.trim().startsWith('-'));

  function invalidate() {
    setPreview(null);
    setResult(null);
    setConfirmed(false);
    setFailure(null);
  }

  async function previewAction() {
    if (!valid || running) return;
    setRunning(true);
    invalidate();
    try { setPreview({ request, report: await runSkillAction(request) }); }
    catch (error) { setFailure(error instanceof Error ? error.message : String(error)); }
    finally { setRunning(false); }
  }

  async function applyAction() {
    if (!preview || !confirmed || !canApplyPreview(preview.report) || running) return;
    setRunning(true);
    setFailure(null);
    setConfirmed(false);
    // Consume the preview even on a transport failure: a write may have partly applied.
    const approved = preview;
    setPreview(null);
    try { setResult(await runSkillAction(approved.request, approved.report)); }
    catch (error) { setFailure(t("{value0} 请刷新清单并重新预览，勿重复提交旧预览。", { value0: error instanceof Error ? error.message : String(error) })); }
    finally { setRunning(false); onChanged(); }
  }

  return (
    <Modal open onOpenChange={open => { if (!open && !running) onClose(); }} title={t("{value0}技能", { value0: ACTION_LABELS[action] })}
      description={t("先读取真实 dry-run 落点、归属与共享客户端，再明确确认写入。任何目标或来源变化都需要重新预览。")} wide>
      <fieldset disabled={running} className="space-y-4">
        {row ? (
          <div className="space-y-1 break-words text-sm">
            <p className="font-medium">{row.name} · {row.client} · {row.scope === 'global' ? t("用户级") : t("工程级")}</p>
            <p className="break-all text-xs text-rex-text-muted">{t("来源：")}{row.source || t("未记录")}  {t("· 类型：")}{row.kind === 'builtin' ? t("内置") : t("外部")}</p>
            <p className="break-all text-xs text-rex-text-muted">{t("落点：")}{row.path}</p>
            <p className="text-xs text-rex-text-muted">{t("共享此落点的客户端：")}{row.affectedClients.join('、') || t("未记录")}{t("。移除只处理所选落点，不删除源技能。")}</p>
          </div>
        ) : (
          <>
            <Field label={t("技能来源")}>
              <Select aria-label={t("技能来源")} value={mode} onValueChange={value => { invalidate(); setMode(value); setClients([]); }}
                options={[{ value: 'catalog', label: t("内置目录 / 已登记外部技能") }, { value: 'external', label: t("新的外部来源") }]} />
            </Field>
            {mode === 'catalog' ? (
              <Field label={t("已登记技能")} hint={t("仅显示本次清单返回的目录项；客户端与范围以该条目声明为准。")}>
                <Select aria-label={t("已登记技能")} value={catalogIndex} onValueChange={value => { invalidate(); setCatalogIndex(value); setClients([]); }}
                  options={[{ value: '', label: t("请选择技能") }, ...inventory.available.map((entry, index) => ({ value: String(index),
                    label: `${entry.name}（${entry.kind === 'builtin' ? t("内置") : t("外部")}）` }))]} />
              </Field>
            ) : (
              <>
                <Field label={t("技能名称")}><Input aria-label={t("技能名称")} value={name} onChange={event => { invalidate(); setName(event.target.value); }} /></Field>
                <Field label={t("外部来源路径或 Git URL")} hint={t("外部来源预览可能读取目录或拉取 Git 仓库；请勿填写密钥或带凭据的 URL。")}>
                  <Input aria-label={t("外部来源路径或 Git URL")} value={source} onChange={event => { invalidate(); setSource(event.target.value); }} />
                </Field>
              </>
            )}
            {available && <p className="break-all text-xs leading-5 text-rex-text-muted">{available.description}<br />{t("来源：")}{available.source}  {t("· 版本：")}{available.version || t("未记录")}</p>}
            <Field label={t("安装范围")}>
              <Select aria-label={t("安装范围")} value={scope} onValueChange={value => { invalidate(); setScope(value as SkillScope); setClients([]); }}
                options={[{ value: 'global', label: t("用户级") }, { value: 'project', label: t("当前工程") }]} />
            </Field>
            {available && !available.scopes.includes(scope) && <p role="status" className="text-xs text-rex-danger">{t("该技能未声明支持此范围，请更换范围。")}</p>}
            <fieldset className="space-y-2">
              <legend className="mb-2 text-sm font-medium">{t("目标客户端（显式选择）")}</legend>
              {eligible.map(client => (
                <label key={client.id} className="flex items-start gap-2 text-xs">
                  <input type="checkbox" checked={clients.includes(client.id)} className="mt-0.5 accent-rex-cyan"
                    onChange={event => { invalidate(); setClients(current => event.target.checked ? [...current, client.id] : current.filter(id => id !== client.id)); }} />
                  <span>{client.id}<span className="mt-1 block break-all text-rex-text-muted">{client.roots[scope]}</span></span>
                </label>
              ))}
              {eligible.length === 0 && <p className="text-xs text-rex-text-muted">{t("清单未返回兼容的客户端，不能安装。")}</p>}
            </fieldset>
          </>
        )}
        <Button variant="outline" onClick={previewAction} disabled={!valid || running}>{running ? t("正在处理…") : t("生成预览")}</Button>
      </fieldset>
      <div className="mt-5 space-y-4" aria-busy={running}>
        {failure && <p role="alert" className="break-words text-xs leading-5 text-rex-danger">{failure}</p>}
        {preview && <SkillResults report={preview.report} preview />}
        {result && <SkillResults report={result} preview={false} />}
        {preview && canApplyPreview(preview.report) && (
          <>
            <label className="flex items-start gap-2 text-xs leading-5">
              <input type="checkbox" checked={confirmed} disabled={running} className="mt-1 accent-rex-cyan" onChange={event => setConfirmed(event.target.checked)} />
              
              {t("我已核对预览，确认修改以上落点（包括共享此落点的客户端）")}
            </label>
            <Button onClick={applyAction} disabled={!confirmed || running}>{t("确认")}{ACTION_LABELS[action]}</Button>
          </>
        )}
        <p className="text-[11px] leading-5 text-rex-text-muted">{t("写入不等于客户端已加载。外部持有、链接或改动冲突由现有 CLI 安全规则拒绝，不提供强制覆盖。")}</p>
        <Button variant="ghost" onClick={onClose} disabled={running}>{t("关闭")}</Button>
      </div>
    </Modal>
  );
}
