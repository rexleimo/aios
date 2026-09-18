import fs from 'node:fs';
import path from 'node:path';

/**
 * projectRoot 的显式声明通道。
 *
 * 历史行为是 `process.cwd()` 单一来源：runtime 根目录下执行 `--scope project` 会被
 * skills 安全门拒掉，而 wrapper/CI 设置 `AIOS_PROJECT_ROOT` 又完全不生效（该变量此前
 * 只写不读）。优先级固定为：显式 flag > 环境变量 > cwd。
 */
const PROJECT_ROOT_ENV = 'AIOS_PROJECT_ROOT';

function isDirectory(candidate) {
  try {
    return fs.statSync(candidate).isDirectory();
  } catch {
    return false;
  }
}

function usableDirectory(value, cwd) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return null;
  const resolved = path.resolve(cwd, trimmed);
  return isDirectory(resolved) ? resolved : null;
}

export function resolveProjectRoot({ flagValue, env = process.env, cwd = process.cwd() } = {}) {
  const base = path.resolve(cwd);
  const explicit = String(flagValue ?? '').trim();
  if (explicit) {
    const resolved = usableDirectory(explicit, base);
    if (!resolved) {
      throw new Error(`[err] --project-root is not a directory: ${path.resolve(base, explicit)}`);
    }
    return resolved;
  }

  // 环境变量是间接输入：指向已删除的检出时退回 cwd，不阻断整条命令。
  const fromEnv = usableDirectory(env?.[PROJECT_ROOT_ENV], base);
  if (fromEnv) return fromEnv;
  return base;
}

/**
 * 把 `--project-root` 落到 dispatch context 上。
 *
 * dispatch 的下游（setup/update/doctor/internal skills）都从同一个 context 对象读取
 * projectRoot，所以这里原地更新它，避免每个命令各自解析一遍。
 */
export function applyProjectRootFlag(context, options = {}) {
  const explicit = String(options?.projectRoot ?? '').trim();
  if (!explicit) return context.projectRoot;
  context.projectRoot = resolveProjectRoot({ flagValue: explicit, cwd: process.cwd() });
  return context.projectRoot;
}
