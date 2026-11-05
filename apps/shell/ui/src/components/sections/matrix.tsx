// 接入矩阵：13 × 7，声明与证据分开呈现。
//
// 表格行为仍是 TanStack + Radix（`matrix-table.tsx`），这里只负责页头与图例；
// 事实仍然只有一条通道：`data/load.mjs` 的 stdout。
import { MatrixTable } from '../matrix-table';
import { loadMatrixSnapshot } from '../../lib/data/matrix-loader';
import { Freshness, PageHeader } from '../page-frame';
import { Badge } from '../ui/primitives';

export const dynamic = 'force-dynamic';

export async function MatrixSection() {
  const { matrix, cached, ageMs, stale } = await loadMatrixSnapshot();
  return (
    <>
      <PageHeader
        title="接入矩阵"
        description="每格只表达「配置里是否声明了这条能力」。逐轴原因并不存在——点击客户端可看该行 limits 原文与证据引用。"
        source="apps/shell/data/load.mjs（config/host-capabilities.json + aios status --json）"
        status={{ label: `覆盖 ${matrix.coverage.evidenceCovered}/${matrix.coverage.declared}`, tone: 'info' }}
        freshness={<Freshness cached={cached} ageMs={ageMs} stale={stale} />}
      />

      <div className="mb-4 rounded-rex-md border border-rex-border bg-rex-panel px-4 py-3 text-[12px] leading-relaxed text-rex-text-body">
        <p className="font-medium text-rex-text">这张表在回答什么</p>
        <p className="mt-1 text-rex-text-muted">
          对每个客户端：AIOS 能把它接到什么程度。<b>已声明</b>表示配置里承诺了这条能力（能注入会话、
          能改写请求、能跑受控命令……），<b>证据</b>列表示这件事在这台机器上被验证到哪一步。
          点「详情」可以看到该行的限制原文，并对这个客户端执行预览安装 / 安装修复。
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 text-[12px] text-rex-text-muted">
        <span className="font-medium">图例</span>
        <Badge tone="info">已声明</Badge>
        <span className="text-rex-text-soft">·</span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="inline-block size-3 rounded-[3px] border border-rex-text-soft" />
          未声明
        </span>
        <span className="text-rex-text-soft">·</span>
        <Badge tone="warn">未覆盖</Badge>
        <Badge tone="violet">待验证</Badge>
        <Badge tone="danger">证据阻断</Badge>
        <Badge tone="neutral">仅兼容层</Badge>
      </div>

      <div className="overflow-x-auto rounded-rex-md border border-rex-border">
        <MatrixTable matrix={matrix} />
      </div>
    </>
  );
}
