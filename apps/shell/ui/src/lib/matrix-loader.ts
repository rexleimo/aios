// apps/shell/ui/lib/matrix-loader.ts — 视图侧唯一的取数通道。
//
// 为什么是「跑一次 data/load.mjs 读 stdout」而不是 import 它的代码：
//   1. ADR 决策 3 把事实归给能力进程，视图只 fetch。这条边界要能被机器看到。
//   2. import 会把仓库内部结构（scripts/lib/…）拖进打包图，Turbopack 会因为其中的
//      路径扫描要求整仓 trace（实测构建告警）。子进程通道没有这个问题。
//   3. 同一份矩阵 JSON 既能给壳、也能给 CLI/CI，不依赖打包器能否解析跨目录的 .mjs。
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

import type { MatrixViewModel } from '../../../data/matrix.mjs';
import { withSnapshotStale } from './snapshot-cache.mjs';

const execFileAsync = promisify(execFile);

export const MATRIX_LOAD_TIMEOUT_MS = 45_000;

function repoRoot(): string {
  // ui 在 apps/shell/ui，向上三层即仓库根；AIOS_PROJECT_ROOT 优先（部署时可显式声明）。
  return process.env.AIOS_PROJECT_ROOT ?? path.resolve(process.cwd(), '..', '..', '..');
}

/**
 * 取矩阵。失败时抛出而不是返回空壳：空矩阵在界面上会被读成「什么都没接」，
 * 那是假账；错误必须显式成为一次失败态。
 */
export interface MatrixSnapshot {
  matrix: MatrixViewModel;
  cached: boolean;
  ageMs: number;
  stale: boolean;
}

/**
 * The matrix with its freshness. The spawn takes ~9.9 s (it runs `aios status`), so the
 * snapshot is reused inside the TTL and the page prints the age instead of pretending
 * the numbers are live.
 */
export async function loadMatrixSnapshot(): Promise<MatrixSnapshot> {
  const snapshot = withSnapshotStale(`matrix:${repoRoot()}`, () => loadMatrixFromCapability());
  if (!snapshot.payload) {
    const payload = await snapshot.refresh();
    return { matrix: payload as MatrixViewModel, cached: false, ageMs: 0, stale: false };
  }
  if (snapshot.stale) void snapshot.refresh();
  return {
    matrix: snapshot.payload as MatrixViewModel,
    cached: snapshot.cached,
    ageMs: snapshot.ageMs,
    stale: snapshot.stale,
  };
}

export async function loadMatrixFromCapability(): Promise<MatrixViewModel> {
  const root = repoRoot();
  const script = path.join(root, 'apps', 'shell', 'data', 'load.mjs');
  // Async for the same reason as `capability.mjs`: a synchronous spawn blocks the event
  // loop, so the skeleton cannot be flushed and the window stays blank for seconds.
  const { stdout } = await execFileAsync(process.execPath, [script], {
    cwd: root,
    encoding: 'utf8',
    timeout: MATRIX_LOAD_TIMEOUT_MS,
    maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, AIOS_PROJECT_ROOT: root },
  });
  const parsed = JSON.parse(stdout) as MatrixViewModel;
  if (parsed?.schemaVersion == null || !Array.isArray(parsed.rows)) {
    throw new Error('matrix load output is not a matrix view model');
  }
  return parsed;
}
