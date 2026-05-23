import os from 'node:os';
import path from 'node:path';

import { STATE_DIR, STATE_FILE_NAME } from './constants.mjs';

export function backupFilePath(filePath) {
  const ts = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  return `${filePath}.bak-${ts}`;
}

// 纯函数：统一解析用户输入路径，避免各配置写入器重复处理 "~" 和相对路径。
export function resolveUserPath(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw === '~') return os.homedir();
  if (raw.startsWith('~/') || raw.startsWith('~\\')) {
    return path.join(os.homedir(), raw.slice(2));
  }
  return path.resolve(raw);
}

export function stateFilePath(projectRoot) {
  return path.join(projectRoot, STATE_DIR, STATE_FILE_NAME);
}
