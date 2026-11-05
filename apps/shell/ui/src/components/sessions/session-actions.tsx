'use client';

// 会话详情的两个动作：导出（下载 JSON）、删除（移到回收站，可恢复）。
//
// 删除是两步的：点一次变成"确认删除"，再点才发请求；成功后把回收站路径显示出来——
// 一句看不到去处的"已删除"和白删没有区别。
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download, Trash2 } from 'lucide-react';

import { Button } from '../ui/button';

export function SessionActions({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'confirming' | 'busy' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function trash() {
    setState('busy');
    try {
      const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'trash', confirm: true }),
      });
      const payload = (await response.json()) as { ok?: boolean; trashedTo?: string; detail?: string };
      if (response.ok && payload.ok) {
        setState('done');
        setMessage(`已移到回收站：${payload.trashedTo}（移回来即可恢复）`);
        router.push('/sessions');
        router.refresh();
        return;
      }
      setState('error');
      setMessage(payload.detail ?? `HTTP ${response.status}`);
    } catch (error) {
      setState('error');
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-2">
        <Button asChild variant="outline" size="sm">
          <a href={`/api/sessions/${encodeURIComponent(sessionId)}/export`}>
            <Download />
            导出
          </a>
        </Button>
        <Button
          type="button"
          variant={state === 'confirming' ? 'danger' : 'ghost'}
          size="sm"
          disabled={state === 'busy' || state === 'done'}
          onClick={() => {
            if (state === 'confirming') {
              void trash();
              return;
            }
            setState('confirming');
            setMessage('再点一次确认：会话会移到 sessions-trash/，可恢复');
          }}
        >
          <Trash2 />
          {state === 'confirming' ? '确认删除' : '删除'}
        </Button>
      </div>
      {message ? (
        <p
          className={
            state === 'error'
              ? 'max-w-[420px] text-right text-[11px] text-rex-danger'
              : 'max-w-[420px] text-right text-[11px] text-rex-text-muted'
          }
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
