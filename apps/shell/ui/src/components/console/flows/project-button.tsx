'use client';

import { Folder, LockKeyhole } from 'lucide-react';

export function ProjectButton({
  name,
  description,
  active,
  locked,
  onClick,
}: {
  name: string;
  description?: string;
  active: boolean;
  locked?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={description ? `${name} · ${description}` : name}
      aria-pressed={active}
      className={`flex items-center gap-2 rounded-lg px-2.5 py-2.5 text-left text-xs focus-visible:outline-2 focus-visible:outline-rex-cyan ${active ? 'bg-rex-bg font-medium text-rex-text shadow-sm ring-1 ring-rex-border' : 'text-rex-text-muted hover:bg-rex-panel'}`}
    >
      <Folder size={14} className="shrink-0" />
      <span className="min-w-0">
        <span className="block truncate">{name}</span>
        {description && (
          <span className="mt-1 block truncate text-[10px] text-rex-text-muted" title={description}>
            {description}
          </span>
        )}
      </span>
      {locked && <LockKeyhole size={11} className="ml-auto shrink-0" />}
    </button>
  );
}
