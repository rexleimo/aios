// apps/shell/data/load.mjs — 矩阵的进程入口：把装配结果打成一份 JSON。
//
// 这是视图与数字之间唯一的通道（ADR 决策 3：能力进程持有事实，视图只 fetch）。
// Next 界面不 import 装配代码，而是跑本文件读 stdout——所以同一份数字既能给壳、
// 也能给 CLI/CI，且不需要把仓库内部结构暴露给打包器。
//
// 退出码契约：0 = 有矩阵（证据状态可能缺失，缺失在 sources 里可见）；1 = 采集失败。
import { buildMatrix } from './matrix.mjs';
import { collectMatrixInput } from './sources.mjs';
import { resolveProjectRoot } from '../../../scripts/lib/tooling/cli/project-root.mjs';
import { isDirectModuleInvocation } from '../../../scripts/lib/foundation/platform/module-entry.mjs';

export function loadMatrix({ rootDir, statusCollector } = {}) {
  const input = collectMatrixInput({ rootDir, statusCollector });
  return buildMatrix({
    capabilities: input.capabilities,
    status: input.status,
    sources: input.sources,
  });
}

if (isDirectModuleInvocation(import.meta.url)) {
  try {
    const rootDir = resolveProjectRoot({ env: process.env });
    process.stdout.write(`${JSON.stringify(loadMatrix({ rootDir }), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`[matrix] ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}