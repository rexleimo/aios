'use client';

// The editor for `config/host-capabilities.json`.
//
// It edits exactly three fields per client — target level, declared axes, row limits — and
// the server applies them onto the parsed document, so everything the form does not show
// survives. Save is refused without a change, shows what changed before writing, and the
// server answers 409 when the file moved under us (that is not an error to retry blindly:
// the reload is the point).
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, RotateCcw, Save } from 'lucide-react';

import { cn } from '../lib/cn';
import { Badge, Card, CardContent, CardHeader, CardTitle, Separator } from './ui/primitives';
import { Button } from './ui/button';
import { diffEditable, EDITABLE_LEVELS } from '../lib/data/host-capabilities.mjs';

interface EditableClient {
  clientId: string;
  targetLevel: string;
  capabilities: string[];
  limits: string[];
}

interface DraftClient extends EditableClient {
  limitsText: string;
}

function toDraft(clients: EditableClient[]): DraftClient[] {
  return clients.map((client) => ({ ...client, limitsText: client.limits.join('\n') }));
}

function toEditable(draft: DraftClient[]): EditableClient[] {
  return draft.map((client) => ({
    clientId: client.clientId,
    targetLevel: client.targetLevel,
    capabilities: [...client.capabilities],
    limits: client.limitsText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0),
  }));
}

export function SettingsEditor({
  initial,
  axes,
  hash,
  configPath,
}: {
  initial: EditableClient[];
  axes: string[];
  hash: string;
  configPath: string;
}) {
  const router = useRouter();
  const [baseline] = useState<DraftClient[]>(() => toDraft(initial));
  const [draft, setDraft] = useState<DraftClient[]>(() => toDraft(initial));
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [message, setMessage] = useState<string>('');

  const changes = useMemo(
    () => diffEditable(toEditable(baseline), toEditable(draft)),
    [baseline, draft],
  );

  function update(clientId: string, patch: Partial<DraftClient>) {
    setDraft((previous) =>
      previous.map((client) => (client.clientId === clientId ? { ...client, ...patch } : client)),
    );
    setState('idle');
    setMessage('');
  }

  function toggleAxis(clientId: string, axis: string) {
    setDraft((previous) =>
      previous.map((client) => {
        if (client.clientId !== clientId) return client;
        const has = client.capabilities.includes(axis);
        return {
          ...client,
          capabilities: has
            ? client.capabilities.filter((item) => item !== axis)
            : [...client.capabilities, axis],
        };
      }),
    );
    setState('idle');
    setMessage('');
  }

  async function save() {
    setState('saving');
    setMessage('');
    try {
      const response = await fetch('/api/config/host-capabilities', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ editable: toEditable(draft), expectedHash: hash }),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        detail?: string;
        changed?: Array<{ clientId: string; fields: string[] }>;
        backup?: string | null;
        rolledBackTo?: string;
      };
      if (response.ok && payload.ok) {
        const changedText = (payload.changed ?? [])
          .map((item) => `${item.clientId}(${item.fields.join('/')})`)
          .join('、');
        setState('saved');
        setMessage(
          `已保存：${changedText || '无改动'}` + (payload.backup ? ` · 备份 ${payload.backup}` : ''),
        );
        router.refresh();
        return;
      }
      if (response.status === 409) {
        setState('error');
        setMessage('文件已被改动（hash 不匹配）。刷新后会读到最新内容，请重新编辑。');
        return;
      }
      setState('error');
      setMessage(
        `${payload.error ?? `HTTP ${response.status}`}：${payload.detail ?? ''}` +
          (payload.rolledBackTo ? `（已回滚到 ${payload.rolledBackTo}）` : ''),
      );
    } catch (error) {
      setState('error');
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-rex-md border border-rex-border bg-rex-panel px-4 py-2.5">
        <span className="font-rex-mono text-[11px] text-rex-text-muted">{configPath}</span>
        {changes.length === 0 ? (
          <Badge tone="neutral">未修改</Badge>
        ) : (
          changes.map((change) => (
            <Badge key={change.clientId} tone="warn">
              {change.clientId} · {change.fields.join('/')}
            </Badge>
          ))
        )}
        <div className="ml-auto flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={changes.length === 0 || state === 'saving'}
            onClick={() => {
              setDraft(toDraft(baseline));
              setState('idle');
              setMessage('');
            }}
          >
            <RotateCcw />
            撤销
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={changes.length === 0 || state === 'saving'}
            onClick={() => void save()}
          >
            <Save />
            {state === 'saving' ? '保存中…' : '保存'}
          </Button>
        </div>
      </div>

      {state === 'error' ? (
        <div className="flex items-start gap-2 rounded-rex-md border border-rex-danger/30 bg-rex-danger/5 px-4 py-2.5">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-rex-danger" />
          <p className="text-[12px] leading-relaxed text-rex-danger">{message}</p>
        </div>
      ) : null}
      {state === 'saved' ? (
        <p className="rounded-rex-md border border-rex-green/30 bg-rex-green/5 px-4 py-2.5 text-[12px] text-rex-green">
          {message}
        </p>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-2">
        {draft.map((client) => (
          <Card key={client.clientId}>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="font-rex-mono text-[12px]">{client.clientId}</CardTitle>
              <label className="flex items-center gap-2 text-[11px] text-rex-text-muted">
                目标等级
                <select
                  value={client.targetLevel}
                  onChange={(event) => update(client.clientId, { targetLevel: event.target.value })}
                  className="rounded-rex-sm bg-rex-bg px-1.5 py-1 text-[11px] text-rex-text ring-1 ring-rex-border focus-visible:outline-2 focus-visible:outline-rex-cyan"
                >
                  {EDITABLE_LEVELS.map((level) => (
                    <option key={level} value={level}>
                      {level}
                    </option>
                  ))}
                </select>
              </label>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1.5">
                {axes.map((axis) => {
                  const declared = client.capabilities.includes(axis);
                  return (
                    <button
                      key={axis}
                      type="button"
                      aria-pressed={declared}
                      onClick={() => toggleAxis(client.clientId, axis)}
                      className={cn(
                        'rounded-full px-2 py-0.5 font-rex-mono text-[10px] transition-colors motion-reduce:transition-none',
                        'focus-visible:outline-2 focus-visible:outline-rex-cyan',
                        declared
                          ? 'bg-rex-cyan text-white'
                          : 'bg-rex-panel-strong text-rex-text-muted hover:bg-rex-panel',
                      )}
                    >
                      {axis}
                    </button>
                  );
                })}
              </div>
              <Separator className="my-3" />
              <label className="block text-[11px] text-rex-text-muted">
                行级限制（每行一条，原样写入）
                <textarea
                  value={client.limitsText}
                  onChange={(event) => update(client.clientId, { limitsText: event.target.value })}
                  rows={2}
                  placeholder="未声明限制"
                  className="mt-1 w-full resize-y rounded-rex-sm bg-rex-bg px-2 py-1.5 font-rex-mono text-[11px] text-rex-text ring-1 ring-rex-border focus-visible:outline-2 focus-visible:outline-rex-cyan"
                />
              </label>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}