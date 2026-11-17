// Panel / Badge / Input / Select / Textarea — the shared shapes every console page uses.
//
// One file for the atomic shapes keeps `components/ui/` from turning into twenty files
// with four lines each; anything with real behaviour (dialog, async states) gets its own
// file. Every value here is a rex token utility — no hand-written color/radius constants.
// One shape per concept: there is no second card, no second input, no second empty state.
import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import * as RadixSelect from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';

import { cn } from '../../lib/cn';

export function Panel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={cn('rounded-rex-lg border border-rex-border bg-rex-bg', className)}>{children}</section>;
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

// Input and Select share one field shape so a form reads the same everywhere; `size`
// is the only axis of variation (compact table rows vs full-width forms).
const fieldVariants = cva(
  'w-full min-w-0 rounded-rex-sm bg-rex-bg text-rex-text ring-1 ring-rex-border placeholder:text-rex-text-soft focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-rex-cyan disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      size: {
        default: 'h-9 px-3 text-sm',
        sm: 'h-8 px-2.5 text-xs',
      },
    },
    defaultVariants: { size: 'default' },
  },
);

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'>,
    VariantProps<typeof fieldVariants> {}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, size, ...props }, ref) => (
    <input ref={ref} className={cn(fieldVariants({ size }), className)} {...props} />
  ),
);
Input.displayName = 'Input';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  size?: 'default' | 'sm';
  className?: string;
  disabled?: boolean;
  'aria-label'?: string;
}

// Radix reserves the empty string for clearing; our forms use it as an explicit "automatic" choice.
const EMPTY_SELECT_VALUE = '__rex_empty_option__';

export const Select = ({ value, onValueChange, options, placeholder, size = 'default', className, disabled, 'aria-label': ariaLabel }: SelectProps) => (
  <RadixSelect.Root disabled={disabled} value={value || EMPTY_SELECT_VALUE} onValueChange={(next) => onValueChange(next === EMPTY_SELECT_VALUE ? '' : next)}>
    <RadixSelect.Trigger
      aria-label={ariaLabel}
      className={cn(
        fieldVariants({ size }),
        'flex items-center justify-between gap-2 text-left',
        className,
      )}
    >
      {/* Select.Value intentionally ignores className; its wrapper owns truncation. */}
      <span className="min-w-0 flex-1 truncate">
        <RadixSelect.Value placeholder={placeholder || 'Select…'} />
      </span>
      <RadixSelect.Icon className="shrink-0">
        <ChevronDown size={12} className="text-rex-text-muted" />
      </RadixSelect.Icon>
    </RadixSelect.Trigger>
    <RadixSelect.Portal>
      <RadixSelect.Content
        className="z-50 w-[var(--radix-select-trigger-width)] min-w-[8rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-rex-sm border border-rex-border bg-rex-bg shadow-lg"
        position="popper"
        sideOffset={4}
      >
        <RadixSelect.Viewport className="max-h-[min(20rem,var(--radix-select-content-available-height))] overflow-y-auto p-1">
          {options.map((opt) => (
            <RadixSelect.Item
              key={opt.value}
              value={opt.value || EMPTY_SELECT_VALUE}
              className="relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-xs text-rex-text outline-none data-[highlighted]:bg-rex-panel data-[state=checked]:font-medium"
            >
              <span className="min-w-0 flex-1 truncate">
                <RadixSelect.ItemText>{opt.label}</RadixSelect.ItemText>
              </span>
              <RadixSelect.ItemIndicator className="ml-2 shrink-0">
                <Check size={12} />
              </RadixSelect.ItemIndicator>
            </RadixSelect.Item>
          ))}
        </RadixSelect.Viewport>
      </RadixSelect.Content>
    </RadixSelect.Portal>
  </RadixSelect.Root>
);
Select.displayName = 'Select';

// Textarea shares the same field surface; its height comes from `rows`, not a `size` axis.
export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea ref={ref} className={cn(fieldVariants(), 'h-auto py-3', className)} {...props} />
  ),
);
Textarea.displayName = 'Textarea';
