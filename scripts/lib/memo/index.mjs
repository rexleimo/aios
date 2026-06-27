/* 中文注释��Memo barrel，集中导出 persona/workspace-memory/storage 子路径中跨域消费的能力。 */
export { buildPersonaOverlay } from './persona.mjs';

export {
  ensureWorkspaceMemorySession,
  normalizeWorkspaceMemorySpace,
  workspaceMemoryEventsPath,
  workspaceMemoryMetaPath,
  workspaceMemoryPinnedPath,
  workspaceMemorySessionDir,
  workspaceMemorySessionId,
} from './workspace-memory.mjs';

export {
  appendMemoEvent,
} from './storage/events-write.mjs';
export { readJsonlEvents, collectEvents } from './storage/events-read.mjs';
export { listMemoEvents, searchMemoEvents } from './storage/query.mjs';
export { getActiveMemoStorage } from './storage/config.mjs';
export { normalizeMemoStorageName, normalizeMemoScope } from './storage/normalizers.mjs';
export { atomicWriteText } from './storage/fs-io.mjs';
export { fileEventsPath } from './storage/paths.mjs';
export { readPinnedMemo } from './storage/pinned.mjs';
