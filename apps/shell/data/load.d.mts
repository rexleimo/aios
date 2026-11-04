// apps/shell/data/load.d.mts — load.mjs 的类型面（实现所有者仍是 load.mjs）。
import type { MatrixViewModel } from './matrix.d.mts';

export declare function loadMatrix(input?: {
  rootDir?: string;
  statusCollector?: () => { data: unknown; command: string; error: string | null };
}): MatrixViewModel;