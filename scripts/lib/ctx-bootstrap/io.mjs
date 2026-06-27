// scripts/lib/ctx-bootstrap/io.mjs — 文件 I/O 工具函数
// 从 ctx-bootstrap.mjs 拆分

import { promises as fs } from 'node:fs';

export async function readTextIfExists(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return '';
    }
    throw error;
  }
}

export async function hasPendingEntries(dirPath) {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries.some((entry) => !entry.name.startsWith('.'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}
