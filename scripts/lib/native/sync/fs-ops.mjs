import fs from 'node:fs/promises';
import path from 'node:path';

// 纯函数：比较两个路径是否指向同一位置，Windows 下忽略大小写。
export function areSamePath(left, right) {
  const normalizedLeft = path.resolve(left);
  const normalizedRight = path.resolve(right);
  if (process.platform === 'win32') {
    return normalizedLeft.toLowerCase() === normalizedRight.toLowerCase();
  }
  return normalizedLeft === normalizedRight;
}

export function createDefaultFsOps() {
  return {
    async readTextTarget(targetPath) {
      try {
        return await fs.readFile(targetPath, 'utf8');
      } catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
          return '';
        }
        throw error;
      }
    },
    async writeTextTarget(targetPath, content) {
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      await fs.writeFile(targetPath, content, 'utf8');
    },
    async removeTarget(targetPath) {
      await fs.rm(targetPath, { recursive: true, force: true });
    },
  };
}

export function normalizeText(content) {
  return String(content || '').replace(/\r\n/g, '\n');
}

export async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function backupTarget(targetPath, fsOps, backups) {
  if (backups.has(targetPath)) {
    return;
  }
  const exists = await pathExists(targetPath);
  backups.set(targetPath, {
    exists,
    content: exists ? await fsOps.readTextTarget(targetPath) : '',
  });
}

export async function rollbackTargets(backups, fsOps) {
  const entries = Array.from(backups.entries()).reverse();
  for (const [targetPath, backup] of entries) {
    if (backup.exists) {
      await fsOps.writeTextTarget(targetPath, backup.content);
    } else {
      await fsOps.removeTarget(targetPath);
    }
  }
}

// 纯函数：把文件存在状态和变更状态收敛为统一结果桶。
export function summarizeMutation(existsBefore, changed) {
  if (!changed) {
    return 'reused';
  }
  return existsBefore ? 'updated' : 'installed';
}

// 纯函数：把 repair 选项展平为后续操作可直接使用的开关。
export function normalizeRepairOptions(repair = {}) {
  const force = Boolean(repair && (repair.force === true || repair.forceReplaceManagedFiles === true));
  return {
    forceReplaceManagedFiles: force || Boolean(repair?.forceReplaceManagedFiles),
    resetInvalidJson: force || Boolean(repair?.resetInvalidJson),
  };
}
