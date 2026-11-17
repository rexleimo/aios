'use client';

import { useRef, useState } from 'react';
import { Badge, Button, Modal, Panel, SmallTitle } from '../../console-ui';
import { serializeTargetRef } from '../../../../lib/config/model-routing.mjs';
import type { RoutingController, RoutingGroup } from '../use-routing-config';
import { GroupEditor } from './group-editor';

export function GroupsSection({ routing }: { routing: RoutingController }) {
  const [editing, setEditing] = useState<{ group: RoutingGroup | null } | null>(null);
  const [removing, setRemoving] = useState<RoutingGroup | null>(null);
  const cancelDelete = useRef<HTMLButtonElement>(null);
  const { editable, models, targets, setEditable } = routing;
  if (!editable) return null;
  const ref = (id: string) => serializeTargetRef({ kind: 'group', id });
  const references = removing ? routing.targetReferences(ref(removing.id)) : [];
  return <Panel className='min-w-0 p-4 sm:p-6'>
    <SmallTitle action={<Button type='button' variant='outline' onClick={() => setEditing({ group: null })}>新建模型组</Button>}>模型组</SmallTitle>
    <p className='mb-5 text-xs leading-6 text-rex-text-muted'>将具体模型按顺序组合为一个分配目标。成员顺序参与路由；分类器仍只能选择具体模型。空组与旧的未支持模式可保留，但不能新增分配。</p>
    {editable.routingGroups.length === 0 ? <p className='text-xs leading-6 text-rex-text-muted'>尚无模型组。新建后可在默认分配、客户端例外和意图规则中选择。</p> : <ul aria-label='模型组' className='divide-y divide-rex-border'>
      {editable.routingGroups.map((group) => {
        const eligible = targets.some((target) => target.id === ref(group.id));
        const mode = group.routing === 'smart' ? '顺序（兼容旧 smart）' : group.routing === 'ordered' ? '顺序' : `保留旧模式 ${group.routing}`;
        return <li key={group.id} aria-label={`模型组 ${group.id}`} className='min-w-0 space-y-3 py-4'>
          <div className='flex flex-wrap items-center gap-2'><h3 className='break-words text-sm font-semibold [overflow-wrap:anywhere]'>{group.id}</h3><Badge tone={eligible ? 'info' : 'neutral'}>{eligible ? '可分配' : '不可新增分配'}</Badge></div>
          <p className='break-words text-xs leading-6 text-rex-text-muted [overflow-wrap:anywhere]'>{mode}{group.enabled === false ? ' · 已停用' : ''} · {group.models.join(' → ') || '无成员'}</p>
          <div className='flex flex-wrap gap-2'><Button type='button' size='sm' variant='outline' onClick={() => setEditing({ group })}>编辑</Button><Button type='button' size='sm' variant='ghost' onClick={() => setRemoving(group)}>删除</Button></div>
        </li>;
      })}
    </ul>}
    {editing && <GroupEditor group={editing.group} groups={editable.routingGroups} models={models} onClose={() => setEditing(null)} onCommit={(group) => setEditable((previous) => previous ? { ...previous, routingGroups: editing.group ? previous.routingGroups.map((row) => row.id === editing.group?.id ? group : row) : [...previous.routingGroups, group] } : previous)} />}
    <Modal open={!!removing} title={`删除模型组 · ${removing?.id || ''}`} description='仅修改共享草稿，不会删除成员模型。存在引用时须先清除引用，不能静默改写分配。' initialFocus={cancelDelete} onOpenChange={(open) => { if (!open) setRemoving(null); }}>
      {references.length > 0 && <div role='status' className='mb-5 space-y-2 text-xs leading-6'><p>此模型组仍被使用，请先修改以下引用：</p><ul className='list-inside list-disc'>{references.map((path) => <li key={path} className='break-words [overflow-wrap:anywhere]'>{path}</li>)}</ul></div>}
      <div className='flex flex-wrap justify-end gap-2'><Button ref={cancelDelete} type='button' variant='outline' onClick={() => setRemoving(null)}>取消</Button><Button type='button' variant='danger' disabled={references.length > 0} onClick={() => { setEditable((previous) => previous ? { ...previous, routingGroups: previous.routingGroups.filter((row) => row.id !== removing?.id) } : previous); setRemoving(null); }}>确认删除</Button></div>
    </Modal>
  </Panel>;
}
