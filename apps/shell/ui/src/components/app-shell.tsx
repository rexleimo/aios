'use client';

// The console frame: a grouped sidebar and a scrolling content column.
//
// It is a client component for exactly one reason — `usePathname` decides which item is
// current. Everything it renders is still passed in from a server component, so no fact
// crosses the boundary.
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Blocks,
  BookMarked,
  Gauge,
  LayoutDashboard,
  Settings2,
  MessagesSquare,
  Wrench,
} from 'lucide-react';

import { cn } from '../lib/cn';
import { NAV_GROUPS, sectionsIn, type SectionId } from '../lib/sections';

const ICONS: Record<SectionId, typeof LayoutDashboard> = {
  overview: LayoutDashboard,
  sessions: MessagesSquare,
  memory: BookMarked,
  tools: Wrench,
  settings: Settings2,
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen bg-rex-bg">
      <aside className="sticky top-0 flex h-screen w-[228px] shrink-0 flex-col border-r border-rex-border bg-rex-panel">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <span className="grid size-7 place-items-center rounded-rex-sm bg-rex-cyan text-[13px] font-bold text-white">
            A
          </span>
          <div className="leading-tight">
            <p className="font-rex-display text-sm font-semibold text-rex-text">AIOS</p>
            <p className="text-[11px] text-rex-text-soft">控制台</p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-4">
          {NAV_GROUPS.map((group) => {
            const items = sectionsIn(group);
            if (items.length === 0) return null;
            return (
              <div key={group} className="mb-4">
                <p className="px-2 pb-1.5 text-[10px] font-semibold tracking-[0.12em] text-rex-text-soft uppercase">
                  {group}
                </p>
                <ul className="space-y-0.5">
                  {items.map((section) => {
                    const Icon = ICONS[section.id] ?? Blocks;
                    const active = pathname === section.href;
                    return (
                      <li key={section.id}>
                        <Link
                          href={section.href}
                          aria-current={active ? 'page' : undefined}
                          className={cn(
                            'flex items-center gap-2.5 rounded-rex-sm px-2 py-1.5 text-[13px] transition-colors motion-reduce:transition-none',
                            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rex-cyan',
                            active
                              ? 'bg-rex-bg font-medium text-rex-text ring-1 ring-rex-border'
                              : 'text-rex-text-muted hover:bg-rex-panel-soft hover:text-rex-text',
                          )}
                        >
                          <Icon className={cn('size-4', active ? 'text-rex-cyan' : 'text-rex-text-soft')} />
                          {section.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </nav>

        <div className="border-t border-rex-border px-4 py-3">
          <p className="flex items-center gap-1.5 text-[11px] text-rex-text-muted">
            <Gauge className="size-3.5 text-rex-green" />
            能力进程已连接
          </p>
          <p className="mt-0.5 font-rex-mono text-[10px] text-rex-text-soft">127.0.0.1</p>
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-x-hidden">
        <div className="mx-auto w-full max-w-[1120px] px-8 py-7">{children}</div>
      </main>
    </div>
  );
}
