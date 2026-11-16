'use client';

import { Pencil, Trash2 } from 'lucide-react';
import { Badge, Button } from '../console-ui';
import type { ModelOption } from '../model-routing/intent-routing-section';

export const SOURCE_LABEL: Record<string, string> = { curated: '显式绑定', discovered: '发现', custom: '自定义' };

export function ModelSourceModelList({ models, providerId, onEdit, onRemove }: {
  models: ModelOption[];
  providerId: string;
  onEdit: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <ul aria-label={`${providerId} 模型`} className="min-w-0 divide-y divide-rex-border border-t border-rex-border lg:max-h-[560px] lg:overflow-y-auto">
      {models.map((model) => (
        <li key={model.id} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 px-4 py-4 hover:bg-rex-panel/40 sm:px-5 xl:grid-cols-[minmax(0,1fr)_minmax(120px,auto)_64px]">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="break-all text-sm font-medium">{model.label}</p>
              {model.enabled === false && <Badge tone="neutral">已停用</Badge>}
            </div>
            <p className="mt-1 break-all font-rex-mono text-[11px] leading-5 text-rex-text-muted">{model.upstreamModel || model.id}</p>
            {model.upstreamModel && model.upstreamModel !== model.id && <p className="mt-0.5 break-all text-[10px] leading-5 text-rex-text-muted">路由标识 <span className="font-rex-mono">{model.id}</span></p>}
          </div>
          <div className="col-start-1 row-start-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[11px] leading-5 text-rex-text-muted xl:col-start-2 xl:row-start-1 xl:justify-end">
            <span className="break-all">{model.protocols.join(' / ') || '未声明协议'}</span>
            <Badge tone={model.source === 'custom' ? 'info' : 'neutral'}>{SOURCE_LABEL[model.source || 'curated'] || model.source}</Badge>
          </div>
          <div className="col-start-2 row-span-2 row-start-1 flex items-start justify-end xl:col-start-3">
            {model.source === 'custom' ? (
              <>
                <Button size="icon" variant="ghost" aria-label={`编辑模型 ${model.id}`} onClick={() => onEdit(model.id)}><Pencil size={13} /></Button>
                <Button size="icon" variant="ghost" aria-label={`移除模型 ${model.id}`} onClick={() => onRemove(model.id)}><Trash2 size={13} /></Button>
              </>
            ) : <span className="pt-1 text-[11px] leading-5 text-rex-text-muted">只读</span>}
          </div>
        </li>
      ))}
    </ul>
  );
}
