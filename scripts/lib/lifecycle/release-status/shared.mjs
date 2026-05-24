/* 中文注释：release-status 纯函数工具只做文本、路径和数值归一化，不读写状态文件。 */
import path from 'node:path';

// 纯函数：统一修剪用户输入，避免每个模块各自处理 null/undefined。
export function normalizeText(value = '') {
  return String(value ?? '').trim();
}

// 纯函数：解析带默认值的正整数；空值走 fallback，非法显式输入抛错。
export function parsePositiveInteger(value, fallback, flagName) {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    if (value === undefined || value === null || String(value).trim() === '') {
      return fallback;
    }
    throw new Error(`${flagName} must be a positive integer`);
  }
  return Math.floor(parsed);
}

// 纯函数：解析 0..1 的比例参数，供健康阈值和趋势阈值共用。
export function parseRate(value, fallback, flagName) {
  const text = String(value ?? '').trim();
  if (!text) return fallback;
  const parsed = Number.parseFloat(text);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new Error(`${flagName} must be a number between 0 and 1`);
  }
  return parsed;
}

// 纯函数：环境变量解析和 CLI 比例解析同规则，但错误信息保留 env 名称。
export function parseRateEnv(rawValue, fallback, envName) {
  const text = String(rawValue ?? '').trim();
  if (!text) return fallback;
  const parsed = Number.parseFloat(text);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new Error(`${envName} must be a number between 0 and 1`);
  }
  return parsed;
}

// 纯函数：报告中的路径统一为 POSIX 形式，保证 Windows/Linux 快照稳定。
export function toPosixPath(filePath = '') {
  return String(filePath || '').replace(/\\/g, '/');
}

// 纯函数：把百分比数值格式化为人读文本，缺失值显示 n/a。
export function formatRate(value, digits = 2) {
  if (!Number.isFinite(value)) return 'n/a';
  return `${(value * 100).toFixed(digits)}%`;
}

// 纯函数：趋势差值保留符号，便于报告直接看出升降。
export function formatSignedRate(value, digits = 2) {
  if (!Number.isFinite(value)) return 'n/a';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${(value * 100).toFixed(digits)}%`;
}

export function normalizeStatePath(statePath, rootDir, fallback) {
  const normalized = normalizeText(statePath);
  if (!normalized) {
    return path.resolve(fallback);
  }
  if (path.isAbsolute(normalized)) {
    return path.resolve(normalized);
  }
  return path.resolve(rootDir, normalized);
}

export function normalizeOutputPath(outputPath, rootDir) {
  const normalized = normalizeText(outputPath);
  if (!normalized) return '';
  if (path.isAbsolute(normalized)) {
    return path.resolve(normalized);
  }
  return path.resolve(rootDir, normalized);
}
