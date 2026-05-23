import fs from 'node:fs/promises';

import { AIOS_ROUTE_COMMAND_BEGIN, AIOS_ROUTE_COMMAND_END } from './constants.mjs';

// 纯函数：判断现有文件是否由 AIOS route command 管理。
export function isManagedRouteCommand(content = '') {
  const text = String(content || '');
  return text.includes(AIOS_ROUTE_COMMAND_BEGIN) && text.includes(AIOS_ROUTE_COMMAND_END);
}

export async function readOptional(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') return '';
    throw error;
  }
}

// 纯函数：创建单个客户端的同步统计框。
export function createResult(client) {
  return {
    client,
    installed: 0,
    updated: 0,
    reused: 0,
    skipped: 0,
    removed: 0,
  };
}
