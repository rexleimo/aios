'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Badge, Button, Modal, Panel, Select, SmallTitle } from '../../console-ui';
import type { RoutingController } from '../use-routing-config';
import { AssignmentRow } from './assignment-list';
import { taskLabel, type EditTarget } from './assignment-editor';

const CLIENTS = ['claude', 'codex', 'pi', 'opencode', 'gemini', 'hermes', 'grok', 'workbuddy', 'zcode', 'qoder'];

export function ClientExceptions({ routing, roles, onEdit }: { routing: RoutingController; roles: string[]; onEdit: (target: EditTarget) => void }) {
  const [clientId, setClientId] = useState('claude');
  const [reset, setReset] = useState(false);
  const { editable, models, setEditable } = routing;
  if (!editable) return null;
  const clients = [...new Set([...CLIENTS, ...Object.keys(editable.clientDefaults), ...Object.keys(editable.matrix.clients)])];
  const entries = [
    ...(editable.clientDefaults[clientId] ? [''] : []),
    ...Object.keys(editable.matrix.clients[clientId] || {}).filter((role) => editable.matrix.clients[clientId][role]),
  ];
  const available = ['', ...roles].filter((role) => !entries.includes(role));
  return (
    <Panel className="p-5 sm:p-6">
      <SmallTitle action={<Badge tone="neutral">{entries.length} 个例外</Badge>}>客户端例外</SmallTitle>
      <div className="mb-5 grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <label className="block min-w-0 space-y-2 text-xs font-medium"><span>选择客户端</span>
          <Select aria-label="选择例外客户端" value={clientId} onValueChange={setClientId} options={clients.map((id) => ({ value: id, label: id }))} />
        </label>
        <Button variant="outline" size="sm" disabled={models.length === 0 || available.length === 0} onClick={() => onEdit({ role: available[0], clientId, adding: true })}><Plus size={14} />添加例外</Button>
      </div>
      <p className="mb-5 text-xs leading-6 text-rex-text-muted">只列出该客户端明确指定的差异。普通对话与角色任务各自继承，不混用优先级；与当前默认相同的指定也仍是例外。</p>
      {entries.length === 0 ? <div className="rounded-rex-md border border-dashed border-rex-border p-5">
        <h3 className="text-sm font-semibold">全部继承</h3>
        <p className="mt-2 text-xs leading-6 text-rex-text-muted">{clientId} 的普通对话按默认规则继承（含已有无角色规则），角色任务继承全局角色规则。需要不同时，再添加例外。</p>
      </div> : <ul aria-label="客户端例外分配" className="divide-y divide-rex-border">
        {entries.map((role) => <AssignmentRow key={role} label={taskLabel(role)} clientId={clientId} preview={routing.policyPreview(role, clientId)} models={models} onEdit={() => onEdit({ role, clientId })} onRestore={() => onEdit({ role, clientId, restore: true })} />)}
      </ul>}
      {entries.length > 0 && <div className="mt-5 flex justify-end border-t border-rex-border pt-4"><Button variant="ghost" size="sm" onClick={() => setReset(true)}>恢复此客户端全部继承</Button></div>}
      <Modal open={reset} onOpenChange={setReset} title={`恢复 ${clientId} 的全部继承？`} description="移除该客户端的普通对话与角色例外，分别恢复普通对话默认规则和全局角色规则。已有无角色规则仍参与普通对话路由。只更新草稿，不影响其他客户端。">
        <div className="flex flex-wrap justify-end gap-2"><Button variant="outline" onClick={() => setReset(false)}>取消</Button><Button variant="danger" onClick={() => {
          setEditable((previous) => {
            if (!previous) return previous;
            const clientDefaults = { ...previous.clientDefaults };
            const clients = { ...previous.matrix.clients };
            delete clientDefaults[clientId]; delete clients[clientId];
            return { ...previous, clientDefaults, matrix: { ...previous.matrix, clients } };
          });
          setReset(false);
        }}>确认恢复继承</Button></div>
      </Modal>
    </Panel>
  );
}
