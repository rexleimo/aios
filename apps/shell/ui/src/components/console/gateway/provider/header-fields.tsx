'use client';

import { useState } from 'react';
import { Button, Field, Input } from '../../console-ui';

export function ProviderHeaderFields({ initialValue, onChange }: {
  initialValue?: Record<string, string>;
  onChange: (headers: Record<string, string>, invalid: boolean) => void;
}) {
  const [rows, setRows] = useState(() => Object.entries(initialValue || {}));
  function update(next: [string, string][]) {
    setRows(next);
    const names = next.map(([name]) => name.trim().toLowerCase());
    const invalid = names.some(name => !name) || new Set(names).size !== names.length;
    onChange(Object.fromEntries(next.map(([name, value]) => [name.trim(), value.trim()])), invalid);
  }
  return <details className="rounded-rex-sm border border-rex-border p-3" open={rows.length > 0}>
    <summary className="cursor-pointer rounded-sm text-xs font-medium focus-visible:outline-2 focus-visible:outline-rex-cyan">自定义请求头</summary>
    <div className="mt-4 space-y-3">
      <p className="text-xs leading-5 text-rex-text-muted">用于渠道要求的额外头，例如 x-region。密钥和令牌只填 env:VARIABLE 引用；不会读取或显示实际值。无需认证模式不能配置凭据头。</p>
      {rows.map(([name, value], index) => <div key={index} className="space-y-3 rounded-rex-sm border border-rex-border p-3">
        <Field label={`请求头 ${index + 1} 名称`}><Input aria-label={`请求头 ${index + 1} 名称`} value={name} placeholder="x-region"
          onChange={event => update(rows.map((row, i) => i === index ? [event.target.value, row[1]] : row))} /></Field>
        <Field label={`请求头 ${index + 1} 值`}><Input aria-label={`请求头 ${index + 1} 值`} value={value} placeholder="region-name 或 env:CHANNEL_TOKEN"
          onChange={event => update(rows.map((row, i) => i === index ? [row[0], event.target.value] : row))} /></Field>
        <Button type="button" variant="outline" aria-label={`移除请求头 ${index + 1}`} onClick={() => update(rows.filter((_, i) => i !== index))}>移除请求头</Button>
      </div>)}
      <Button type="button" variant="outline" onClick={() => update([...rows, ['', '']])}>添加请求头</Button>
    </div>
  </details>;
}
