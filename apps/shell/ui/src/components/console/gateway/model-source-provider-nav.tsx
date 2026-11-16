'use client';

import { ChevronRight, Server } from 'lucide-react';
import { Badge, Select } from '../console-ui';
import type { RoutingProvider } from '../model-routing/use-routing-config';

export const UNASSIGNED_PROVIDER = '__unassigned__';

export function ModelSourceProviderNav({ providers, unassignedCount, activeId, onSelect }: {
  providers: (RoutingProvider & { modelCount: number })[];
  unassignedCount: number;
  activeId: string;
  onSelect: (id: string) => void;
}) {
  const options = [
    ...providers.map((provider) => ({ value: provider.id, label: `${provider.id} · ${provider.modelCount} 个模型${provider.enabled === false ? ' · 已停用' : ''}` })),
    ...(unassignedCount ? [{ value: UNASSIGNED_PROVIDER, label: `待绑定模型 · ${unassignedCount} 个` }] : []),
  ];
  return (
    <aside className="min-w-0 border-b border-rex-border bg-rex-panel/40 p-4 lg:border-r lg:border-b-0 lg:p-3">
      <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold text-rex-text-muted lg:px-2 lg:pt-2">
        <Server size={14} aria-hidden="true" />上游供应商<span aria-hidden="true" className="ml-auto font-rex-mono font-normal">{providers.length}</span>
      </h3>
      {options.length > 0 && (
        <>
          <div className="lg:hidden"><Select aria-label="选择供应商" value={activeId} onValueChange={onSelect} options={options} /></div>
          <nav aria-label="供应商列表" className="hidden space-y-1 lg:block">
            {options.map((option) => {
              const provider = providers.find((item) => item.id === option.value);
              const active = option.value === activeId;
              return (
                <button key={option.value} type="button" aria-label={`选择供应商 ${provider?.id || '待绑定模型'}`}
                  aria-current={active ? 'page' : undefined} onClick={() => onSelect(option.value)}
                  className={`w-full min-w-0 rounded-rex-sm p-3 text-left focus-visible:outline-2 focus-visible:outline-rex-cyan ${active ? 'bg-rex-bg shadow-sm ring-1 ring-rex-border' : 'hover:bg-rex-panel'}`}>
                  <span className="flex items-center gap-2">
                    <span className={`min-w-0 flex-1 break-all text-xs font-semibold ${active ? 'text-rex-cyan' : ''}`}>{provider?.id || '待绑定模型'}</span>
                    <span className="font-rex-mono text-[11px] text-rex-text-muted">{provider?.modelCount ?? unassignedCount}</span>
                    <ChevronRight size={13} className={active ? 'text-rex-cyan' : 'text-rex-text-soft'} />
                  </span>
                  {provider && <span className="mt-1.5 block truncate font-rex-mono text-[10px] leading-5 text-rex-text-muted">{provider.baseUrl.replace(/^https?:\/\//, '')}</span>}
                  {provider?.enabled === false && <Badge tone="neutral" className="mt-1">已停用</Badge>}
                </button>
              );
            })}
          </nav>
        </>
      )}
    </aside>
  );
}
