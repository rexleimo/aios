/* 中文注释：native repairs facade 只保留稳定 API，快照、清单、查询和回滚分别由子模块负责。 */
export { REPAIRS_ROOT_REL, REPAIR_KIND, MANIFEST_FILE } from './repairs/constants.mjs';
export { normalizeRelativePath, toAbsolute } from './repairs/paths.mjs';
export { diffSnapshots, formatRepairId, snapshotTargets } from './repairs/snapshot.mjs';
export {
  assertNativeRepairManifestKind,
  readRepairManifest,
  resolveRepairManifest,
  writeRepairManifest,
} from './repairs/manifest.mjs';
export { createNativeRepairSession, finalizeNativeRepairSession } from './repairs/session.mjs';
export { getNativeRepair, listNativeRepairs, mapRepairDetail } from './repairs/query.mjs';
export { rollbackNativeRepair } from './repairs/rollback.mjs';
