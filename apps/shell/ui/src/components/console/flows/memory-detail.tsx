'use client';

import { t } from '../../../i18n/t.mjs';
import { ArrowRight, Check, FileText, Layers3, History, Star } from 'lucide-react';
import { MEMO_SCOPE_LABELS, claimStatusLabel, type FactMemory } from '../../../lib/console-facts';
import { Badge, Button } from '../console-ui';

export function MemoryDetail({
  memory,
  useful,
  busy,
  actionError,
  onUseful,
  onUpdate,
  onFollow,
}: {
  memory: FactMemory;
  useful: boolean;
  busy: boolean;
  actionError: string | null;
  onUseful: () => void;
  onUpdate: () => void;
  onFollow: (id: string) => void;
}) {
  const relation = memory.supersededBy[0];
  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11px] text-rex-text-muted">
          <Layers3 size={13} />
          space {memory.space} · {MEMO_SCOPE_LABELS[memory.scope ?? ''] ?? memory.scope ?? t("范围未记录")}
        </span>
        <Badge tone={memory.claimStatus === 'verified' ? 'ok' : 'neutral'}>{claimStatusLabel(memory.claimStatus)}</Badge>
      </div>
      <h2 className="text-xl leading-8 font-semibold tracking-tight">{memory.excerpt}</h2>
      <p className="mt-2 text-[11px] text-rex-text-muted">
        
        {t("记录于")} {memory.ts}
        {memory.validAt && memory.validAt !== memory.ts ? t(" · 生效于 {value0}", { value0: memory.validAt }) : ''}
        {memory.agent ? t(" · 来自 {value0}", { value0: memory.agent }) : ''}
      </p>
      <div className="my-6 space-y-4 text-sm leading-7 text-rex-text-body">
        {/* 正文是 memo 里真实存的那一条，不是重新生成的摘要。 */}
        <p className="whitespace-pre-wrap">{memory.text}</p>
      </div>
      <div className="space-y-3 rounded-xl border border-rex-border bg-rex-panel/40 p-4 text-xs">
        <div className="flex items-center gap-2 font-medium">
          <FileText size={14} />
          
          {t("这条记忆从哪里来")}
        </div>
        <p className="leading-5 text-rex-text-muted">
          {memory.sourceRef ? memory.sourceRef : t("来源未记录。保留已有内容，不补造出处。")}
          {memory.provenanceTrust ? t(" · 信任级别 {value0}", { value0: memory.provenanceTrust }) : ''}
        </p>
        <div className="border-t border-rex-border pt-3 text-rex-text-muted">
          
          {t("适用范围：")}{MEMO_SCOPE_LABELS[memory.scope ?? ''] ?? t("未记录")}
          {memory.refs.length > 0 ? t(" · 引用 {value0} 项", { value0: memory.refs.length }) : ''}
        </div>
      </div>
      {relation && (
        <button
          onClick={() => onFollow(relation)}
          className="mt-4 flex w-full items-center gap-2 rounded-lg bg-rex-panel p-3 text-left text-xs text-rex-cyan focus-visible:outline-2 focus-visible:outline-rex-cyan"
        >
          <History size={15} />
          
          {t("查看取代它的新记录")}
          <ArrowRight size={14} className="ml-auto" />
        </button>
      )}
      <details className="mt-5 rounded-xl border border-rex-border px-4 py-3">
        <summary className="cursor-pointer text-xs text-rex-text-muted focus-visible:outline-2 focus-visible:outline-rex-cyan">
          
          {t("技术详情")}
        </summary>
        <p className="mt-3 break-all font-rex-mono text-[10px] leading-5 text-rex-text-muted">
          event id：{memory.id}
          {memory.checkpoint ? t(" · 类型 checkpoint（里程碑）") : ''}
        </p>
      </details>
      <div className="mt-6 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={onUseful} disabled={useful || busy}>
          {useful ? <Check size={14} /> : <Star size={14} />}
          {useful ? t("已标记有用") : busy ? t("执行中") : t("这条有用")}
        </Button>
        <Button size="sm" variant="ghost" onClick={onUpdate} disabled={busy}>
          
          {t("更新这条事实")}
        </Button>
      </div>
      {/* 动作是真的：`memo useful` / `memo add --supersedes`，命令原文与结果一并如实显示。 */}
      <p className="mt-3 text-[10px] leading-5 text-rex-text-muted">
        
        {t("「这条有用」写一条召回反馈（")}<code>aios memo useful &lt;id&gt;</code>{t("），它会提高这条以后被召回的概率；\r\n        「更新这条事实」新增一条并让旧条目退出召回（")}<code>aios memo add … --supersedes &lt;id&gt;</code>{t("），历史保留。")}
      </p>
      {actionError && <p className="mt-2 text-[11px] leading-5 text-rex-danger">{t("上一步没成功：")}{actionError}</p>}
    </>
  );
}
