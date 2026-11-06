'use client';

import { ArrowRight, Check, FileText, Folder, History, Star } from 'lucide-react';
import { MEMORY_STATE, type DemoMemory, type DemoProject } from '../demo-data';
import { Badge, Button } from '../console-ui';

export function MemoryDetail({
  memory,
  project,
  useful,
  onUseful,
  onUpdate,
  onFollow,
}: {
  memory: DemoMemory;
  project?: DemoProject;
  useful: boolean;
  onUseful: () => void;
  onUpdate: () => void;
  onFollow: (id: string) => void;
}) {
  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11px] text-rex-text-muted">
          <Folder size={13} />
          {project?.name}
        </span>
        <Badge tone={MEMORY_STATE[memory.state].tone}>{MEMORY_STATE[memory.state].label}</Badge>
      </div>
      <h2 className="text-xl leading-8 font-semibold tracking-tight">{memory.title}</h2>
      <p className="mt-2 text-[11px] text-rex-text-muted">记录于 {memory.date}</p>
      <div className="my-6 space-y-4 text-sm leading-7 text-rex-text-body">
        {memory.paragraphs.map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
      </div>
      <div className="space-y-3 rounded-xl border border-rex-border bg-rex-panel/40 p-4 text-xs">
        <div className="flex items-center gap-2 font-medium">
          <FileText size={14} />
          这条记忆从哪里来
        </div>
        <p className="leading-5 text-rex-text-muted">{memory.source ?? '来源未记录。保留已有内容，不补造出处。'}</p>
        <div className="border-t border-rex-border pt-3 text-rex-text-muted">适用范围：{project?.name} · 本项目</div>
      </div>
      {(memory.replacedBy || memory.replaces) && (
        <button
          onClick={() => onFollow((memory.replacedBy ?? memory.replaces)!)}
          className="mt-4 flex w-full items-center gap-2 rounded-lg bg-rex-panel p-3 text-left text-xs text-rex-cyan focus-visible:outline-2 focus-visible:outline-rex-cyan"
        >
          <History size={15} />
          {memory.replacedBy ? '查看取代它的新记录' : '查看本次更新前的记录'}
          <ArrowRight size={14} className="ml-auto" />
        </button>
      )}
      <details className="mt-5 rounded-xl border border-rex-border px-4 py-3">
        <summary className="cursor-pointer text-xs text-rex-text-muted focus-visible:outline-2 focus-visible:outline-rex-cyan">
          原文与技术详情
        </summary>
        <p className="mt-3 whitespace-pre-wrap text-xs leading-6 text-rex-text-body">{memory.original}</p>
        <p className="mt-3 break-all font-rex-mono text-[10px] text-rex-text-muted">
          示例标识：{memory.project}/{memory.id}
        </p>
      </details>
      <div className="mt-6 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={onUseful} disabled={useful}>
          {useful ? <Check size={14} /> : <Star size={14} />}
          {useful ? '已标记有用' : '这条有用'}
        </Button>
        <Button size="sm" variant="ghost" onClick={onUpdate}>
          更新这条事实
        </Button>
      </div>
      <p className="mt-3 text-[10px] leading-5 text-rex-text-muted">原型中的操作仅修改示例；真实记忆保持不变。</p>
    </>
  );
}
