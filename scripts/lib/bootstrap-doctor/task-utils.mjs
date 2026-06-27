// scripts/lib/bootstrap-doctor/task-utils.mjs — bootstrap 任务检查工具函数
import { promises as fs } from 'node:fs';

export function normalizeTaskRef(currentTask) {
  return currentTask.replaceAll('\\', '/').split('/').filter(Boolean);
}

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

export async function listNonHiddenEntries(dirPath) {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries.filter((entry) => !entry.name.startsWith('.')).map((entry) => entry.name);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}
