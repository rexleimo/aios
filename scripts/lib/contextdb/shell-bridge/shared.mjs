import { realpathSync } from 'node:fs';
import path from 'node:path';

// 纯函数：统一解析布尔环境变量，避免各分支重复维护 true/false 字面量。
export function parseBoolEnv(value, defaultValue) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return defaultValue;
  }
  const normalized = String(value).trim().toLowerCase();
  if (normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on') {
    return true;
  }
  if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') {
    return false;
  }
  return defaultValue;
}

// 纯函数：把正整数环境变量收敛到安全默认值，调用方不用重复处理 NaN。
export function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value || '').trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

// 纯函数：只根据传入 env 展开用户主目录，不读取进程全局状态。
export function expandHome(inputPath, env) {
  if (!inputPath) return inputPath;
  const home = env.HOME || env.USERPROFILE || '';
  if (inputPath === '~') return home || inputPath;
  if (inputPath.startsWith('~/') || inputPath.startsWith('~\\')) {
    return home ? path.join(home, inputPath.slice(2)) : inputPath;
  }
  return inputPath;
}

// 纯函数：按 shell 预览需求给参数加引号，保证 Windows 路径和空格路径可读。
export function formatShellArg(value = '') {
  const text = String(value ?? '');
  return /^[A-Za-z0-9_./:@=-]+$/u.test(text)
    ? text
    : `"${text.replace(/(["`$])/g, '\\$1')}"`;
}

// 平台辅助函数：路径比较需要经过 realpath，失败时退回绝对路径。
export function normalizeForCompare(inputPath) {
  let output = path.resolve(inputPath);
  try {
    output = realpathSync(output);
  } catch {
    // realpath 失败不影响比较，保留 path.resolve 的结果。
  }

  if (process.platform === 'win32') {
    return output.toLowerCase();
  }

  return output;
}
