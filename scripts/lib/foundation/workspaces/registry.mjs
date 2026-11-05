// 工作区注册表：AIOS 怎么知道这台机器上有哪些项目。
//
// 只写「索引」，不写内容：路径、名字、最后活跃时间、三项计数。记忆正文/会话内容/代码
// 一律不进这个文件——一旦它开始存内容，就有了第二个真相源，而两个真相源迟早会不一致。
//
// 每个工作区一个文件（键 = 路径的 sha1 前 12 位），原子写（temp → rename）：
// 两个项目同时启动不会互相覆盖，也不需要文件锁。
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const REGISTRY_DIRNAME = path.join('.aios', 'workspaces');
export const REGISTRY_OPTOUT_ENV = 'AIOS_NO_WORKSPACE_REGISTRY';
/** 只允许这些键；多一个键就是一次设计泄漏，测试会失败。 */
export const ALLOWED_KEYS = Object.freeze(['schemaVersion', 'path', 'name', 'lastSeenAt', 'aiosVersion', 'counts']);

export function registryRoot(homeDir = os.homedir()) {
  return path.join(homeDir, REGISTRY_DIRNAME);
}

export function workspaceKey(rootDir) {
  return createHash('sha1').update(path.resolve(rootDir)).digest('hex').slice(0, 12);
}

export function registryPath(rootDir, homeDir = os.homedir()) {
  return path.join(registryRoot(homeDir), `${workspaceKey(rootDir)}.json`);
}

export function registryDisabled(env = process.env) {
  return String(env[REGISTRY_OPTOUT_ENV] ?? '').trim() === '1';
}

function countJsonl(file) {
  try {
    return fs.readFileSync(file, 'utf8').split('\n').filter((line) => line.trim().length > 0).length;
  } catch {
    return 0;
  }
}

/** 计数只数本地文件，不跑子进程：登记必须便宜到可以在每次 session start 里做。 */
export function countWorkspace(rootDir) {
  const state = path.join(rootDir, '.aios');
  return {
    sessions: (() => {
      try {
        return fs.readdirSync(path.join(state, 'context-db', 'sessions'), { withFileTypes: true })
          .filter((entry) => entry.isDirectory()).length;
      } catch {
        return 0;
      }
    })(),
    memos: countJsonl(path.join(state, 'memo', 'file', 'events.jsonl')),
    plans: (() => {
      try {
        return fs.readdirSync(path.join(state, 'plans')).length;
      } catch {
        return 0;
      }
    })(),
  };
}

/**
 * 登记一次「这个项目被 AIOS 用过了」。返回写入路径，或 null（已关闭/写失败）。
 * 写失败不抛：登记是旁路事实，它不该让一次 session start 失败。
 */
export function recordWorkspace({ rootDir, aiosVersion = null, now = new Date(), homeDir = os.homedir(), env = process.env } = {}) {
  if (!rootDir || registryDisabled(env)) return null;
  const entry = {
    schemaVersion: 1,
    path: path.resolve(rootDir),
    name: path.basename(path.resolve(rootDir)),
    lastSeenAt: now.toISOString(),
    aiosVersion: aiosVersion ?? null,
    counts: countWorkspace(rootDir),
  };
  try {
    const dir = registryRoot(homeDir);
    fs.mkdirSync(dir, { recursive: true });
    const target = registryPath(rootDir, homeDir);
    const temporary = `${target}.tmp-${process.pid}`;
    fs.writeFileSync(temporary, `${JSON.stringify(entry, null, 2)}\n`);
    fs.renameSync(temporary, target);
    return target;
  } catch {
    return null;
  }
}

/** 读所有登记项；`path` 不存在或超期的标出来，不删——删除是用户的决定。 */
export function listWorkspaces({ homeDir = os.homedir(), now = Date.now(), staleAfterMs = 90 * 24 * 3600_000 } = {}) {
  const dir = registryRoot(homeDir);
  let files = [];
  try {
    files = fs.readdirSync(dir).filter((name) => name.endsWith('.json'));
  } catch {
    return [];
  }
  const entries = [];
  for (const name of files) {
    try {
      const entry = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
      const missing = !fs.existsSync(entry.path ?? '');
      const ageMs = now - Date.parse(entry.lastSeenAt ?? 0);
      entries.push({ ...entry, missing, stale: !missing && Number.isFinite(ageMs) && ageMs > staleAfterMs });
    } catch {
      // 坏文件跳过：一个损坏的登记项不该让整页变空。
    }
  }
  entries.sort((left, right) => String(right.lastSeenAt ?? '').localeCompare(String(left.lastSeenAt ?? '')));
  return entries;
}
