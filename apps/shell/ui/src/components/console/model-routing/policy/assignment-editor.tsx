'use client';

import { t } from '../../../../i18n/t.mjs';
import { useRef, useState } from 'react';
import { Button, Modal, Select } from '../../console-ui';
import { ROLE_LABEL } from '../labels';
import type { ModelOption } from '../intent-routing-section';
import type { RoutingController } from '../use-routing-config';
import { AssignmentResult } from './assignment-list';
import { modelLabel } from './model-label';

export type EditTarget = { role: string; clientId?: string; adding?: boolean; restore?: boolean };
export const taskLabel = (role: string) => role ? ROLE_LABEL[role] || role : t("普通对话");
const CONVERSATION = '__conversation__';

export function AssignmentEditor({ target, roles, routing, onClose, onCommit }: {
  target: EditTarget;
  roles: string[];
  routing: RoutingController;
  onClose: () => void;
  onCommit: (role: string, value: string, clientId?: string) => void;
}) {
  const { editable, models, targets } = routing;
  const initialFocus = useRef<HTMLInputElement>(null);
  const [role, setRole] = useState(target.role);
  const current = (task: string) => task
    ? target.clientId ? editable?.matrix.clients[target.clientId]?.[task] || '' : editable?.matrix.default[task] || ''
    : target.clientId ? editable?.clientDefaults[target.clientId] || '' : editable?.activeModel || '';
  const [mode, setMode] = useState(target.adding ? 'model' : target.restore || !current(role) ? 'inherit' : current(role) === 'auto' ? 'auto' : 'model');
  const [modelId, setModelId] = useState(current(role));
  const validModel = targets.some((model) => model.id === modelId);
  const inherited = routing.policyPreview(role, target.clientId, true);
  const availableRoles = ['', ...roles].filter((task) => !current(task));
  const radioClass = 'size-4 shrink-0 accent-rex-cyan';
  return (
    <Modal open initialFocus={initialFocus} onOpenChange={(open) => { if (!open) onClose(); }} title={`${target.adding ? t("添加例外") : t("修改分配")} · ${target.clientId || t("全局")}${target.adding ? '' : ` / ${taskLabel(role)}`}`} description={t("只修改共享草稿，使用页面底部「保存全部修改」写入磁盘。")}>
      <form className="space-y-5" onSubmit={(event) => { event.preventDefault(); if (mode === 'model' && !validModel) return; onCommit(role, mode === 'model' ? modelId : mode === 'auto' ? 'auto' : '', target.clientId); onClose(); }}>
        {target.adding && <label className="flex flex-col gap-2 text-xs font-medium">
          <span>{t("例外任务")}</span>
          <Select aria-label={t("例外任务")} value={role || CONVERSATION} onValueChange={(value) => { setRole(value === CONVERSATION ? '' : value); setModelId(''); setMode('model'); }} options={availableRoles.map((task) => ({ value: task || CONVERSATION, label: taskLabel(task) }))} />
        </label>}
        <fieldset className="space-y-4">
          <legend className="mb-3 text-xs font-semibold">{t("分配方式")}</legend>
          <label className="flex items-center gap-2 text-sm"><input ref={initialFocus} className={radioClass} type="radio" name="assignment-mode" value="model" checked={mode === 'model'} onChange={() => setMode('model')} />{t("指定模型")}</label>
          {mode === 'model' && <div className="space-y-2 pl-6">
            <fieldset disabled={targets.length === 0}>
              <Select aria-label={t("指定模型")} value={validModel ? modelId : ''} onValueChange={setModelId} options={[{ value: '', label: t("请选择模型或模型组") }, ...targets.map((model: ModelOption) => ({ value: model.id, label: modelLabel(model) }))]} />
            </fieldset>
            <p className="text-[11px] leading-5 text-rex-text-muted">{t("仅列出已绑定且启用的模型，以及至少有一个合资格成员的顺序模型组；未验证凭据、额度或生成可用性。")}</p>
          </div>}
          <label className="flex items-center gap-2 text-sm"><input className={radioClass} type="radio" name="assignment-mode" value="auto" checked={mode === 'auto'} onChange={() => setMode('auto')} />{t("自动选择")}</label>
          {mode === 'auto' && <p className="pl-6 text-[11px] leading-5 text-rex-text-muted">{t("保留明确的 Auto 例外，不继承较低层的固定首选；此项不提供具体模型，继续使用规则回落与全局默认。")}</p>}
          <label className="flex items-center gap-2 text-sm"><input className={radioClass} type="radio" name="assignment-mode" value="inherit" checked={mode === 'inherit'} onChange={() => setMode('inherit')} />{t("恢复继承")}</label>
          <div className="rounded-rex-md border border-rex-border bg-rex-panel/40 p-3">
            <p className="mb-2 text-xs font-medium">{t("恢复后：")}{target.clientId ? role ? t("继承全局角色规则") : t("按普通对话规则继承") : role ? t("使用角色默认与任务规则") : t("不再指定普通对话默认")}</p>
            <AssignmentResult preview={inherited} models={models} />
            {role && <p className="mt-2 text-[11px] leading-5 text-rex-text-muted">{t("运行环境的角色覆盖仍可优先；此处仅展示配置推演。")}</p>}
          </div>
        </fieldset>
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>{t("取消")}</Button>
          <Button type="submit" disabled={mode === 'model' && !validModel || !!target.adding && mode === 'inherit'}>{t("加入草稿")}</Button>
        </div>
      </form>
    </Modal>
  );
}
