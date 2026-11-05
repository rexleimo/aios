// Overview — the page that answers "am I getting anything out of this".
//
// Three questions, in the order a person asks them: how many clients are wired up, where
// is the evidence missing, and what is blocking right now. Every number is a set
// operation over the two authority files; nothing is typed in by hand.
import { Activity, ShieldAlert, TableProperties } from 'lucide-react';
import Link from 'next/link';

import { loadMatrixSnapshot } from '../../lib/matrix-loader';
import { Freshness, PageHeader, Stat, StatGrid } from '../page-frame';
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState } from '../ui/primitives';
import { Button } from '../ui/button';
import { ActionButton } from '../ui/action-button';

export const dynamic = 'force-dynamic';

const STATUS_TONE = {
  ok: { label: '正常', tone: 'ok' as const },
  blocked: { label: '有阻断', tone: 'danger' as const },
  degraded: { label: '降级', tone: 'warn' as const },
};

export async function OverviewSection() {
  // One spawn, not two: the matrix payload already carries the blockers and the coverage,
  // and `aios status --json` costs ~9.3 s on its own (measured). Asking twice meant ~19 s
  // of blank window for numbers that came from the same collection.
  const { matrix, cached, ageMs } = await loadMatrixSnapshot();
  const overall = String(matrix.overallStatus ?? 'unknown');
  const statusChip = STATUS_TONE[overall as keyof typeof STATUS_TONE] ?? {
    label: overall,
    tone: 'neutral' as const,
  };

  return (
    <>
      <PageHeader
        title="总览"
        description="AIOS 把能力装进哪些客户端、证据覆盖到哪、现在卡在哪。"
        source="aios status --json + config/host-capabilities.json"
        status={statusChip}
        freshness={<Freshness cached={cached} ageMs={ageMs} />}
        actions={
          <>
            {/* 重新采集会把快照清掉并让页面重新取数——「刷新」必须真的刷新。 */}
            <ActionButton actionId="status.refresh" label="重新采集" variant="outline" />
            <Button asChild variant="secondary" size="sm">
              <Link href="/matrix">
                <TableProperties />
                接入矩阵
              </Link>
            </Button>
          </>
        }
      />

      <StatGrid>
        <Stat label="声明客户端" value={matrix.coverage.declared} hint="config/host-capabilities.json" />
        <Stat
          label="证据覆盖"
          value={matrix.coverage.evidenceCovered}
          hint="aios status 采集到的"
          tone="ok"
        />
        <Stat
          label="未覆盖"
          value={matrix.coverage.declaredOnly.length}
          hint="没有采集面 ≠ 好"
          tone={matrix.coverage.declaredOnly.length > 0 ? 'warn' : 'default'}
        />
        <Stat
          label="阻断"
          value={matrix.blockers.length}
          hint="来自 status 原文"
          tone={matrix.blockers.length > 0 ? 'danger' : 'ok'}
        />
      </StatGrid>

      <div className="grid gap-4 lg:grid-cols-[1.15fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="size-4 text-rex-danger" />
              当前阻断
            </CardTitle>
            <CardDescription>原文来自 aios status，不改写、不合并、不排序。</CardDescription>
          </CardHeader>
          <CardContent>
            {matrix.blockers.length === 0 ? (
              <EmptyState title="没有阻断" detail="aios status 报告 overallStatus 为正常。" />
            ) : (
              <ul className="space-y-2">
                {matrix.blockers.map((blocker) => (
                  <li key={blocker} className="flex gap-2 text-[13px] leading-relaxed text-rex-text-body">
                    <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-rex-danger" />
                    {blocker}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="size-4 text-rex-cyan" />
              证据分布
            </CardTitle>
            <CardDescription>同一声明集，三种证据状态，加上「没有采集面」的那一类。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {matrix.rows.map((row) => (
              <div key={row.clientId} className="flex items-center justify-between gap-3">
                <span className="font-rex-mono text-[12px] text-rex-text-body">{row.clientId}</span>
                <span className="flex items-center gap-2">
                  <span className="font-rex-mono text-[11px] text-rex-text-soft">
                    {row.declaredCount}/{row.axisTotal}
                  </span>
                  <EvidenceBadge label={row.evidence.label} />
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function EvidenceBadge({ label }: { label: string }) {
  const map: Record<string, { text: string; tone: 'ok' | 'warn' | 'danger' | 'violet' | 'neutral' }> = {
    'not-covered': { text: '未覆盖', tone: 'warn' },
    'pending-smoke': { text: '待验证', tone: 'violet' },
    'compatibility-only': { text: '仅兼容层', tone: 'neutral' },
    'evidence-blocked': { text: '证据阻断', tone: 'danger' },
    covered: { text: '已覆盖', tone: 'ok' },
  };
  const entry = map[label] ?? { text: label, tone: 'neutral' as const };
  return <Badge tone={entry.tone}>{entry.text}</Badge>;
}
