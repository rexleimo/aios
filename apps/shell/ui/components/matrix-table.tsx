'use client';

// 接入矩阵的表格。
//
// 无头库分工（不写手写 CSS，样式全部是 Tailwind utility）：
//   - @tanstack/react-table：列定义、排序、行状态——它只管行为，不管长相
//   - @radix-ui/react-popover：单元格详情的定位/焦点/ESC/外部点击，无障碍由它担保
import { useMemo } from 'react';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import * as Popover from '@radix-ui/react-popover';

import { AXIS_LABEL, EVIDENCE_LABEL } from '../lib/labels';

import type { MatrixRow, MatrixViewModel } from '../../data/matrix.mjs';

const CELL_ON = 'inline-block size-3.5 rounded-[3px] bg-rex-cyan';
const CELL_OFF = 'inline-block size-3.5 rounded-[3px] border border-rex-text-soft';

/** 一个客户端的详情：限制原文 + evidenceRef + 证据标志。Radix 负责焦点与关闭。 */
function RowDetail({ row }: { row: MatrixRow }) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="cursor-pointer text-xs text-rex-cyan underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-rex-cyan"
        >
          限制与证据（{row.declaredCount}/{row.axisTotal} 轴）
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          sideOffset={6}
          align="start"
          className="z-50 max-w-md rounded-rex-sm border border-rex-text-soft bg-rex-bg-elevated p-3 text-sm text-rex-text-body shadow-lg"
        >
          <p className="font-rex-mono text-xs text-rex-text-muted">{row.clientId}</p>
          <ul className="mt-2 list-disc space-y-1 pl-4">
            {row.limits.length > 0 ? (
              row.limits.map((limit) => <li key={limit}>{limit}</li>)
            ) : (
              <li>配置未声明行级限制</li>
            )}
          </ul>
          <p className="mt-2 break-all font-rex-mono text-xs text-rex-text-muted">
            {row.evidenceRef ?? '无 evidenceRef'}
          </p>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function MatrixTable({ matrix }: { matrix: MatrixViewModel }) {
  // v8 的列定义需要 helper 才能拿到行类型；手写 ColumnDef[] 会让 accessorFn 的 row 退化成 any。
  const columnHelper = createColumnHelper<MatrixRow>();

  const columns = useMemo(() => {
    const axisColumns = matrix.axes.map((axis, index) =>
      columnHelper.accessor((row) => row.axes[index]?.declared === true, {
        id: axis,
        header: () => AXIS_LABEL[axis] ?? axis,
        // 声明与否可排序：让「这一轴上谁没接」能一次筛出来。
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
          <span className="flex flex-col gap-1">
            <span className="font-semibold whitespace-nowrap">{context.getValue()}</span>
            <RowDetail row={context.row.original} />
          </span>
        ),
      }),
      ...axisColumns,
      columnHelper.accessor((row) => row.level, {
        id: 'level',
        header: '等级',
        cell: (context) => <span className="font-rex-mono text-sm">{context.getValue() ?? '—'}</span>,
      }),
      columnHelper.accessor((row) => row.evidence.label, {
        id: 'evidence',
        header: '证据',
        cell: (context) => {
          const label = context.getValue();
          return (
            <span className="text-xs whitespace-nowrap text-rex-text-muted">
              {EVIDENCE_LABEL[label] ?? label}
            </span>
          );
        },
      }),
    ];
  }, [matrix.axes]);

  const table = useReactTable({
    data: matrix.rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <table className="w-full border-collapse">
      <thead>
        {table.getHeaderGroups().map((headerGroup) => (
          <tr key={headerGroup.id}>
            {headerGroup.headers.map((header) => (
              <th
                key={header.id}
                scope="col"
                className="border-b border-rex-text-soft px-3 py-2 text-left align-top font-rex-mono text-xs tracking-wider text-rex-text-muted uppercase"
              >
                {header.isPlaceholder ? null : (
                  <button
                    type="button"
                    onClick={header.column.getToggleSortingHandler()}
                    className={header.column.getCanSort() ? 'cursor-pointer select-none' : 'cursor-default'}
                    title={AXIS_LABEL[header.column.id] ?? undefined}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {header.column.getIsSorted() === 'asc' ? ' ▲' : header.column.getIsSorted() === 'desc' ? ' ▼' : ''}
                  </button>
                )}
              </th>
            ))}
          </tr>
        ))}
      </thead>
      <tbody>
        {table.getRowModel().rows.map((row) => (
          <tr key={row.id}>
            {row.getVisibleCells().map((cell) => (
              <td
                key={cell.id}
                className="border-b border-rex-text-soft px-3 py-2 align-top text-rex-text-body"
              >
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}