'use client';

import { t } from '../../../i18n/t.mjs';
import { useState } from 'react';
import { Badge, Panel, SmallTitle } from '../console-ui';
import { IntentRoutingSection } from './intent-routing-section';
import { ROLES } from './labels';
import type { RoutingController } from './use-routing-config';
import { AssignmentRow } from './policy/assignment-list';
import { AssignmentEditor, taskLabel, type EditTarget } from './policy/assignment-editor';
import { ClientExceptions } from './policy/client-exceptions';
import { PolicyTools } from './policy/policy-tools';
import { GroupsSection } from './groups/groups-section';

const TASKS = [t("默认分配"), t("客户端例外"), t("意图分流"), t("模型组")] as const;

export function RoutingConfigPanel({ routing }: { routing: RoutingController }) {
  const [task, setTask] = useState<(typeof TASKS)[number]>(t("默认分配"));
  const [editing, setEditing] = useState<EditTarget | null>(null);
  const { editable, models, setEditable } = routing;
  if (!editable) return null;
  const roles = [...new Set([...ROLES, ...Object.keys(editable.matrix.default), ...Object.values(editable.matrix.clients).flatMap(Object.keys)])];
  const setModel = (role: string, value: string, clientId?: string) => setEditable((previous) => {
    if (!previous) return previous;
    if (!role) {
      if (!clientId) return { ...previous, activeModel: value };
      const clientDefaults = { ...previous.clientDefaults };
      if (value) clientDefaults[clientId] = value;
      else delete clientDefaults[clientId];
      return { ...previous, clientDefaults };
    }
    const assignments = { ...(clientId ? previous.matrix.clients[clientId] : previous.matrix.default) };
    if (value) assignments[role] = value;
    else delete assignments[role];
    const matrix = clientId ? { ...previous.matrix, clients: { ...previous.matrix.clients, [clientId]: assignments } } : { ...previous.matrix, default: assignments };
    return { ...previous, matrix };
  });
  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-lg font-semibold tracking-tight">{t("模型分配")}</h2><p className="mt-1 text-xs leading-6 text-rex-text-muted">{t("先确定默认，再处理例外。所有分区共用一份草稿。")}</p></div>
      <PolicyTools routing={routing} />
    </div>
    <nav aria-label={t("模型分配任务")} className="flex flex-wrap gap-1 rounded-rex-md border border-rex-border bg-rex-panel/50 p-1">
      {TASKS.map((name) => <button key={name} type="button" aria-current={task === name ? 'page' : undefined} onClick={() => setTask(name)} className={`min-w-0 flex-1 rounded-rex-sm px-3 py-2.5 text-xs font-medium focus-visible:outline-2 focus-visible:outline-rex-cyan ${task === name ? 'bg-rex-bg text-rex-text shadow-sm' : 'text-rex-text-muted hover:bg-rex-bg/60'}`}>{name}{name === t("意图分流") && <span aria-hidden="true" className="ml-1 text-[10px] text-rex-text-muted">{t("可选")}</span>}</button>)}
    </nav>
    {models.length === 0 && <Panel className="border-rex-orange/30 p-5"><h3 className="text-sm font-semibold">{t("尚无可路由模型")}</h3><p className="mt-2 text-xs leading-6 text-rex-text-muted">{t("请先在「供应商与模型」添加来源，再发现模型或手动填写真实上游 ID。")}</p></Panel>}
    <div hidden={task !== t("默认分配")}>
      <Panel className="p-5 sm:p-6">
        <SmallTitle action={<Badge tone="neutral">{t("配置推演")}</Badge>}>{t("默认分配")}</SmallTitle>
        <p className="mb-5 text-xs leading-6 text-rex-text-muted">{t("展示当前草稿的结果与来源，不代表运行中的网关已加载，也不代表生成可用。普通对话与角色任务使用不同规则。")}</p>
        <ul aria-label={t("全局默认分配")} className="divide-y divide-rex-border">
          {['', ...roles].map((role) => <AssignmentRow key={role} label={taskLabel(role)} preview={routing.policyPreview(role)} models={models} disabled={models.length === 0 && !(role ? editable.matrix.default[role] : editable.activeModel)} onEdit={() => setEditing({ role })} />)}
        </ul>
      </Panel>
    </div>
    <div hidden={task !== t("客户端例外")}><ClientExceptions routing={routing} roles={roles} onEdit={setEditing} /></div>
    <div hidden={task !== t("意图分流")}><IntentRoutingSection value={editable.intentRouting} models={models} targets={routing.targets} onChange={(intentRouting) => setEditable((previous) => previous ? { ...previous, intentRouting } : previous)} /></div>
    <div hidden={task !== t("模型组")}><GroupsSection routing={routing} /></div>
    <details className="rounded-rex-md border border-rex-border px-4 py-3 text-xs">
      <summary className="cursor-pointer font-medium focus-visible:outline-2 focus-visible:outline-rex-cyan">{t("规则与生效范围")}</summary>
      <div className="mt-3 space-y-2 leading-6 text-rex-text-muted">
        <p>{t("普通对话：若已有空角色默认 / 无角色任务规则，先取其中首选，再尝试客户端普通对话例外 → 规则回落 → 全局普通对话默认。未配置这些旧规则时，客户端例外直接继承全局默认；不隐式使用 general 规则。未显式选择模型组且只有一个合资格模型时可直接使用，多模型不猜选目录第一项。")}</p>
        <p>{t("角色任务：运行环境覆盖 → 客户端角色例外 → 全局角色指定 → 角色默认 / 任务规则。只取最高层首选；首选失效后走任务规则的回落列表，再尝试普通对话全局默认，不重新逐层继承。")}</p>
        <p>{t("意图分流仅处理未指定角色的普通对话，将分类目标置于候选前面。候选仍需启用且显式绑定，模型与供应商需有兼容协议；网关按请求协议翻译。凭据缺失或上游失败不承诺自动换模型或生成成功。")}</p>
        <p>{t("自动选择不同于恢复继承：明确的 Auto 覆盖不继承较低层的固定首选，也不提供具体候选，继续使用规则回落与全局默认。模型组按成员顺序路由；选中组不可用时停止，不静默改用其他固定目标。跨成员仅在派发前资格检查跳过或上游明确返回 401 / 402 / 429 时尝试。")}</p>
        <p>{t("此处推演不读取运行环境覆盖、凭据或额度。保存只写磁盘，运行中的网关需要重启加载；实际选择请查看请求记录。")}</p>
      </div>
    </details>
    {editing && <AssignmentEditor key={`${editing.clientId || 'global'}:${editing.role}:${editing.restore}`} target={editing} roles={roles} routing={routing} onClose={() => setEditing(null)} onCommit={setModel} />}
  </div>;
}
