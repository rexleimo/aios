'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { ArrowUpRight, X, type LucideIcon } from 'lucide-react';
import { useRef, type ReactNode } from 'react';
import { Button } from '../ui/button';
import { Badge } from '../ui/primitives';

export { Button, Badge };
export function Heading({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="mb-2 text-[11px] font-medium tracking-[.1em] text-rex-text-muted">{eyebrow}</p>
        <h1 className="font-rex-display text-[30px] leading-tight font-semibold tracking-tight text-rex-text">
          {title}
        </h1>
        <p className="mt-2 text-sm leading-6 text-rex-text-muted">{description}</p>
      </div>
      {actions}
    </header>
  );
}
export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-rex-border bg-rex-bg ${className}`}>{children}</section>;
}
export function SmallTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="text-[15px] font-semibold">{children}</h2>
      {action}
    </div>
  );
}
export function TextLink({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 text-xs font-medium text-rex-cyan hover:underline focus-visible:outline-2 focus-visible:outline-rex-cyan"
    >
      {children}
      <ArrowUpRight size={13} />
    </button>
  );
}
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  wide = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const opener = useRef<HTMLElement | null>(null);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-rex-text/25 backdrop-blur-[2px]" />
        <Dialog.Content
          onOpenAutoFocus={() => {
            opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
          }}
          onCloseAutoFocus={(event) => {
            if (opener.current?.isConnected) {
              event.preventDefault();
              opener.current.focus();
            }
          }}
          className={`fixed top-1/2 left-1/2 z-50 max-h-[90dvh] w-[calc(100%_-_32px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-rex-border bg-rex-bg p-6 shadow-xl ${wide ? 'max-w-[680px]' : 'max-w-[480px]'}`}
        >
          <Dialog.Title className="pr-8 text-xl font-semibold tracking-tight">{title}</Dialog.Title>
          <Dialog.Description className="mt-2 mb-6 text-sm leading-6 text-rex-text-muted">
            {description}
          </Dialog.Description>
          <Dialog.Close asChild>
            <button
              aria-label="关闭弹窗"
              className="absolute top-5 right-5 rounded-lg p-1.5 text-rex-text-muted hover:bg-rex-panel focus-visible:outline-2 focus-visible:outline-rex-cyan"
            >
              <X size={18} />
            </button>
          </Dialog.Close>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export const fieldClass =
  'h-10 w-full min-w-0 rounded-lg border border-rex-border bg-rex-bg px-3 text-sm text-rex-text focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-rex-cyan';
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="block text-xs leading-5 text-rex-text-muted">{hint}</span>}
    </label>
  );
}
export function Empty({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  return (
    <div className="flex min-h-60 flex-col items-center justify-center px-5 py-10 text-center">
      <div className="mb-4 rounded-2xl bg-rex-panel p-3 text-rex-text-muted">
        <Icon size={24} strokeWidth={1.5} />
      </div>
      <h3 className="text-base font-semibold">{title}</h3>
      <div className="mt-2 max-w-sm text-sm leading-6 text-rex-text-muted">{children}</div>
    </div>
  );
}
