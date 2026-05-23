import fs from 'node:fs/promises';
import path from 'node:path';

import { AIOS_NATIVE_JSON_KEY } from '../emitters/shared.mjs';

export async function readOptional(targetPath) {
  try {
    return await fs.readFile(targetPath, 'utf8');
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return '';
    }
    throw error;
  }
}

export async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

// 纯函数：生成规范化 doctor issue，避免各检查分支拼接不同字段。
export function buildIssue({ client, status = 'warn', message, fix }) {
  return {
    client,
    status,
    message: String(message || '').trim(),
    fix: String(fix || '').trim(),
    target: '',
  };
}

// 纯函数：按平台规则比较路径，Windows 下忽略大小写差异。
export function areSamePath(left, right) {
  const normalizedLeft = path.resolve(left);
  const normalizedRight = path.resolve(right);
  if (process.platform === 'win32') {
    return normalizedLeft.toLowerCase() === normalizedRight.toLowerCase();
  }
  return normalizedLeft === normalizedRight;
}

export function buildFixCommand(client) {
  return `node scripts/aios.mjs update --components native --client ${client}`;
}

export function formatOperationTarget(operation) {
  if (operation.kind === 'json-merge') {
    return `${operation.targetPath}#${AIOS_NATIVE_JSON_KEY}`;
  }
  return operation.targetPath;
}

// 纯函数：从 issue 文案中恢复目标路径，用于 dry-run 计划汇总。
export function parseIssueTargetFromMessage(message = '') {
  const match = String(message || '').match(/^\[[^\]]+\]\s+([^\s].*)$/u);
  if (!match) {
    return '';
  }
  const candidate = String(match[1] || '').trim();
  if (!candidate) {
    return '';
  }
  return candidate.split(/\s+/u)[0];
}

export function withIssueTarget(issue, target) {
  return {
    ...issue,
    target: String(target || '').trim(),
  };
}

export function collectPlannedFixTargets(reports = []) {
  const targets = new Set();
  for (const report of reports) {
    for (const issue of report.issues || []) {
      if (issue.target) {
        targets.add(issue.target);
      } else {
        const extracted = parseIssueTargetFromMessage(issue.message);
        if (extracted) {
          targets.add(extracted);
        }
      }
    }
  }
  return [...targets].sort((left, right) => left.localeCompare(right));
}

export function printPathList(io, prefix, items = [], maxCount = 12) {
  const total = items.length;
  io.log(`${prefix} total=${total}`);
  const shown = items.slice(0, maxCount);
  for (const item of shown) {
    io.log(`${prefix} file=${item}`);
  }
  if (total > maxCount) {
    io.log(`${prefix} ... +${total - maxCount} more`);
  }
}