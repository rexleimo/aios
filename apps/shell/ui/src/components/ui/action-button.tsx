'use client';

// ActionButton — the visible half of `/api/actions/<id>`.
//
// Three things it must do and one it must not:
//   1. Ask before a mutating action, on screen (not a native dialog that a screenshot
//      cannot show and a keyboard user cannot style).
//   2. Stream the command's output as it arrives, so a 14-second `aios doctor` is visibly
//      working instead of a frozen button.
//   3. On success, re-read the page (`router.refresh()`), because "done" has to mean the
//      numbers changed, not that the button went back to its idle text.
// It must not swallow a failure: a non-zero exit prints the exit code and stays open.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Play } from 'lucide-react';

import { cn } from '../../lib/cn';
import { Button } from './button';

export interface ActionButtonProps {
  actionId: string;
  label: string;
  client?: string;
  confirm?: boolean;
  variant?: 'default' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'default' | 'sm';
  className?: string;
}

interface Frame {
  event: string;
  data: Record<string, unknown>;
}

/** Parse `event: x\ndata: {...}\n\n` frames out of a byte stream. */
async function* readFrames(response: Response): AsyncGenerator<Frame> {
  const reader = response.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary = buffer.indexOf('\n\n');
    while (boundary >= 0) {
      const raw = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      let event = 'message';
      const dataLines: string[] = [];
      for (const line of raw.split('\n')) {
        if (line.startsWith('event: ')) event = line.slice(7).trim();
        else if (line.startsWith('data: ')) dataLines.push(line.slice(6));
      }
      if (dataLines.length > 0) {
        try {
          yield { event, data: JSON.parse(dataLines.join('\n')) as Record<string, unknown> };
        } catch {
          yield { event, data: { chunk: dataLines.join('\n') } };
        }
      }
      boundary = buffer.indexOf('\n\n');
    }
  }
}

export function ActionButton({
  actionId,
  label,
  client,
  confirm = false,
  variant = 'secondary',
  size = 'sm',
  className,
}: ActionButtonProps) {
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'confirming' | 'running' | 'done' | 'error'>('idle');
  const [output, setOutput] = useState<string[]>([]);
  const [exitCode, setExitCode] = useState<number | null>(null);

  async function run() {
    setState('running');
    setOutput([]);
    setExitCode(null);
    try {
      const response = await fetch(`/api/actions/${actionId}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ client, confirm: true }),
      });
      if (!response.ok || !response.body) {
        const detail = await response.text();
        setOutput([`请求被拒（${response.status}）：${detail}`]);
        setState('error');
        return;
      }
      for await (const frame of readFrames(response)) {
        if (frame.event === 'stdout' || frame.event === 'stderr') {
          const chunk = String(frame.data.chunk ?? '');
          setOutput((previous) => {
            const lines = `${previous.join('')}${chunk}`.split('\n');
            // Keep the tail: a long command's useful lines are the last ones.
            return lines.slice(-200);
          });
        } else if (frame.event === 'result') {
          const code = Number(frame.data.exitCode ?? 1);
          const ok = frame.data.ok === true;
          setExitCode(code);
          setState(ok ? 'done' : 'error');
          // non-zero can still be a successful run: `aios status` exits 1 for "blocked".
          if (ok) router.refresh();
        } else if (frame.event === 'error') {
          setOutput((previous) => [...previous, String(frame.data.message ?? 'unknown error')]);
          setState('error');
        }
      }
    } catch (error) {
      setOutput((previous) => [
        ...previous,
        error instanceof Error ? error.message : String(error),
      ]);
      setState('error');
    }
  }

  const busy = state === 'running';

  return (
    <div className={cn('flex flex-col items-start gap-2', className)}>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant={state === 'confirming' ? 'danger' : variant}
          size={size}
          disabled={busy}
          onClick={() => {
            if (confirm && state === 'idle') {
              setState('confirming');
              return;
            }
            void run();
          }}
        >
          {busy ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <Play />}
          {state === 'confirming' ? '确认执行（写主目录）' : label}
        </Button>
        {state === 'confirming' ? (
          <Button type="button" variant="ghost" size={size} onClick={() => setState('idle')}>
            取消
          </Button>
        ) : null}
        {busy ? <span className="text-[11px] text-rex-text-muted">执行中…</span> : null}
        {state === 'done' ? (
          <span className="text-[11px] text-rex-green">
            完成{exitCode !== null && exitCode !== 0 ? `（退出码 ${exitCode}：判定为 blocked）` : '，已刷新'}
          </span>
        ) : null}
        {state === 'error' && exitCode !== null ? (
          <span className="text-[11px] text-rex-danger">退出码 {exitCode}</span>
        ) : null}
      </div>

      {output.length > 0 ? (
        <pre className="max-h-56 w-full overflow-auto rounded-rex-sm border border-rex-border bg-rex-panel px-3 py-2 font-rex-mono text-[11px] leading-relaxed whitespace-pre-wrap text-rex-text-body">
          {output.join('\n')}
        </pre>
      ) : null}
    </div>
  );
}
