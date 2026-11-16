'use client';

// magpie 式模型选择器：点击 agent 行的模型 → 弹出分组列表 → 选中即写入配置。
// 纯展示组件，不直接保存；父组件负责写入矩阵并调用 saveDocument。
import { useMemo, useState } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';
import { Badge, Button, Input, Panel } from '../console-ui';

export interface ModelOption {
  id: string;
  label: string;
}

interface ModelPickerProps {
  models: ModelOption[];
  value: string;
  onChange: (modelId: string) => void;
  placeholder?: string;
  allowClear?: boolean;
}

// 按 provider 前缀分组（id 中 "/" 前半段）；无分隔的归入「本机默认」。
function groupModels(models: ModelOption[]): { group: string; items: ModelOption[] }[] {
  const map = new Map<string, ModelOption[]>();
  for (const model of models) {
    const slash = model.id.indexOf('/');
    const group = slash > 0 ? model.id.slice(0, slash) : 'default';
    const list = map.get(group) ?? [];
    list.push(model);
    map.set(group, list);
  }
  return [...map.entries()].map(([group, items]) => ({ group, items }));
}

export function ModelPicker({ models, value, onChange, placeholder = '留空＝自动', allowClear = true }: ModelPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return models;
    return models.filter((m) => m.id.toLowerCase().includes(q) || m.label.toLowerCase().includes(q));
  }, [models, query]);

  const groups = useMemo(() => groupModels(filtered), [filtered]);
  const selected = models.find((m) => m.id === value);

  return (
    <div className="relative inline-block">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen((v) => !v)}
        className="max-w-[220px] justify-between gap-1.5"
      >
        <span className="truncate">{selected ? selected.label : placeholder}</span>
        <ChevronDown size={12} className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </Button>
      {open && (
        <div className="absolute z-30 mt-1 w-72 rounded-xl border border-rex-border bg-rex-bg shadow-lg">
          <div className="flex items-center gap-2 border-b border-rex-border p-2">
            <Search size={13} className="text-rex-text-muted" />
            <Input size="sm" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="筛选模型…" className="h-7" />
            <button type="button" onClick={() => setOpen(false)} className="text-rex-text-muted hover:text-rex-text">
              <X size={14} />
            </button>
          </div>
          <div className="max-h-64 overflow-y-auto p-1">
            {allowClear && (
              <button
                type="button"
                onClick={() => { onChange(''); setOpen(false); setQuery(''); }}
                className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs hover:bg-rex-panel ${value === '' ? 'bg-rex-panel' : ''}`}
              >
                <span className="text-rex-text-muted">{placeholder}</span>
                {value === '' && <Badge tone="info">当前</Badge>}
              </button>
            )}
            {groups.map(({ group, items }) => (
              <div key={group} className="mt-1">
                <p className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-rex-text-soft">{group}</p>
                {items.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => { onChange(m.id); setOpen(false); setQuery(''); }}
                    className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs hover:bg-rex-panel ${value === m.id ? 'bg-rex-panel' : ''}`}
                  >
                    <span className="truncate">{m.label}</span>
                    <span className="ml-2 shrink-0 text-[10px] text-rex-text-soft">{m.id}</span>
                  </button>
                ))}
              </div>
            ))}
            {filtered.length === 0 && <p className="px-2.5 py-3 text-xs text-rex-text-muted">没有匹配的模型</p>}
          </div>
        </div>
      )}
    </div>
  );
}