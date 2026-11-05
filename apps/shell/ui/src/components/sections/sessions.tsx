// 会话：ContextDB 里真实存在的会话，列表 + 内容。
//
// 数据不是新造的：`.aios/context-db/sessions/<id>/` 下的 meta / l0-summary /
// l1-checkpoints / l2-events 就是 ContextDB 写下的东西，这里只读它。
// 选中的会话走 `?session=<id>`，所以这一页是服务端渲染：可分享、可刷新、无双份缓存。
import fs from 'node:fs';
import path from 'node:path';

import { Freshness, PageHeader } from '../page-frame';
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState } from '../ui/primitives';
import { SessionList, type SessionSummary } from '../session-list';
import { listSessions, readSession, sessionsDir, shortTime } from '../../lib/data/sessions.mjs';

export const dynamic = 'force-dynamic';

function root(): string {
  return process.env.AIOS_PROJECT_ROOT ?? path.resolve(process.cwd(), '..', '..', '..');
}

export function SessionsSection({ searchParams }: { searchParams?: { session?: string } }) {
  const repoRoot = root();
  const sessions = listSessions(repoRoot) as SessionSummary[];
  const selected = typeof searchParams?.session === 'string' ? searchParams.session : null;

  let detail: ReturnType<typeof readSession> | null = null;
  let detailError = '';
  if (selected) {
    try {
      detail = readSession(repoRoot, selected);
    } catch (error) {
      detailError = error instanceof Error ? error.message : String(error);
    }
  }

  const storage = path.relative(repoRoot, sessionsDir(repoRoot)).replace(/\\/g, '/');
  const eventsTotal = sessions.reduce((sum, session) => sum + session.events, 0);

  return (
    <>
      <PageHeader
        title="会话"
        description="ContextDB 记录的每一次会话：它想做什么、走到哪一步、检查点说了什么。左边选，右边读。"
        source={storage}
        status={{ label: `${sessions.length} 个会话`, tone: 'info' }}
        freshness={<Freshness cached={false} ageMs={0} />}
      />

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>会话列表</CardTitle>
            <CardDescription>
              共 {sessions.length} 个，{eventsTotal.toLocaleString()} 条事件。按更新时间倒序。
            </CardDescription>
          </CardHeader>
          <CardContent>
            {sessions.length === 0 ? (
              <EmptyState
                title="还没有会话"
                detail="跑一次 aios session start（或客户端的 session 注入）之后，这里会出现目录。"
              />
            ) : (
              <SessionList sessions={sessions} selected={selected} />
            )}
          </CardContent>
        </Card>

        <div className="min-w-0">
          {!selected ? (
            <EmptyState
              title="选一个会话"
              detail="左侧列表里点任意一个会话，这里会显示它的目标、摘要、检查点与最近事件。"
            />
          ) : detailError ? (
            <div className="rounded-rex-md border border-rex-danger/30 bg-rex-danger/5 px-4 py-3">
              <p className="text-[13px] font-medium text-rex-danger">读不出来</p>
              <p className="mt-1 font-rex-mono text-[11px] break-all text-rex-text-muted">{detailError}</p>
            </div>
          ) : detail ? (
            <div className="space-y-3">
              <Card>
                <CardHeader>
                  <CardTitle className="flex flex-wrap items-center gap-2">
                    <span className="font-rex-mono text-[12px]">{detail.sessionId}</span>
                    <Badge tone={detail.meta?.status === 'blocked' ? 'danger' : 'info'}>
                      {String(detail.meta?.status ?? 'unknown')}
                    </Badge>
                    {detail.meta?.agent ? <Badge tone="neutral">{String(detail.meta.agent)}</Badge> : null}
                    {detail.meta?.project ? <Badge tone="neutral">{String(detail.meta.project)}</Badge> : null}
                  </CardTitle>
                  <CardDescription>{String(detail.meta?.goal ?? '（没有 goal）')}</CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-2 font-rex-mono text-[11px] text-rex-text-muted md:grid-cols-4">
                  <span>开始 {shortTime(detail.meta?.createdAt)}</span>
                  <span>更新 {shortTime(detail.meta?.updatedAt)}</span>
                  <span>事件 {detail.eventTotal}</span>
                  <span>检查点 {detail.checkpointTotal}</span>
                </CardContent>
              </Card>

              {detail.summary.trim().length > 0 ? (
                <Card>
                  <CardHeader>
                    <CardTitle>摘要（l0）</CardTitle>
                    <CardDescription>ContextDB 自己写的摘要——恢复会话时先读的就是它。</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <pre className="max-h-[260px] overflow-auto rounded-rex-sm border border-rex-border bg-rex-panel px-3 py-2 font-rex-body text-[12px] leading-relaxed whitespace-pre-wrap text-rex-text-body">
                      {detail.summary}
                    </pre>
                  </CardContent>
                </Card>
              ) : null}

              <Card>
                <CardHeader>
                  <CardTitle>检查点（l1）</CardTitle>
                  <CardDescription>每次跨过一个阶段就记一条；blocked 的那条会写明下一步该做什么。</CardDescription>
                </CardHeader>
                <CardContent>
                  {detail.checkpoints.length === 0 ? (
                    <p className="text-[12px] text-rex-text-muted">这个会话还没有检查点。</p>
                  ) : (
                    <ol className="space-y-2">
                      {detail.checkpoints
                        .slice()
                        .reverse()
                        .map((checkpoint, index) => (
                          <li key={`${checkpoint.ts}-${index}`} className="border-l-2 border-rex-border pl-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-rex-mono text-[11px] text-rex-text-soft">
                                {shortTime(checkpoint.ts)}
                              </span>
                              {checkpoint.status ? (
                                <Badge tone={checkpoint.status === 'blocked' ? 'danger' : 'neutral'}>
                                  {checkpoint.status}
                                </Badge>
                              ) : null}
                            </div>
                            <p className="mt-0.5 text-[12px] leading-relaxed text-rex-text-body">
                              {checkpoint.summary}
                            </p>
                            {checkpoint.nextActions.length > 0 ? (
                              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] text-rex-text-muted">
                                {checkpoint.nextActions.map((action: string) => (
                                  <li key={action}>{action}</li>
                                ))}
                              </ul>
                            ) : null}
                          </li>
                        ))}
                    </ol>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>事件（l2，最近 {detail.events.length} / {detail.eventTotal} 条）</CardTitle>
                  <CardDescription>
                    按原样截断到 400 字符；要看全文去 {storage}/{detail.sessionId}/l2-events.jsonl。
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {detail.events.length === 0 ? (
                    <p className="text-[12px] text-rex-text-muted">这个会话没有事件行。</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {detail.events
                        .slice()
                        .reverse()
                        .map((event, index) => (
                          <li key={`${event.seq}-${index}`} className="flex gap-2 text-[11px] leading-relaxed">
                            <span className="shrink-0 font-rex-mono text-rex-text-soft">
                              {shortTime(event.ts).slice(11)}
                            </span>
                            <span className="shrink-0 font-rex-mono text-rex-text-muted">
                              {event.role ?? '—'}
                            </span>
                            <span className="min-w-0 break-words text-rex-text-body">{event.text}</span>
                          </li>
                        ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}