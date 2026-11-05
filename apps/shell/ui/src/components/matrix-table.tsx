'use client';

// 接入矩阵的表格。
//
// 无头库分工（不写手写 CSS，样式全部是 Tailwind utility）：
//   - @tanstack/react-table：列定义、排序、行状态——它只管行为，不管长相
//   - @radix-ui/react-popover：单元格详情的定位/焦点/ESC/外部点击，无障碍由它担保
import { useMemo, useState } from 'react';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import * as Popover from '@radix-ui/react-popover';

import { AXIS_LABEL, EVIDENCE_LABEL } from '../lib/labels';
import { cn } from '../lib/cn';
import { Badge, Input } from './ui/primitives';
import { ActionButton } from './ui/action-button';

import type { MatrixRow, MatrixViewModel } from '../../../data/matrix.mjs';

const CELL_ON = 'inline-block size-3 rounded-[3px] bg-rex-cyan';
const CELL_OFF = 'inline-block size-3 rounded-[3px] border border-rex-text-soft';

const EVIDENCE_TONE: Record<string, 'warn' | 'danger' | 'violet' | 'neutral' | 'ok'> = {
  'not-covered': 'warn',
  'pending-smoke': 'violet',
  'compatibility-only': 'neutral',
  'evidence-blocked': 'danger',
  covered: 'ok',
};

/** 一个客户端的详情：限制原文 + evidenceRef。Radix 负责焦点与关闭。 */
function RowDetail({ row }: { row: MatrixRow }) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="cursor-pointer text-left text-[11px] text-rex-cyan underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-rex-cyan"
        >
          {row.declaredCount}/{row.axisTotal} 轴 · 详情
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          sideOffset={6}
          align="start"
          className="z-50 max-w-[420px] rounded-rex-sm border border-rex-border bg-rex-bg-elevated p-4 text-[13px] text-rex-text-body shadow-[0_18px_60px_rgba(16,24,40,0.12)]"
        >
          <p className="font-rex-mono text-[11px] text-rex-text-muted">{row.clientId}</p>
          <p className="mt-1 text-[11px] text-rex-text-soft">
            等级 {row.level ?? '—'} · 证据引用 {row.evidenceRef ?? '无'}
          </p>
          <p className="mt-2 text-[11px] text-rex-text-muted">已声明的能力：</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {row.axes.filter((cell) => cell.declared).length === 0 ? (
              <span className="text-[11px] text-rex-text-soft">（一个都没有声明）</span>
            ) : (
              row.axes
                .filter((cell) => cell.declared)
                .map((cell) => (
                  <span
                    key={cell.axis}
                    className="rounded-full bg-rex-panel-strong px-1.5 py-0.5 font-rex-mono text-[10px] text-rex-text-body"
                  >
                    {AXIS_LABEL[cell.axis] ?? cell.axis}
                  </span>
                ))
            )}
          </div>
          <ul className="mt-2 list-disc space-y-1 pl-4 leading-relaxed">
            {row.limits.length > 0 ? (
              row.limits.map((limit) => <li key={limit}>{limit}</li>)
            ) : (
              <li className="text-rex-text-muted">配置未声明行级限制</li>
            )}
          </ul>
          <div className="mt-3 flex flex-wrap items-start gap-2 border-t border-rex-border pt-3">
            {/* 预览是只读（--dry-run），安装写主目录所以需要一次显式确认。 */}
            <ActionButton
              actionId="client.setup.preview"
              client={row.clientId}
              label="预览安装"
              variant="outline"
            />
            <ActionButton
              actionId="client.setup.apply"
              client={row.clientId}
              label="安装 / 修复"
              confirm
            />
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function MatrixTable({ matrix }: { matrix: MatrixViewModel }) {
  const columnHelper = createColumnHelper<MatrixRow>();
  const [filter, setFilter] = useState('');

  const columns = useMemo(() => {
    const axisColumns = matrix.axes.map((axis, index) =>
      columnHelper.accessor((row) => row.axes[index]?.declared === true, {
        id: axis,
        header: () => AXIS_LABEL[axis] ?? axis,
        cell: (context) => {
          const declared = context.getValue();
          return (
            <span
              className={declared ? CELL_ON : CELL_OFF}
              aria-label={declared ? '已声明' : '未声明'}
            />
          );
        },
      }),
    );

    return [
      columnHelper.accessor('clientId', {
        header: '客户端',
        cell: (context) => (
          <div className="flex min-w-[150px] flex-col gap-1">
            <span className="font-rex-mono text-[12px] font-medium whitespace-nowrap">
              {context.getValue()}
            </span>
            <RowDetail row={context.row.original} />
          </div>
        ),
      }),
      ...axisColumns,
      columnHelper.accessor((row) => row.level, {
        id: 'level',
        header: '等级',
        cell: (context) => (
          <span className="font-rex-mono text-[12px] text-rex-text-muted">
            {context.getValue() ?? '—'}
          </span>
        ),
      }),
      columnHelper.accessor((row) => row.evidence.label, {
        id: 'evidence',
        header: '证据',
        cell: (context) => {
          const label = context.getValue();
          return (
            <Badge tone={EVIDENCE_TONE[label] ?? 'neutral'}>
              {EVIDENCE_LABEL[label] ?? label}
            </Badge>
          );
        },
      }),
    ];
  }, [matrix.axes]);

  const table = useReactTable({
    data: matrix.rows,
    columns,
    state: { globalFilter: filter },
    onGlobalFilterChange: setFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return (
    <div>
      <div className="flex items-center justify-between gap-3 border-b border-rex-border bg-rex-panel px-4 py-2.5">
        <Input
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="筛选客户端，例如 claude"
          aria-label="筛选客户端"
          className="h-8 w-[240px] bg-rex-bg text-[12px]"
        />
        <span className="font-rex-mono text-[11px] text-rex-text-muted">
          {table.getRowModel().rows.length} / {matrix.rows.length} 行
        </span>
      </div>
      <table className="w-full border-collapse bg-rex-bg">
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  scope="col"
                  className="border-b border-rex-border bg-rex-bg px-3 py-2 text-left align-bottom text-[11px] font-medium tracking-wide whitespace-nowrap text-rex-text-muted"
                >
                  {header.isPlaceholder ? null : (
                    <button
                      type="button"
                      onClick={header.column.getToggleSortingHandler()}
                      className={cn(
                        'focus-visible:outline-2 focus-visible:outline-rex-cyan',
                        header.column.getCanSort() ? 'cursor-pointer select-none' : 'cursor-default',
                      )}
                      title={AXIS_LABEL[header.column.id] ?? undefined}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getIsSorted() === 'asc'
                        ? ' ↑'
                        : header.column.getIsSorted() === 'desc'
                          ? ' ↓'
                          : ''}
                    </button>
                  )}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id} className="transition-colors motion-reduce:transition-none hover:bg-rex-panel/60">
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="border-b border-rex-border px-3 py-2 align-middle">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
