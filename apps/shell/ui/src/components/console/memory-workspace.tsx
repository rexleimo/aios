'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  CircleDashed,
  FileText,
  FolderSearch,
  Gauge,
  Search,
  ShieldCheck,
} from 'lucide-react';

import { MEMO_SCOPE_LABELS, type ConsoleFacts, type FactMemory } from '../../lib/console-facts';
import { Badge, Button, Empty, Field, Heading, Modal, fieldClass } from './console-ui';
import { MemoryDetail } from './flows/memory-detail';
import { ProjectButton } from './flows/project-button';

/** 列表上的筛选片：每一个都对应 events.jsonl 里真实存在的字段值，不是造出来的分类。 */
const FACETS: Array<[string, string, (memory: FactMemory) => boolean]> = [
  ['all', '全部', () => true],
  ['checkpoint', '里程碑', (memory) => memory.checkpoint],
  ['verified', '已验证', (memory) => memory.claimStatus === 'verified'],
  ['unclaimed', '未标注', (memory) => memory.claimStatus === null],
  ['shared', '项目内共享', (memory) => memory.scope === 'project_shared'],
  ['private', '仅本代理', (memory) => memory.scope === 'agent_private'],
];

export function MemoryWorkspace({
  facts,
  target,
}: {
  facts: ConsoleFacts;
  target: { id: string; nonce: number };
}) {
  const [space, setSpace] = useState('all');
  const [facet, setFacet] = useState('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(facts.memories[0]?.id ?? '');
  const [usefulDone, setUsefulDone] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [updateOpen, setUpdateOpen] = useState(false);
  const [replacement, setReplacement] = useState('');
  const [serverSearch, setServerSearch] = useState<{ query: string; entries: Array<{ id: string; at: string; text: string }>; truncated: boolean; error: string | null } | null>(null);
  const [searching, setSearching] = useState(false);
  const requestRef = useRef(0);

  useEffect(() => {
    if (!target.id) return;
    setSelectedId(target.id);
    setQuery('');
    setFacet('all');
    setSpace('all');
  }, [target.id, target.nonce]);

  const loaded = space === 'all' ? facts.memories : facts.memories.filter((memory) => memory.space === space);
  const facetMatch = FACETS.find(([id]) => id === facet)?.[2] ?? (() => true);
  const rows = useMemo(
    () =>
      loaded
        .filter((memory) => facetMatch(memory))
        .filter((memory) => !query.trim() || memory.text.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
        .sort((left, right) => right.ts.localeCompare(left.ts)),
    [loaded, facet, query, facetMatch],
  );
  const selected = rows.find((memory) => memory.id === selectedId) ?? rows[0];

  function chooseSpace(next: string) {
    setSpace(next);
    setSelectedId('');
    setServerSearch(null);
  }

  /** 全文搜索走服务端真实 `memo search`：排序、退出召回、supersede 规则归 AIOS，不在浏览器里重算一份。 */
  async function runServerSearch() {
    const term = query.trim();
    if (!term) {
      setServerSearch(null);
      return;
    }
    const token = ++requestRef.current;
    setSearching(true);
    setActionError(null);
    try {
      const response = await fetch(`/api/memory?q=${encodeURIComponent(term)}&limit=20`, { cache: 'no-store' });
      const payload = (await response.json()) as {
        entries?: Array<{ id: string; at: string; text: string }>;
        truncated?: boolean;
        error?: string | null;
      };
      if (token !== requestRef.current) return;
      setServerSearch({
        query: term,
        entries: payload.entries ?? [],
        truncated: payload.truncated === true,
        error: payload.error ?? (response.ok ? null : `HTTP ${response.status}`),
      });
    } catch (error) {
      if (token !== requestRef.current) return;
      setActionError(`搜索没跑成：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      if (token === requestRef.current) setSearching(false);
    }
  }

  /** 两个动作都打到真实白名单（`/api/memory` POST），命令原文与结果如实回报。 */
  async function runAction(action: 'memo.useful' | 'memo.supersede', text?: string) {
    if (!selected) return;
    setBusy(true);
    setActionError(null);
    try {
      const response = await fetch('/api/memory', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, id: selected.id, text: text ?? '', confirm: true }),
      });
      const payload = (await response.json()) as { ok?: boolean; output?: string; error?: string | null };
      if (!response.ok || payload.ok !== true) {
        setActionError(payload.error || `${action} 失败（HTTP ${response.status}）`);
        return false;
      }
      if (action === 'memo.useful') setUsefulDone((previous) => [...previous, selected.id]);
      return true;
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submitSupersede() {
    const trimmed = replacement.trim();
    if (!selected || trimmed.length < 8) return;
    const ok = await runAction('memo.supersede', trimmed);
    if (ok) {
      setUpdateOpen(false);
      setReplacement('');
      // 旧条目退出召回是 CLI 的结果，不是页面自己改的状态：这里只说明接下来会看到什么。
      setActionError(null);
    }
  }

  const pinnedBudget = facts.memoryPinnedBudget?.[0] ?? null;

  return (
    <>
      <Heading
        eyebrow="PROJECT MEMORY"
        title="经验留下来，下一次接着用。"
        description={`本机 ${facts.memoryTotals?.events ?? facts.memories.length} 条记忆记录，按它们真实存在的命名空间与适用范围组织。`}
        actions={
          <Button variant="outline" onClick={() => window.location.reload()}>
            <Gauge size={15} />
            重新采集
          </Button>
        }
      />
      <div className="mb-5 flex items-center gap-2 text-xs leading-5 text-rex-text-muted">
        <ShieldCheck size={15} className="shrink-0 text-rex-cyan" />
        记忆按 space 与 scope 陈列；顶部的项目选择器只决定配置目标，不筛记忆——memo 存储里没有按项目分栏这回事。
      </div>
      <div className="grid min-h-[570px] overflow-hidden rounded-2xl border border-rex-border bg-rex-bg lg:grid-cols-[190px_minmax(0,1fr)] xl:grid-cols-[190px_minmax(260px,.95fr)_minmax(300px,1.15fr)]">
        <aside
          aria-label="记忆命名空间"
          className="border-b border-rex-border bg-rex-panel/40 p-3 lg:border-r lg:border-b-0"
        >
          <p className="px-2 pt-2 pb-4 text-[11px] font-medium tracking-wide text-rex-text-muted">阅读范围</p>
          <div className="flex flex-wrap gap-1 lg:flex-col">
            <ProjectButton name="全部 space" active={space === 'all'} onClick={() => chooseSpace('all')} />
            {facts.memorySpaces.map((entry) => {
              const spaceKey = String(entry.space ?? entry.spaceKey ?? '');
              return (
                <ProjectButton
                  key={spaceKey}
                  name={spaceKey}
                  description={`${entry.events} 条 · ${Math.round(Number(entry.chars ?? 0) / 1024)} KB`}
                  active={spaceKey === space}
                  onClick={() => chooseSpace(spaceKey)}
                />
              );
            })}
          </div>
          {facts.memorySpaces.length === 0 && (
            <p className="mt-3 px-2 text-[11px] leading-5 text-rex-text-muted">
              {facts.degraded.some((entry) => entry.item === 'memoryReport')
                ? `命名空间没读到：${facts.degraded.find((entry) => entry.item === 'memoryReport')?.error}`
                : '本机没有记忆命名空间。'}
            </p>
          )}
          {pinnedBudget && (
            <div className="mt-5 rounded-lg border border-rex-border bg-rex-bg p-3 text-[11px] leading-5 text-rex-text-muted">
              <p className="font-medium text-rex-text-body">常驻记忆预算</p>
              <p>
                {pinnedBudget.chars} / {pinnedBudget.maxChars} 字符
              </p>
              {pinnedBudget.truncated === true && (
                <p className="mt-1 flex items-start gap-1.5 text-rex-danger">
                  <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                  已超出并被截断：常驻窗口只装得下一部分。
                </p>
              )}
            </div>
          )}
          <p className="mt-5 px-2 text-[11px] leading-5 text-rex-text-muted">
            出处：{facts.sources.find((source) => source.field === 'memories')?.origin ?? '未记录'}
          </p>
        </aside>
        <section aria-label="记忆列表" className="min-w-0 border-b border-rex-border xl:border-r xl:border-b-0">
          <div className="border-b border-rex-border p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="truncate text-sm font-semibold">
                {space === 'all' ? '全部记忆' : `space · ${space}`}
              </h2>
              <span className="shrink-0 text-xs text-rex-text-muted">{rows.length} 条</span>
            </div>
            <div className="relative">
              <Search size={15} className="absolute top-3 left-3 text-rex-text-muted" />
              <input
                aria-label="搜索记忆内容"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void runServerSearch();
                }}
                placeholder="搜索已加载记录；回车跑一次真实 memo search…"
                className={`${fieldClass} pl-9`}
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-1">
              {FACETS.map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setFacet(id)}
                  aria-pressed={facet === id}
                  className={`rounded-md px-2 py-1 text-[11px] focus-visible:outline-2 focus-visible:outline-rex-cyan ${facet === id ? 'bg-rex-panel-strong font-medium text-rex-text' : 'text-rex-text-muted hover:bg-rex-panel'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {searching ? (
            <div role="status">
              <Empty icon={CircleDashed} title="正在跑 memo search…">
                命令、结果与失败原文都来自子进程，不在页面里模拟。
              </Empty>
            </div>
          ) : serverSearch ? (
            <div className="max-h-[540px] overflow-y-auto">
              <p className="border-b border-rex-border px-5 py-3 text-[11px] text-rex-text-muted">
                `memo search “{serverSearch.query}”` 命中 {serverSearch.entries.length} 条
                {serverSearch.truncated ? '（已到上限，可能还有）' : ''}
                {serverSearch.error ? ` · 失败原文：${serverSearch.error}` : ''}
              </p>
              {serverSearch.entries.map((entry) => (
                <button
                  key={entry.id}
                  onClick={() => setSelectedId(entry.id)}
                  className={`relative w-full border-b border-rex-border px-5 py-4 text-left last:border-0 focus-visible:outline-2 focus-visible:outline-rex-cyan ${entry.id === selectedId ? 'bg-rex-cyan/5 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-rex-cyan' : 'hover:bg-rex-panel/60'}`}
                >
                  <p className="mb-1 text-[10px] text-rex-text-muted">{entry.at}</p>
                  <p className="line-clamp-3 text-xs leading-5 text-rex-text-body">{entry.text}</p>
                  <p className="mt-2 break-all font-rex-mono text-[10px] text-rex-text-muted">{entry.id}</p>
                </button>
              ))}
              {serverSearch.entries.length === 0 && !serverSearch.error && (
                <Empty icon={FolderSearch} title="真实搜索没有命中">
                  <p>这个词在这台机器的记忆里没匹配上。搜索不是错误，没命中就是没命中。</p>
                </Empty>
              )}
            </div>
          ) : rows.length === 0 ? (
            <Empty icon={BookOpen} title={query ? '没有匹配的记忆' : '这里还没有记忆'}>
              <p>
                {query
                  ? '换一个词，或按回车让本机 CLI 再搜一次。'
                  : facts.memories.length === 0
                    ? '这台机器上还没有 memo 记录。产生第一条之后，它会按最近记录出现在这里。'
                    : '当前筛选条件下没有记录；换一个片或清除筛选。'}
              </p>
              {query && (
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => {
                    setQuery('');
                    setFacet('all');
                  }}
                >
                  清除筛选
                </Button>
              )}
            </Empty>
          ) : (
            <ul className="max-h-[540px] overflow-y-auto">
              {rows.map((memory) => (
                <li key={memory.id}>
                  <button
                    onClick={() => setSelectedId(memory.id)}
                    aria-pressed={selected?.id === memory.id}
                    className={`relative w-full border-b border-rex-border px-5 py-4 text-left transition-colors duration-150 last:border-0 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-rex-cyan ${selected?.id === memory.id ? 'bg-rex-cyan/5 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-rex-cyan' : 'hover:bg-rex-panel/60'}`}
                  >
                    <div className="mb-2 flex items-center gap-2 text-[10px] text-rex-text-muted">
                      <span>{memory.space}</span>
                      <span>·</span>
                      <span>{memory.ts.slice(5, 10)}</span>
                      {memory.checkpoint && <Badge tone="info">里程碑</Badge>}
                      {memory.scope && memory.scope !== 'project_shared' && (
                        <Badge tone="neutral">{MEMO_SCOPE_LABELS[memory.scope] ?? memory.scope}</Badge>
                      )}
                    </div>
                    <h3 className="text-sm leading-6 font-semibold line-clamp-1">{memory.excerpt}</h3>
                    <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-rex-text-muted">{memory.text}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section aria-label="记忆详情" className="min-w-0 p-6 lg:col-span-2 xl:col-span-1">
          {!selected ? (
            <Empty icon={FileText} title="让记忆有来有回">
              选择一条记录，查看完整事实、来源和它后来的变化。
            </Empty>
          ) : (
            <MemoryDetail
              memory={selected}
              useful={usefulDone.includes(selected.id)}
              busy={busy}
              actionError={actionError}
              onUseful={() => void runAction('memo.useful')}
              onUpdate={() => {
                setReplacement('');
                setUpdateOpen(true);
              }}
              onFollow={(id) => {
                setSelectedId(id);
                setFacet('all');
                setQuery('');
                setServerSearch(null);
              }}
            />
          )}
        </section>
      </div>
      <Modal
        open={updateOpen}
        onOpenChange={setUpdateOpen}
        title="更新这条事实"
        description="新增一条并取代它：旧记录保留但退出召回，历史可追溯。这一步会真的写入本机记忆文件。"
      >
        <div className="mb-4 rounded-lg bg-rex-panel p-3 text-sm leading-6 text-rex-text-muted">
          原记录：{selected?.excerpt.slice(0, 80)}
        </div>
        <Field label="现在应该记住什么" hint="8–2000 字符；命令是 aios memo add <文本> --supersedes <id>">
          <textarea
            rows={4}
            value={replacement}
            onChange={(event) => setReplacement(event.target.value)}
            className={`${fieldClass} h-auto py-3`}
          />
        </Field>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setUpdateOpen(false)}>
            <ArrowLeft size={14} />
            取消
          </Button>
          <Button disabled={replacement.trim().length < 8 || busy} onClick={() => void submitSupersede()}>
            {busy ? '执行中' : '写入并取代'}
          </Button>
        </div>
      </Modal>
    </>
  );
}
