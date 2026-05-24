/* 中文注释：entropy-gc facade 保持旧导入路径稳定；扫描、证据、执行和输出已拆到 entropy-gc/*。 */
export { collectRecentReferencedArtifacts, listDispatchArtifacts, moveFileSafe, selectEntropyCandidates } from './entropy-gc/artifacts.mjs';
export { DISPATCH_ARTIFACT_RE, ENTROPY_EVENT_KIND } from './entropy-gc/constants.mjs';
export { createEntropySummary, buildEntropyEvidence, buildEntropyNextActions, normalizeEntropyFailureCategory, persistEntropyEvidence } from './entropy-gc/evidence.mjs';
export { executeEntropyGc } from './entropy-gc/execute.mjs';
export { readJsonLines, readJsonLinesOptional } from './entropy-gc/json-lines.mjs';
export { normalizeEntropyGcOptions, planEntropyGc } from './entropy-gc/options.mjs';
export { runEntropyGc } from './entropy-gc/run.mjs';
export { buildCandidateRecord, buildEntropyTurnId, formatStamp, normalizePath, normalizeText, parsePositiveInteger, toRelativePath } from './entropy-gc/shared.mjs';
