import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_ARCHITECTURE_RULES } from './rules.mjs';

export { DEFAULT_ARCHITECTURE_RULES } from './rules.mjs';

// 纯函数：统一换行统计规则，让架构预算不受平台 CRLF/LF 差异影响。
export function countSourceLines(text = '') {
  const trimmed = String(text || '').trim();
  if (!trimmed) return 0;
  return trimmed.split(/\r?\n/u).length;
}

// 纯函数：把 Windows 路径统一成仓库相对显示路径，便于测试和报告稳定。
export function normalizeArchitecturePath(filePath = '') {
  return String(filePath || '').replace(/\\/g, '/').replace(/^\.\/+/u, '');
}

async function pathExists(rootDir, relativePath) {
  try {
    await access(path.join(rootDir, relativePath));
    return true;
  } catch {
    return false;
  }
}

async function evaluateArchitectureRule(rootDir, rule) {
  const entryPath = normalizeArchitecturePath(rule.path);
  const failures = [];
  let lineCount = 0;

  try {
    const source = await readFile(path.join(rootDir, entryPath), 'utf8');
    lineCount = countSourceLines(source);
    if (lineCount > rule.maxLines) {
      failures.push(`${lineCount} lines > ${rule.maxLines}`);
    }
  } catch {
    failures.push(`missing entrypoint: ${entryPath}`);
  }

  const requiredModules = Array.isArray(rule.requiredModules) ? rule.requiredModules : [];
  const missingModules = [];
  for (const modulePath of requiredModules) {
    const normalizedPath = normalizeArchitecturePath(modulePath);
    if (!await pathExists(rootDir, normalizedPath)) {
      missingModules.push(normalizedPath);
    }
  }
  if (missingModules.length > 0) {
    failures.push(`missing modules: ${missingModules.join(', ')}`);
  }

  return {
    id: rule.id,
    label: rule.label || rule.id,
    path: entryPath,
    status: failures.length === 0 ? 'OK' : 'FAIL',
    lineCount,
    maxLines: rule.maxLines,
    failures,
    detail: failures.length === 0 ? `${lineCount} lines <= ${rule.maxLines}` : failures.join('; '),
  };
}

// 架构治理入口：集中维护 facade 预算和拆分模块归属，避免各测试各写一份规则。
export async function evaluateArchitectureGovernance({
  rootDir,
  rules = DEFAULT_ARCHITECTURE_RULES,
} = {}) {
  const checks = [];
  for (const rule of rules) {
    checks.push(await evaluateArchitectureRule(rootDir, rule));
  }

  const failed = checks.filter((item) => item.status === 'FAIL');
  const detail = failed.length === 0
    ? `${checks.length} architecture rule(s) passed`
    : failed.map((item) => `${item.label}: ${item.detail}`).join(' | ');

  return {
    ok: failed.length === 0,
    status: failed.length === 0 ? 'OK' : 'FAIL',
    detail,
    checks,
  };
}
