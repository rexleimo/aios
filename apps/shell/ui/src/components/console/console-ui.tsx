'use client';

import { t } from '../../i18n/t.mjs';
import * as Dialog from '@radix-ui/react-dialog';
import { ArrowUpRight, X, type LucideIcon } from 'lucide-react';
import { useRef, type ReactNode, type RefObject } from 'react';
import { Button } from '../ui/button';
import { Badge, Input, Panel, Select, Textarea } from '../ui/primitives';
import { ErrorState, InlineFeedback, Loading, type Feedback } from '../ui/states';

// 单一导入面：console 各页只从 './console-ui' 取共享件。一种交互只有一个形状——
// 表面 Panel、徽章 Badge、输入 Input/Select/Textarea、异步态 Loading/ErrorState/InlineFeedback。
export { Button, Badge, Panel, Input, Select, Textarea, Loading, ErrorState, InlineFeedback, type Feedback };
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
export function SmallTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
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
  initialFocus,
  restoreFocusTo,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  children: ReactNode;
  wide?: boolean;
  initialFocus?: RefObject<HTMLElement | null>;
  // Override the opener when it will be removed while the dialog is open (e.g. deleting a row).
  restoreFocusTo?: RefObject<HTMLElement | null>;
}) {
  const opener = useRef<HTMLElement | null>(null);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-rex-text/25 backdrop-blur-[2px]" />
        <Dialog.Content
          onOpenAutoFocus={(event) => {
            opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
            if (initialFocus?.current) {
              event.preventDefault();
              initialFocus.current.focus();
            }
          }}
          onCloseAutoFocus={(event) => {
            const target = restoreFocusTo?.current?.isConnected ? restoreFocusTo.current
              : opener.current?.isConnected ? opener.current : null;
            if (target) {
              event.preventDefault();
              target.focus();
            }
          }}
          className={`fixed top-1/2 left-1/2 z-50 max-h-[90dvh] w-[calc(100%_-_32px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto scroll-pt-6 scroll-pb-24 rounded-2xl border border-rex-border bg-rex-bg p-6 shadow-xl ${wide ? 'max-w-[680px]' : 'max-w-[480px]'}`}
        >
          <Dialog.Title className="pr-8 text-xl font-semibold tracking-tight">{title}</Dialog.Title>
          <Dialog.Description className="mt-2 mb-6 text-sm leading-6 text-rex-text-muted">
            {description}
          </Dialog.Description>
          <Dialog.Close asChild>
            <button
              aria-label={t("关闭弹窗")}
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
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
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
