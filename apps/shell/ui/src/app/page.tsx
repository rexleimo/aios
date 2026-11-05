// 接入矩阵第一屏（服务端组件）。
//
// 本页不含任何数字字面量：所有值来自能力侧的 apps/shell/data/load.mjs（它只从
// `config/host-capabilities.json` 与 `aios status --json` 取数）。视图与事实之间只有一条
// 通道：`lib/matrix-loader.ts`。这条约束由
// `scripts/tests/tooling/shell/matrix-sources.test.mjs` 机器判定，不靠注释。
// 表格行为交给无头库（TanStack Table + Radix Popover），样式交给 Tailwind utility。
import { AXIS_LABEL, EVIDENCE_LABEL } from '../lib/labels';
import { loadMatrixFromCapability } from '../lib/matrix-loader';
import { MatrixTable } from '../components/matrix-table';

export const dynamic = 'force-dynamic';

/** 非零即有：不与 0 比较，好让「页面无数字字面量」这条可机器判定。 */
function hasEntries(list: readonly unknown[]): boolean {
  return Boolean(list && list.length);
}

export default function MatrixPage() {
  const matrix = loadMatrixFromCapability();
  const coveredCount = matrix.coverage.evidenceCovered;

  return (
    <>
      <header className="border-b border-rex-text-soft px-8 py-6">
        <h1 className="font-rex-display text-2xl tracking-tight">AIOS 接入矩阵</h1>
        <p className="mt-1 text-sm text-rex-text-muted">
          声明 {matrix.coverage.declared} 个客户端 · 证据覆盖 {coveredCount} 个 · 未覆盖 = 没有采集面，不等于「好」
        </p>
        <p className="mt-1 font-rex-mono text-xs text-rex-text-soft">
          {matrix.generatedAt ?? '证据状态不可用'} · 总体 {matrix.overallStatus ?? 'unknown'}
        </p>
      </header>

      <main className="px-8 py-6">
        {hasEntries(matrix.blockers) && (
          <section className="mb-4 rounded-rex-sm border-l-rex-cyan bg-rex-bg-elevated px-5 py-3">
            <h2 className="font-rex-display text-sm">当前阻断（原文来自 aios status）</h2>
            <ul className="mt-1 list-disc space-y-1 pl-4 text-sm text-rex-text-body">
              {matrix.blockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          </section>
        )}

        <MatrixTable matrix={matrix} />

        <section className="mt-8 text-xs text-rex-text-muted">
          <h2 className="font-rex-display">数字从哪来</h2>
          <ul className="mt-1 list-disc space-y-1 pl-4">
            {matrix.sources.map((source) => (
              <li key={`${source.field}-${source.origin}`}>
                {source.field}：<code className="font-rex-mono break-all">{source.origin}</code>
              </li>
            ))}
          </ul>
          <p className="mt-2 font-rex-mono">
            轴：{matrix.axes.map((axis) => AXIS_LABEL[axis] ?? axis).join(' · ')} · 证据：
            {Object.values(EVIDENCE_LABEL).join(' · ')}
          </p>
        </section>
      </main>
    </>
  );
}