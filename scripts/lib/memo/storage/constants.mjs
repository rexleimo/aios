export const SUPPORTED_MEMO_STORAGES = Object.freeze(['split', 'file']);
export const DEFAULT_MEMO_STORAGE = 'file';

export const CONFIG_FILE = 'config.json';
export const FILE_EVENTS_SEGMENTS = Object.freeze(['file', 'events.jsonl']);
export const WORKSPACE_MEMORY_SESSION_PREFIX = 'workspace-memory--';
export const JSONL_PARSE_ERROR_CODE = 'AIOS_MEMO_STORAGE_JSONL_PARSE';
export const JSON_PARSE_ERROR_CODE = 'AIOS_MEMO_STORAGE_JSON_PARSE';

// C3 pinned block limits. The CLI env override (WORKSPACE_MEMORY_PINNED_MAX_CHARS)
// resolves through the same [min, max] window; renderPinnedBlock clamps to it
// so a bad env value can never widen the budget.
export const PINNED_MIN_MAX_CHARS = 512;
export const PINNED_HARD_MAX_CHARS = 20000;
export const PINNED_DEFAULT_MAX_CHARS = 5000;
