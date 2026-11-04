// apps/shell/data/matrix.d.mts — matrix.mjs 的类型面。
// 实现的所有者仍是 matrix.mjs；这里只声明它的公开形状，让 TS 侧（Next）能类型化地调用。

export type AxisId =
  | 'sessionStartInjection'
  | 'preToolRewrite'
  | 'controlledShellRunner'
  | 'mcpProxy'
  | 'compactPacket'
  | 'advisorySkills'
  | 'metrics';

export type LevelId = 'L0' | 'L1' | 'L2' | 'L3';

export type EvidenceLabel = 'pending-smoke' | 'compatibility-only' | 'evidence-blocked' | 'not-covered';

export interface MatrixAxisCell {
  axis: string;
  declared: boolean;
}

export interface MatrixEvidence {
  clientId: string;
  covered: boolean;
  flags: string[];
  label: string;
}

export interface MatrixRow {
  clientId: string;
  level: string | null;
  axes: MatrixAxisCell[];
  declaredCount: number;
  axisTotal: number;
  limits: string[];
  evidenceRef: string | null;
  entrypoint: string | null;
  directHostBypassAllowed: boolean | null;
  evidence: MatrixEvidence;
}

export interface MatrixSource {
  field: string;
  origin: string;
}

export interface MatrixViewModel {
  schemaVersion: number;
  generatedAt: string | null;
  overallStatus: string | null;
  axes: string[];
  levelPoints: Record<string, number>;
  rows: MatrixRow[];
  blockers: string[];
  coverage: { declared: number; evidenceCovered: number; declaredOnly: string[] };
  sources: MatrixSource[];
}

export declare const MATRIX_SCHEMA_VERSION: number;
export declare const EVIDENCE_FLAG_PRIORITY: readonly string[];
export declare function evidenceFor(clientId: string, status?: unknown): MatrixEvidence;
export declare function buildRow(clientId: string, entry?: unknown, status?: unknown): MatrixRow;
export declare function buildMatrix(input: {
  capabilities?: unknown;
  status?: unknown;
  sources?: MatrixSource[];
}): MatrixViewModel;