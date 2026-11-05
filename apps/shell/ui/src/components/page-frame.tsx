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
}: {
  title: string;
  description: string;
  source?: string;
  actions?: ReactNode;
  status?: { label: string; tone: 'neutral' | 'info' | 'ok' | 'warn' | 'danger' | 'violet' };
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
          <p className="mt-1 font-rex-mono text-[11px] text-rex-text-soft">来源：{source}</p>
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

export function ErrorNote({ message }: { message: string }) {
  return (
    <div className="rounded-rex-md border border-rex-danger/30 bg-rex-danger/5 px-4 py-3">
      <p className="text-[13px] font-medium text-rex-danger">取数失败</p>
      <p className="mt-1 font-rex-mono text-[11px] break-all text-rex-text-muted">{message}</p>
    </div>
  );
}
