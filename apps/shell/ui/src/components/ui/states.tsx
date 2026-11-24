'use client';

// Loading / ErrorState / InlineFeedback — the three async states every panel shares.
//
// Before this file each panel hand-rolled its own "正在读取…" / "没读到…重试" / save
// feedback, so the same interaction looked different per page. One shape per state is
// the interaction contract; panels import these instead of re-spelling the classes.
import { Loader2 } from 'lucide-react';

import { t } from '../../i18n/t.mjs';
import { cn } from '../../lib/cn';
import { Button } from './button';
import { Panel } from './primitives';

export function Loading({ label, className = '' }: { label?: string; className?: string }) {
  return (
    <Panel className={cn('flex items-center gap-2.5 p-6 text-sm text-rex-text-muted', className)}>
      <Loader2 size={16} aria-hidden className="shrink-0 animate-spin motion-reduce:animate-none" />
      {label ?? t('common.loading')}
    </Panel>
  );
}

export function ErrorState({
  message,
  onRetry,
  className = '',
}: {
  message: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <Panel className={cn('p-6', className)}>
      <p className="text-sm text-rex-text-muted">{message}</p>
      {onRetry && (
        <Button variant="outline" className="mt-4" onClick={onRetry}>
          {t('common.retry')}
        </Button>
      )}
    </Panel>
  );
}

export interface Feedback {
  text: string;
  tone: 'ok' | 'error';
}

// Save feedback renders next to the button that triggered it. `idle` is the resting hint
// shown before any save; once a result exists it replaces the hint in the same slot.
export function InlineFeedback({
  feedback,
  idle,
  className = '',
}: {
  feedback: Feedback | null;
  idle?: string;
  className?: string;
}) {
  if (feedback) {
    return (
      <span
        role="status"
        className={cn('text-[11px]', feedback.tone === 'error' ? 'text-rex-danger' : 'text-rex-green', className)}
      >
        {feedback.text}
      </span>
    );
  }
  return idle ? <span className={cn('text-[11px] text-rex-text-muted', className)}>{idle}</span> : null;
}