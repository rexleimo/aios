// Page header + the "where do these numbers come from" footer.
//
// Every page renders its own header, so the title and the action buttons sit next to the
// data they act on instead of in a global bar that has to guess.
import type { ReactNode } from 'react';

import { Badge } from './ui/primitives';

export function PageHeader({
  title,
  description,
  source,
  actions,
  status,
  freshness,
}: {
  title: string;
  description: string;
  source?: string;
  actions?: ReactNode;
  status?: { label: string; tone: 'neutral' | 'info' | 'ok' | 'warn' | 'danger' | 'violet' };
  freshness?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4 border-b border-rex-border pb-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2.5">
          <h1 className="font-rex-display text-[22px] leading-tight font-semibold tracking-tight text-rex-text">
            {title}
          </h1>
          {status ? <Badge tone={status.tone}>{status.label}</Badge> : null}
        </div>
        <p className="mt-1.5 max-w-[62ch] text-[13px] leading-relaxed text-rex-text-muted">
          {description}
        </p>
        {source ? (
          <p className="mt-1 flex items-center gap-2 font-rex-mono text-[11px] text-rex-text-soft">
            来源：{source}
            {freshness ? <span className="text-rex-text-soft">·</span> : null}
            {freshness}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">{children}</div>;
}

export function Stat({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: 'default' | 'warn' | 'danger' | 'ok';
}) {
  const valueTone =
    tone === 'danger'
      ? 'text-rex-danger'
      : tone === 'warn'
        ? 'text-rex-orange'
        : tone === 'ok'
          ? 'text-rex-green'
          : 'text-rex-text';
  return (
    <div className="rounded-rex-md border border-rex-border bg-rex-bg px-4 py-3">
      <p className="text-[11px] font-medium tracking-wide text-rex-text-muted uppercase">{label}</p>
      <p className={`mt-1 font-rex-display text-[26px] leading-none font-semibold ${valueTone}`}>
        {value}
      </p>
      {hint ? <p className="mt-1.5 text-[11px] text-rex-text-soft">{hint}</p> : null}
    </div>
  );
}

/**
 * How old the numbers are. The pages cache capability output for a few seconds because the
 * commands cost seconds; saying "3 秒前" is cheaper than pretending the values are live,
 * and it is the difference between a cache and a lie.
 */
export function Freshness({
  cached,
  ageMs,
  stale,
}: {
  cached?: boolean;
  ageMs?: number;
  stale?: boolean;
}) {
  if (ageMs === undefined) return null;
  const seconds = Math.max(0, Math.round(ageMs / 1000));
  return (
    <span className="font-rex-mono text-[11px] text-rex-text-soft">
      {cached ? `数据 ${seconds}s 前` : '刚刚采集'}
      {stale && cached ? '（后台刷新中）' : ''}
    </span>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <div className="rounded-rex-md border border-rex-danger/30 bg-rex-danger/5 px-4 py-3">
      <p className="text-[13px] font-medium text-rex-danger">取数失败</p>
      <p className="mt-1 font-rex-mono text-[11px] break-all text-rex-text-muted">{message}</p>
    </div>
  );
}

/**
 * 页面里每个内容区都套这一层：统一标题、说明、右侧动作与间距。
 *
 * 「乱布局」的根因通常不是单个卡片难看，而是每一块自己决定标题大小、内边距和上下间距。
 * 这里把它们收成一个节奏：同一层级的区块，标题同字号、间距同值、动作永远在右上。
 */
export function PageSection({
  title,
  description,
  actions,
  children,
  className,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={className ? `mb-6 ${className}` : 'mb-6'}>
      {title || description || actions ? (
        <div className="mb-2.5 flex items-end justify-between gap-4">
          <div className="min-w-0">
            {title ? (
              <h2 className="font-rex-display text-[13px] font-semibold tracking-wide text-rex-text">
                {title}
              </h2>
            ) : null}
            {description ? (
              <p className="mt-0.5 text-[11px] leading-relaxed text-rex-text-muted">{description}</p>
            ) : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
