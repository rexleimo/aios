import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_LIST_LIMIT = 20;
export const DEFAULT_RECALL_HIGHLIGHT_LIMIT = 3;
export const MAX_PRINT_CHARS = 12_000;
export const DEFAULT_WORKSPACE_MEMO_ENTRY_MAX_CHARS = 1400;
export const DEFAULT_WORKSPACE_PINNED_MAX_CHARS = 5000;
export const DEFAULT_AIOS_ROOT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
);
