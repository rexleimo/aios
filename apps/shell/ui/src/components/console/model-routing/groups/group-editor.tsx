'use client';

import { useRef, useState } from 'react';
import { Button, Input, Modal, Select } from '../../console-ui';
import type { ModelOption } from '../intent-routing-section';
import type { RoutingGroup } from '../use-routing-config';
import { modelLabel } from '../policy/model-label';

export function GroupEditor({ group, groups, models, onCommit, onClose }: {
  group: RoutingGroup | null;
  groups: RoutingGroup[];
  models: ModelOption[];
  onCommit: (group: RoutingGroup) => void;
  onClose: () => void;
}) {
  const initialFocus = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<RoutingGroup>(group ? { ...group, models: [...group.models] } : { id: '', models: [], routing: 'ordered' });
  const [member, setMember] = useState('');
  const id = group ? group.id : draft.id.trim().toLowerCase();
  const error = !id ? '请填写模型组 ID。' : !group && groups.some((item) => item.id.trim().toLowerCase() === id) ? '模型组 ID 已存在。' : '';
  const eligible = models.filter((model) => !draft.models.includes(model.id));
  const move = (index: number, offset: number) => {
    const members = [...draft.models];
    [members[index], members[index + offset]] = [members[index + offset], members[index]];
    setDraft({ ...draft, models: members });
  };
  return <Modal open title={group ? `编辑模型组 · ${group.id}` : '新建模型组'} description='只修改共享草稿，使用底部「保存全部修改」写入磁盘。成员是具体模型，不支持嵌套组。' initialFocus={initialFocus} onOpenChange={(open) => { if (!open) onClose(); }}>
    <form className='min-w-0 space-y-5' onSubmit={(event) => { event.preventDefault(); if (!error) { onCommit({ ...draft, id }); onClose(); } }}>
      <label className='block space-y-2 text-xs font-medium'><span>模型组 ID</span><Input ref={initialFocus} aria-label='模型组 ID' value={draft.id} readOnly={!!group} onChange={(event) => setDraft({ ...draft, id: event.target.value })} /></label>
      {group && <p className='text-xs leading-6 text-rex-text-muted'>已有 ID 保持不变，避免引用与历史元数据失联。需要新 ID 时请新建模型组并明确更新分配。</p>}
      {error && <p role='status' className='text-xs text-rex-orange'>{error}</p>}
      <label className='flex items-center gap-2 text-xs'><input type='checkbox' className='size-4 accent-rex-cyan' checked={draft.enabled !== false} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} />启用模型组</label>
      <div className='space-y-2 text-xs leading-6'>
        <p>路由方式：{draft.routing === 'smart' ? '顺序（兼容旧 smart）' : draft.routing === 'ordered' ? '顺序' : `保留旧模式 ${draft.routing}（不可分配）`}</p>
        {!['ordered', 'smart'].includes(draft.routing) && <Button type='button' variant='outline' onClick={() => setDraft({ ...draft, routing: 'ordered' })}>改用顺序路由</Button>}
        <p className='text-rex-text-muted'>按列表顺序使用合资格成员；不实现权重、轮询或成本优选。跨成员仅在派发前资格检查跳过或上游明确返回 401 / 402 / 429 时尝试，不承诺通用故障重试。</p>
      </div>
      <div className='space-y-3'>
        <h3 className='text-xs font-semibold'>成员顺序</h3>
        {draft.models.length === 0 ? <p className='text-xs leading-6 text-rex-text-muted'>空模型组可以保留，但至少有一个启用且显式绑定的成员后才能分配。</p> : <ol aria-label='模型组成员' className='space-y-3'>
          {draft.models.map((modelId, index) => {
            const model = models.find((item) => item.id === modelId);
            return <li key={`${modelId}:${index}`} className='min-w-0 space-y-2 rounded-rex-sm border border-rex-border p-3'>
              <p className='break-words text-xs leading-6 [overflow-wrap:anywhere]'>{index + 1}. {model ? modelLabel(model) : `${modelId}（当前不可选；保留已有成员）`}</p>
              <div className='flex flex-wrap gap-2'>
                <Button type='button' size='sm' variant='outline' aria-label={`上移成员 ${index + 1}`} disabled={index === 0} onClick={() => move(index, -1)}>上移</Button>
                <Button type='button' size='sm' variant='outline' aria-label={`下移成员 ${index + 1}`} disabled={index === draft.models.length - 1} onClick={() => move(index, 1)}>下移</Button>
                <Button type='button' size='sm' variant='ghost' aria-label={`移除成员 ${index + 1}`} onClick={() => setDraft({ ...draft, models: draft.models.filter((_, i) => i !== index) })}>移除</Button>
              </div>
            </li>;
          })}
        </ol>}
        <div className='flex min-w-0 flex-wrap gap-2'>
          <div className='min-w-0 flex-1'><Select aria-label='添加模型组成员' value={member} onValueChange={setMember} options={[{ value: '', label: '选择具体模型' }, ...eligible.map((model) => ({ value: model.id, label: modelLabel(model) }))]} /></div>
          <Button type='button' variant='outline' disabled={!eligible.some((model) => model.id === member)} onClick={() => { setDraft({ ...draft, models: [...draft.models, member] }); setMember(''); }}>添加成员</Button>
        </div>
      </div>
      <div className='flex flex-wrap justify-end gap-2'><Button type='button' variant='outline' onClick={onClose}>取消</Button><Button type='submit' disabled={!!error}>加入草稿</Button></div>
    </form>
  </Modal>;
}
