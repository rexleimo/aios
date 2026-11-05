// 记忆与用量：两个「我到底积累了什么」的页面。
//
// 两个都只读 `--json` 输出；没有数据时显示空态而不是 0 假装有数据。
import { formatBytes, loadMemory, loadUsage } from '../../lib/capability.mjs';
import { ErrorNote, Freshness, PageHeader, Stat, StatGrid } from '../page-frame';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState } from '../ui/primitives';

export const dynamic = 'force-dynamic';

interface MemoryReport {
  generatedAt?: string;
  storage?: string;
  totals?: { events?: number; spaces?: number; superseded?: number };
  spaces?: Array<{
    space?: string;
    events?: number;
    chars?: number;
    useful?: number;
    oldestTs?: string;
    newestTs?: string;
  }>;
  candidates?: { pending?: number; promoted?: number; backlog?: number };
  feedback?: { impressions?: number; useful?: number };
}

export async function MemorySection() {
  const result = await loadMemory();
  if (!result.ok) {
    return (
      <>
        <PageHeader title="记忆" description="项目记忆的事件量与空间占用。" source="aios memory report --json" />
        <ErrorNote message={result.error} />
      </>
    );
  }
  const data = result.data as MemoryReport;
  const spaces = data.spaces ?? [];

  return (
    <>
      <PageHeader
        title="记忆"
        description="项目记忆是本仓库里最厚的资产：事件量、字符量、过期与候选状态一目了然。"
        source="aios memory report --json"
        status={{ label: data.storage ?? 'unknown', tone: 'neutral' }}
        freshness={<Freshness cached={result.cached} ageMs={result.ageMs} />}
      />

      <StatGrid>
        <Stat label="事件" value={data.totals?.events ?? 0} hint={`生成于 ${data.generatedAt ?? '—'}`} />
        <Stat label="空间" value={data.totals?.spaces ?? spaces.length} hint="默认单空间" />
        <Stat label="已作废" value={data.totals?.superseded ?? 0} hint="superseded 事件" />
        <Stat
          label="候选积压"
          value={data.candidates?.backlog ?? 0}
          hint="等待晋升的记忆候选"
          tone={(data.candidates?.backlog ?? 0) > 0 ? 'warn' : 'default'}
        />
      </StatGrid>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>记忆空间</CardTitle>
            <CardDescription>字符量是真实占用；useful 是召回后被标记有用的次数。</CardDescription>
          </CardHeader>
          <CardContent>
            {spaces.length === 0 ? (
              <EmptyState title="没有记忆空间" detail="跑一次 aios memo 写入后这里才会有内容。" />
            ) : (
              <ul className="divide-y divide-rex-border">
                {spaces.map((space) => (
                  <li key={space.space ?? 'default'} className="flex items-baseline justify-between gap-3 py-2">
                    <span className="font-rex-mono text-[12px] text-rex-text-body">{space.space ?? 'default'}</span>
                    <span className="text-right text-[11px] text-rex-text-muted">
                      {space.events ?? 0} 事件 · {formatBytes(space.chars ?? 0)} · useful {space.useful ?? 0}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>召回反馈</CardTitle>
            <CardDescription>被召回后被标记为有用的次数；没有任何记录时保持 0，不估算。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-[13px] text-rex-text-body">
            <Row label="召回次数" value={data.feedback?.impressions ?? 0} />
            <Row label="标记有用" value={data.feedback?.useful ?? 0} />
            <Row label="候选已晋升" value={data.candidates?.promoted ?? 0} />
            <Row label="候选待审" value={data.candidates?.pending ?? 0} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}

interface TokenReport {
  session_id?: string;
  generated_at?: string;
  total_events?: number;
  layers?: Array<{
    layer?: string;
    events?: number;
    raw_bytes?: number;
    compact_bytes?: number;
    saved_bytes?: number;
    saved_tokens_estimate?: number;
    refs_count?: number;
  }>;
  total_saved_tokens_estimate?: number;
}

export async function UsageSection() {
  const result = await loadUsage();
  if (!result.ok) {
    return (
      <>
        <PageHeader title="用量" description="按层记账的 token 用量。" source="aios tokens report --json" />
        <ErrorNote message={result.error} />
      </>
    );
  }
  const data = result.data as TokenReport;
  const layers = data.layers ?? [];
  const savedBytes = layers.reduce((sum, layer) => sum + (layer.saved_bytes ?? 0), 0);
  const rawBytes = layers.reduce((sum, layer) => sum + (layer.raw_bytes ?? 0), 0);

  return (
    <>
      <PageHeader
        title="用量"
        description="按层记账：原始体积、压缩后体积、省下多少。这里是过程记账，不是请求级账单——请求级要等二期网关。"
        source="aios tokens report --json"
        status={{ label: `session ${data.session_id ?? 'default'}`, tone: 'neutral' }}
        freshness={<Freshness cached={result.cached} ageMs={result.ageMs} />}
      />

      <StatGrid>
        <Stat label="事件" value={data.total_events ?? 0} hint={`生成于 ${data.generated_at ?? '—'}`} />
        <Stat label="原始体积" value={formatBytes(rawBytes)} hint="工具输出原文" />
        <Stat label="省下 token（估算）" value={(data.total_saved_tokens_estimate ?? 0).toLocaleString()} tone="ok" />
        <Stat label="省下体积" value={formatBytes(savedBytes)} hint="原始 − 压缩后" tone="ok" />
      </StatGrid>

      {layers.length === 0 ? (
        <EmptyState title="没有记账" detail="跑过工具调用后这里会出现按层的数字。" />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>按层</CardTitle>
            <CardDescription>每一行都是一层的真实记账；压缩比由两列算出，不单独存放。</CardDescription>
          </CardHeader>
          <CardContent>
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-rex-border text-left text-[11px] tracking-wide text-rex-text-muted uppercase">
                  <th className="py-2 pr-3 font-medium">层</th>
                  <th className="py-2 pr-3 font-medium">事件</th>
                  <th className="py-2 pr-3 font-medium">原始</th>
                  <th className="py-2 pr-3 font-medium">压缩后</th>
                  <th className="py-2 pr-3 font-medium">省下</th>
                  <th className="py-2 font-medium">压缩比</th>
                </tr>
              </thead>
              <tbody>
                {layers.map((layer) => {
                  const ratio =
                    (layer.raw_bytes ?? 0) > 0 && (layer.compact_bytes ?? 0) > 0
                      ? ((layer.raw_bytes ?? 0) / (layer.compact_bytes ?? 1)).toFixed(1)
                      : '—';
                  return (
                    <tr key={layer.layer ?? 'layer'} className="border-b border-rex-border last:border-0">
                      <td className="py-2 pr-3 font-rex-mono text-[12px]">{layer.layer ?? '—'}</td>
                      <td className="py-2 pr-3 text-rex-text-muted">{layer.events ?? 0}</td>
                      <td className="py-2 pr-3">{formatBytes(layer.raw_bytes ?? 0)}</td>
                      <td className="py-2 pr-3">{formatBytes(layer.compact_bytes ?? 0)}</td>
                      <td className="py-2 pr-3 text-rex-green">{formatBytes(layer.saved_bytes ?? 0)}</td>
                      <td className="py-2 font-rex-mono text-[12px] text-rex-text-muted">{ratio}×</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </>
  );
}

function Row({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex items-center justify-between border-b border-rex-border pb-1.5 last:border-0">
      <span className="text-rex-text-muted">{label}</span>
      <span className="font-rex-mono text-[12px]">{value}</span>
    </div>
  );
}
