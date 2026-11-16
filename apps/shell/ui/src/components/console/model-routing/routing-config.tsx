'use client';

import { useState } from 'react';
import { ArrowDown, RotateCcw } from 'lucide-react';
import { Badge, Button, Modal, Panel, Select, SmallTitle } from '../console-ui';
import { IntentRoutingSection } from './intent-routing-section';
import { ROLES, ROLE_LABEL } from './labels';
import type { RoutingController } from './use-routing-config';
import { RoutingProfiles } from '../gateway/routing-profiles';

const CLIENTS = [
  'claude',
  'codex',
  'pi',
  'opencode',
  'gemini',
  'hermes',
  'grok',
  'workbuddy',
  'zcode',
  'qoder',
];

export function RoutingConfigPanel({ routing }: { routing: RoutingController }) {
  const { editable, models, setEditable, auto } = routing;
  const [clientId, setClientId] = useState('claude');
  const [resetClient, setResetClient] = useState(false);
  if (!editable) return null;
  const options = models.map((model) => ({ value: model.id, label: `${model.label} · ${model.id}` }));
  const clients = [...new Set([...CLIENTS, ...Object.keys(editable.matrix.clients)])];
  const isAvailable = (value: string) => models.some((model) => model.id === value);
  const setModel = (role: string, value: string, client?: string) =>
    setEditable((previous) => {
      if (!previous) return previous;
      const matrix = client
        ? {
            ...previous.matrix,
            clients: {
              ...previous.matrix.clients,
              [client]: { ...previous.matrix.clients[client], [role]: value },
            },
          }
        : { ...previous.matrix, default: { ...previous.matrix.default, [role]: value } };
      return { ...previous, matrix };
    });

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">选择规则，而不是猜测结果。</h2>
        <p className="mt-1 text-xs leading-6 text-rex-text-muted">
          角色任务按覆盖规则选择；普通对话可启用意图分类。所有修改统一保存。
        </p>
      </div>
      {models.length === 0 && <Panel className="border-rex-orange/30 p-5">
        <h3 className="text-sm font-semibold">尚无可路由模型</h3>
        <p className="mt-2 text-xs leading-6 text-rex-text-muted">网关可以启动监听，但尚未具备模型访问能力。请先在「供应商与模型」添加来源，再发现模型或手动填写真实上游 ID。未绑定的内置模板与旧引用不会成为策略候选。</p>
      </Panel>}
      <Panel className="bg-rex-panel/40 p-5">
        <SmallTitle>请求如何选择模型</SmallTitle>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-rex-md border border-rex-border bg-rex-bg p-4">
            <Badge tone="info">显式角色任务</Badge>
            <p className="mt-3 text-xs leading-6 text-rex-text-body">
              客户端角色覆盖 → 全局角色覆盖 → 已绑定模型自动策略
            </p>
            <p className="mt-1 text-[11px] leading-5 text-rex-text-muted">
              留空表示继承下一层。不会额外调用分类器。
            </p>
          </div>
          <div className="rounded-rex-md border border-rex-border bg-rex-bg p-4">
            <Badge tone="neutral">普通对话</Badge>
            <p className="mt-3 text-xs leading-6 text-rex-text-body">
              启用意图分类 → 对应模型；未启用或分类失败 → 默认路由
            </p>
            <p className="mt-1 text-[11px] leading-5 text-rex-text-muted">
              只有一个可用模型时直接路由，无需分类器。多模型需显式默认或角色策略，不会猜选目录第一项；启用分类会额外产生调用与费用。
            </p>
          </div>
        </div>
      </Panel>
      <Panel className="p-5 sm:p-6">
        <SmallTitle action={<Badge tone="neutral">{ROLES.length} 个角色</Badge>}>全局角色默认</SmallTitle>
        <p className="mb-5 text-xs leading-5 text-rex-text-muted">
          自动策略只在已显式绑定且协议兼容的模型中选择；只覆盖需要固定的角色。
        </p>
        <div className="divide-y divide-rex-border">
          {ROLES.map((role) => {
            const value = editable.matrix.default[role] || '';
            const automatic = auto.find((item) => item.role === role)?.autoModelId;
            return (
              <div
                key={role}
                className="grid items-center gap-3 py-3 first:pt-0 last:pb-0 sm:grid-cols-[110px_minmax(0,1fr)]"
              >
                <div className="flex items-center gap-2 text-xs font-medium">
                  {ROLE_LABEL[role]}
                  {value && <span className="size-1.5 rounded-full bg-rex-cyan" aria-label="有覆盖" />}
                </div>
                <fieldset disabled={models.length === 0} className="min-w-0">
                  <Select
                    aria-label={`${ROLE_LABEL[role]}全局模型`}
                    value={isAvailable(value) ? value : ''}
                    onValueChange={(next) => setModel(role, next)}
                    options={[
                      {
                        value: '',
                        label: `自动策略${automatic && isAvailable(automatic) ? ` · ${models.find((item) => item.id === automatic)?.label}` : models.length === 1 ? ` · ${models[0].label}` : models.length === 0 ? ' · 无可用模型' : ' · 未配置默认路由'}`,
                      },
                      ...options,
                    ]}
                  />
                  {value && !isAvailable(value) && <p className="mt-1 text-[11px] text-rex-text-muted">保留旧引用 {value}，当前不可路由；不会列为新选择。</p>}
                </fieldset>
              </div>
            );
          })}
        </div>
      </Panel>
      <Panel className="p-5 sm:p-6">
        <SmallTitle
          action={
            <Select
              size="sm"
              aria-label="选择覆盖客户端"
              className="w-32"
              value={clientId}
              onValueChange={setClientId}
              options={clients.map((id) => ({ value: id, label: id }))}
            />
          }
        >
          客户端角色覆盖
        </SmallTitle>
        <p className="mb-5 text-xs leading-5 text-rex-text-muted">
          只影响所选客户端，优先于全局角色默认。切换客户端不会丢失草稿。
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          {ROLES.map((role) => {
            const value = editable.matrix.clients[clientId]?.[role] || '';
            return (
              <label key={role} className="min-w-0 space-y-2">
                <span className="block text-xs font-medium">{ROLE_LABEL[role]}</span>
                <fieldset disabled={models.length === 0} className="min-w-0">
                <Select
                  aria-label={`${clientId} ${ROLE_LABEL[role]}模型`}
                  value={isAvailable(value) ? value : ''}
                  onValueChange={(next) => setModel(role, next, clientId)}
                  options={[{ value: '', label: '继承全局默认 / 自动策略' }, ...options]}
                />
                {value && !isAvailable(value) && <p className="mt-1 text-[11px] text-rex-text-muted">保留旧引用 {value}，当前不可路由。</p>}
                </fieldset>
              </label>
            );
          })}
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-rex-border pt-4">
          <p className="text-[11px] text-rex-text-muted">
            已覆盖 {Object.values(editable.matrix.clients[clientId] || {}).filter(Boolean).length} /{' '}
            {ROLES.length} 个角色
          </p>
          <Button
            size="sm"
            variant="outline"
            disabled={!Object.values(editable.matrix.clients[clientId] || {}).some(Boolean)}
            onClick={() => setResetClient(true)}
          >
            <RotateCcw size={13} />
            清除此客户端覆盖
          </Button>
        </div>
      </Panel>
      <IntentRoutingSection
        value={editable.intentRouting}
        models={models}
        onChange={(intentRouting) =>
          setEditable((previous) => (previous ? { ...previous, intentRouting } : previous))
        }
      />
      <RoutingProfiles
        matrix={editable.matrix}
        modelIds={models.map((model) => model.id)}
        onApply={(matrix) => setEditable((previous) => (previous ? { ...previous, matrix } : previous))}
      />
      {editable.routingGroups.length > 0 && (
        <Panel className="p-5">
          <SmallTitle action={<Badge tone="warn">尚未接入调度</Badge>}>已有路由组</SmallTitle>
          <p className="text-xs leading-6 text-rex-text-muted">
            当前网关尚未消费路由组配置。这里保留已有数据，不提供会让人误以为已生效的轮询、权重或成本调度开关。
          </p>
          <ul className="mt-3 space-y-2">
            {editable.routingGroups.map((group) => (
              <li key={group.id} className="flex flex-wrap gap-2 text-xs">
                <span className="font-medium">{group.id}</span>
                <ArrowDown size={12} className="text-rex-text-muted" />
                <span className="break-all text-rex-text-muted">{group.models.join(' / ') || '无模型'}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
      <Modal
        open={resetClient}
        onOpenChange={setResetClient}
        title={`清除 ${clientId} 的角色覆盖？`}
        description="该客户端将恢复继承全局默认或自动策略。先修改草稿，保存全部修改后才会生效。"
      >
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setResetClient(false)}>
            取消
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              setEditable((previous) => {
                if (!previous) return previous;
                const next = { ...previous.matrix.clients };
                delete next[clientId];
                return { ...previous, matrix: { ...previous.matrix, clients: next } };
              });
              setResetClient(false);
            }}
          >
            清除覆盖
          </Button>
        </div>
      </Modal>
    </div>
  );
}
