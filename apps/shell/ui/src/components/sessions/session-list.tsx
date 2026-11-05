'use client';

// The session list: filter locally, select through the URL.
//
// Selecting pushes `?session=<id>` so the detail is a server render — a link you can share,
// a reload that lands in the same place, and no client-side cache to invalidate.
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';

import { Badge, Input } from '../ui/primitives';
import { cn } from '../../lib/cn';

export interface SessionSummary {
  sessionId: string;
  agent: string;
  project: string;
  goal: string;
  status: string;
  tags: string[];
  createdAt: string | null;
  updatedAt: string | null;
  events: number;
  checkpoints: number;
  hasSummary: boolean;
}

const STATUS_TONE: Record<string, 'ok' | 'warn' | 'danger' | 'neutral'> = {
  running: 'warn',
  blocked: 'danger',
  complete: 'ok',
  completed: 'ok',
  idle: 'neutral',
};

export function SessionList({
  sessions,
  selected,
}: {
  sessions: SessionSummary[];
  selected: string | null;
}) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle.length === 0) return sessions;
    return sessions.filter((session) =>
      [session.sessionId, session.agent, session.project, session.goal, session.status]
        .join(' ')
        .toLowerCase()
        .includes(needle),
    );
  }, [sessions, query]);

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-rex-text-soft" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={`筛选 ${sessions.length} 个会话`}
          aria-label="筛选会话"
          className="h-8 pl-8 text-[12px]"
        />
      </div>

      <ul className="max-h-[520px] space-y-1 overflow-y-auto pr-1">
        {filtered.length === 0 ? (
          <li className="px-2 py-3 text-[12px] text-rex-text-muted">没有匹配的会话。</li>
        ) : (
          filtered.map((session) => {
            const active = session.sessionId === selected;
            return (
              <li key={session.sessionId}>
                <Link
                  href={`/sessions?session=${encodeURIComponent(session.sessionId)}`}
                  aria-current={active ? 'true' : undefined}
                  className={cn(
                    'block rounded-rex-sm px-2.5 py-2 transition-colors motion-reduce:transition-none',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rex-cyan',
                    active
                      ? 'bg-rex-panel-strong ring-1 ring-rex-border'
                      : 'hover:bg-rex-panel',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-rex-mono text-[11px] text-rex-text">
                      {session.sessionId}
                    </span>
                    <Badge tone={STATUS_TONE[session.status] ?? 'neutral'}>{session.status}</Badge>
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-rex-text-muted">
                    {session.goal || session.project || '（没有 goal）'}
                  </p>
                  <p className="mt-0.5 font-rex-mono text-[10px] text-rex-text-soft">
                    {String(session.updatedAt ?? '').slice(0, 16).replace('T', ' ')} · 事件{' '}
                    {session.events} · 检查点 {session.checkpoints}
                  </p>
                </Link>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}