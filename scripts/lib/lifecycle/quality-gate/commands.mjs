import { captureCommand } from '../../platform/process.mjs';
import {
  LOG_AUDIT_EXCLUDE_GLOBS,
  LOG_AUDIT_TARGETS,
  QUALITY_FAILURE_CATEGORY_BY_LABEL,
} from './constants.mjs';

// 纯函数：把子命令退出码统一映射成质量门状态。
export function summarizeCommandResult(result) {
  return result.status === 0 ? 'OK' : 'FAIL';
}

// 纯函数：只统计有内容的行，避免尾部换行影响日志命中数。
export function countNonEmptyLines(text) {
  return String(text || '')
    .split(/\r?\n/)
    .filter(Boolean)
    .length;
}

export function runCheck(command, args, options = {}) {
  return captureCommand(command, args, options);
}

export function auditConsoleLogs(rootDir, { checkRunner = runCheck } = {}) {
  const args = ['-n'];
  for (const glob of LOG_AUDIT_EXCLUDE_GLOBS) {
    args.push('-g', glob);
  }
  args.push('console\\.log', ...LOG_AUDIT_TARGETS);
  return checkRunner('rg', args, { cwd: rootDir });
}

export function summarizeGitStatus(rootDir, { checkRunner = runCheck } = {}) {
  return checkRunner('git', ['status', '--short'], { cwd: rootDir });
}

// 纯函数：从质量门结果中抽取失败标签，供报告和证据持久化复用。
export function extractFailedChecks(results = []) {
  return results
    .filter((item) => item.status === 'FAIL')
    .map((item) => item.label)
    .filter(Boolean);
}

// 纯函数：把失败标签映射成稳定分类，便于 harness 后续学习和聚合。
export function deriveQualityFailureCategory(results = []) {
  const categories = [...new Set(
    extractFailedChecks(results)
      .map((label) => QUALITY_FAILURE_CATEGORY_BY_LABEL[label])
      .filter(Boolean)
  )];

  if (categories.length === 0) {
    return undefined;
  }

  return categories.length === 1 ? categories[0] : 'quality-multi';
}