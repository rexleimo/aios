// 接入矩阵：13 × 7，声明与证据分开呈现。
//
// 表格行为仍是 TanStack + Radix（`matrix-table.tsx`），这里只负责页头与图例；
// 事实仍然只有一条通道：`data/load.mjs` 的 stdout。
import { MatrixTable } from '../matrix-table';
import { loadMatrixFromCapability } from '../../lib/matrix-loader';
import { PageHeader } from '../page-frame';
import { Badge } from '../ui/primitives';

export const dynamic = 'force-dynamic';

export function MatrixSection() {
  const matrix = loadMatrixFromCapability();
  return (
    <>
      <PageHeader
        title="接入矩阵"
        description="每格只表达「配置里是否声明了这条能力」。逐轴原因并不存在——点击客户端可看该行 limits 原文与证据引用。"
        source="apps/shell/data/load.mjs（config/host-capabilities.json + aios status --json）"
        status={{ label: `覆盖 ${matrix.coverage.evidenceCovered}/${matrix.coverage.declared}`, tone: 'info' }}
      />

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
