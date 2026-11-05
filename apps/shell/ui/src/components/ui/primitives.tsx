// Card / Badge / Input — the three shapes every page uses.
//
// One file for the primitives keeps `components/ui/` from turning into twenty files with
// four lines each; anything with real behaviour (dialog, tabs, switch) gets its own file.
import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '../../lib/cn';

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-rex-md border border-rex-border bg-rex-bg', className)}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-1 px-5 pt-4 pb-3', className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn('font-rex-display text-sm font-semibold text-rex-text', className)}
      {...props}
    />
  );
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-xs leading-relaxed text-rex-text-muted', className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-5 pb-4', className)} {...props} />;
}

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap',
  {
    variants: {
      tone: {
        neutral: 'bg-rex-panel-strong text-rex-text-muted',
        info: 'bg-rex-cyan/10 text-rex-cyan',
        ok: 'bg-rex-green/10 text-rex-green',
        warn: 'bg-rex-orange/10 text-rex-orange',
        danger: 'bg-rex-danger/10 text-rex-danger',
        violet: 'bg-rex-violet/10 text-rex-violet',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'h-9 w-full rounded-rex-sm bg-rex-bg px-3 text-sm text-rex-text ring-1 ring-rex-border',
        'placeholder:text-rex-text-soft focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-rex-cyan',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

export function Separator({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div role="separator" className={cn('h-px w-full bg-rex-border', className)} {...props} />;
}

export function EmptyState({
  title,
  detail,
  className,
}: {
  title: string;
  detail: string;
  className?: string;
}) {
  return (
    <div className={cn('rounded-rex-md border border-dashed border-rex-border px-5 py-8', className)}>
      <p className="text-sm font-medium text-rex-text-body">{title}</p>
      <p className="mt-1 text-xs text-rex-text-muted">{detail}</p>
    </div>
  );
}
