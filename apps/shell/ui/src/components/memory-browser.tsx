'use client';

// Searching memory, and reading what came back.
//
// The result is the CLI's own text — not reformatted into cards. Memory entries are prose
// with ids and timestamps; a table would lose the prose and a prettified card would lose
// the id you need to act on it.
import { useState } from 'react';
import { Search, Star, X } from 'lucide-react';

import { parseMemoEntries } from '../lib/data/memory-actions.mjs';

import { Button } from './ui/button';
import { Input, Badge, Card, CardContent, CardHeader, CardTitle, CardDescription, EmptyState } from './ui/primitives';

interface MemoryResponse {
  pinned: string;
  query: string;
  results: string;
  truncated: boolean;
  error: string | null;
}

export function MemoryBrowser({
  initialPinned,
  pinBudget,
}: {
  initialPinned: string;
  pinBudget: string;
}) {
  const [query, setQuery] = useState('');
  const [pinnedOpen, setPinnedOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [supersedeFor, setSupersedeFor] = useState<string | null>(null);
  const [replacement, setReplacement] = useState('');
  const [note, setNote] = useState('');


  async function act(action: string, id: string, text?: string) {
    setBusyId(id);
    setNote('');
    try {
      const response = await fetch('/api/memory', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, id, text, confirm: true }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string; output?: string };
      if (response.ok && payload.ok) {
        setNote(action === 'memo.useful' ? '已记下：这条被标记为有用。' : '已写入新事实，旧条目不再被召回。');
        setSupersedeFor(null);
        setReplacement('');
        if (data?.query) await search(data.query);
      } else {
        setNote(`没做成：${payload.error ?? `HTTP ${response.status}`}`);
      }
    } catch (error) {
      setNote(`没做成：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusyId(null);
    }
  }
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [data, setData] = useState<MemoryResponse | null>(null);

  // 结果行本来就带 id 与时间，解析成条目后每一条才能被操作。
  const entries = data ? parseMemoEntries(data.results) : [];

  async function search(nextQuery: string) {
    setState('loading');
    try {
      const response = await fetch(`/api/memory?q=${encodeURIComponent(nextQuery)}&limit=10`);
      const payload = (await response.json()) as MemoryResponse;
      setData(payload);
      setState(payload.error ? 'error' : 'ready');
    } catch (error) {
      setData({
        pinned: initialPinned,
        query: nextQuery,
        results: '',
        truncated: false,
        error: error instanceof Error ? error.message : String(error),
      });
      setState('error');
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>搜索记忆内容</CardTitle>
          <CardDescription>
            输入关键词查真实条目，返回原文（含 id 与时间）。空查询不猜内容，只显示固定记忆。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (query.trim().length > 0) void search(query.trim());
            }}
          >
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="例如 控制台 / token / 矩阵"
              aria-label="搜索记忆"
            />
            <Button type="submit" disabled={query.trim().length === 0 || state === 'loading'}>
              <Search />
              {state === 'loading' ? '查询中…' : '搜索'}
            </Button>
          </form>

          {state === 'idle' ? null : state === 'error' ? (
            <p className="mt-3 rounded-rex-sm border border-rex-danger/30 bg-rex-danger/5 px-3 py-2 text-[12px] text-rex-danger">
              查询失败：{data?.error}
            </p>
          ) : data && data.results ? (
            <>
              <div className="mt-3 flex items-center gap-2">
                <Badge tone="info">「{data.query}」</Badge>
                <span className="text-[11px] text-rex-text-muted">
                  {entries.length} 条可操作结果
                </span>
                {data.truncated ? <Badge tone="neutral">只显示前 10 条</Badge> : null}
              </div>
              <ul className="mt-2 max-h-[460px] space-y-2 overflow-auto pr-1">
                {entries.map((entry) => (
                  <li key={entry.id} className="rounded-rex-sm border border-rex-border px-3 py-2">
                    <p className="text-[12px] leading-relaxed text-rex-text-body">{entry.text}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <span className="font-rex-mono text-[10px] text-rex-text-soft">
                        {entry.at.slice(0, 16).replace('T', ' ')}
                      </span>
                      <span className="font-rex-mono text-[10px] text-rex-text-soft">{entry.id}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={busyId === entry.id}
                        onClick={() => void act('memo.useful', entry.id)}
                      >
                        <Star />
                        这条有用
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={busyId === entry.id}
                        onClick={() => setSupersedeFor(supersedeFor === entry.id ? null : entry.id)}
                      >
                        <X />
                        这条过时了
                      </Button>
                    </div>
                    {supersedeFor === entry.id ? (
                      <form
                        className="mt-2 flex flex-col gap-1.5"
                        onSubmit={(event) => {
                          event.preventDefault();
                          void act('memo.supersede', entry.id, replacement);
                        }}
                      >
                        <textarea
                          value={replacement}
                          onChange={(event) => setReplacement(event.target.value)}
                          rows={2}
                          placeholder="写一句取代它的事实（至少 8 个字）。旧条目保留但不再被召回。"
                          className="w-full resize-y rounded-rex-sm bg-rex-bg px-2 py-1.5 text-[12px] ring-1 ring-rex-border focus-visible:outline-2 focus-visible:outline-rex-cyan"
                        />
                        <div className="flex items-center gap-2">
                          <Button type="submit" size="sm" disabled={replacement.trim().length < 8}>
                            取代它
                          </Button>
                          <span className="text-[10px] text-rex-text-soft">会写入一条新事实，旧条目失效</span>
                        </div>
                      </form>
                    ) : null}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="mt-3 text-[12px] text-rex-text-muted">没有匹配的记忆。</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            固定记忆（pin）
            <Badge tone="warn">{initialPinned.length.toLocaleString()} 字符</Badge>
            {pinBudget ? <span className="font-rex-mono text-[11px] text-rex-text-muted">{pinBudget}</span> : null}
          </CardTitle>
          <CardDescription>
            每个会话都会注入的那份事实，每一轮都占上下文——所以默认折叠，只看规模；要看内容再展开。
          </CardDescription>
        </CardHeader>
        <CardContent>
          {initialPinned.trim().length === 0 ? (
            <EmptyState title="没有固定记忆" detail="用 aios memo pin add 写入；界面上还没有编辑入口。" />
          ) : (
            <>
              <Button type="button" variant="outline" size="sm" onClick={() => setPinnedOpen((open) => !open)}>
                {pinnedOpen ? '收起' : '展开全文'}
              </Button>
              <pre
                className={
                  pinnedOpen
                    ? 'mt-2 max-h-[520px] overflow-auto rounded-rex-sm border border-rex-border bg-rex-panel px-3 py-2 font-rex-body text-[12px] leading-relaxed whitespace-pre-wrap text-rex-text-body'
                    : 'mt-2 max-h-24 overflow-hidden rounded-rex-sm border border-rex-border bg-rex-panel px-3 py-2 font-rex-body text-[12px] leading-relaxed whitespace-pre-wrap text-rex-text-body'
                }
              >
                {initialPinned}
              </pre>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}