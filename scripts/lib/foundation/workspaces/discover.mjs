// scripts/lib/foundation/workspaces/discover.mjs — 本机工作区清单：注册表登记 ∪ 文件系统证据。
//
// 为什么要有它：`~/.aios/workspaces/<key>.json` 注册表自加入起只产了读端 (`listWorkspaces`) 与测试，
// **零写者**（实测 grep 全仓 `recordWorkspace` 只有测试引用），所以任何问「这台机器上有哪些工程在用
// AIOS」的界面只能拿到空清单。写者已在 memory-mcp-server 与 start-session 两处接上；这一层负责把
// 「登记过的」和「磁盘上确实有记忆仓的」合成同一份清单，因为写者缺失的那段时间里，真实被用过的工程
// 并没有被登记——它们的数据就是证据，不是猜测。
//
// 身份只有一个所有者：`key` 一律由 registry.mjs 的 `workspaceKey()` 算，这里不复制哈希规则。
import fs from 'node:fs';
import path from 'node:path';

import { listWorkspaces, workspaceKey } from './registry.mjs';

/** 一个工程被认定为「本机工作区」的客观证据：它有自己的记忆仓。 */
const MEMO_EVIDENCE = ['.aios', 'memo', 'file', 'events.jsonl'];
/** 扫描广度上限：只看扫描根的直接子目录，不递归整块盘。 */
const SCAN_CHILDREN = 400;

export function memoEvidencePath(rootDir) {
  return path.join(rootDir, ...MEMO_EVIDENCE);
}

/**
 * 扫描根 = 允许列表的边界。默认取当前工程根的父目录（本机实测 `E:/coding`）加工程根本身；
 * 用 `AIOS_WORKSPACE_SCAN_ROOTS`（path.delimiter 分隔）显式覆盖。
 * 不递归、不跨盘、不接受调用方传来的任意路径。
 */
export function scanRoots({ rootDir, env = process.env } = {}) {
  const declared = String(env.AIOS_WORKSPACE_SCAN_ROOTS ?? '')
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);
  const current = path.resolve(rootDir ?? process.cwd());
  const roots = declared.length > 0 ? declared : [path.dirname(current), current];
  return [...new Set(roots.map((entry) => path.resolve(entry)))].filter((entry) => {
    try {
      return fs.statSync(entry).isDirectory();
    } catch {
      return false;
    }
  });
}

/** 记忆仓里最后一条事件的时间 + 条数：这是「这个工程上次被用到」的客观依据。 */
function memoEvidenceStats(rootDir) {
  try {
    const lines = fs
      .readFileSync(memoEvidencePath(rootDir), 'utf8')
      .split(/\r?\n/u)
      .filter((line) => line.trim().length > 0);
    let newest = '';
    for (const line of lines) {
      try {
        const ts = String(JSON.parse(line).ts ?? '');
        if (ts > newest) newest = ts;
      } catch {
        // 坏行不当时间证据，也不因此丢掉整个工作区
      }
    }
    return { lastActivityAt: newest || null, memos: lines.length };
  } catch {
    return { lastActivityAt: null, memos: 0 };
  }
}

function countSessions(rootDir) {
  const dir = path.join(rootDir, '.aios', 'context-db', 'sessions');
  try {
    // 只数有 meta.json 的目录：会话目录可能是测试残留，没有元数据就不是一条会话。
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(dir, entry.name, 'meta.json'))).length;
  } catch {
    return 0;
  }
}

/**
 * 本机工作区清单，按「当前工程第一，其余按记忆仓最后活动时间倒序」。
 * `origin` 说清每一条是怎么来的：`registered` / `evidence` / 两者都有。
 */
export function discoverWorkspaces({ rootDir = process.cwd(), homeDir, env = process.env } = {}) {
  const current = path.resolve(rootDir);
  const byPath = new Map();

  for (const entry of listWorkspaces(homeDir ? { homeDir } : {})) {
    const absolute = entry?.path ? path.resolve(entry.path) : '';
    if (!absolute) continue;
    byPath.set(absolute, {
      path: absolute,
      name: entry.name || path.basename(absolute),
      origin: ['registered'],
      registeredLastSeenAt: entry.lastSeenAt ?? null,
      missing: entry.missing === true,
      stale: entry.stale === true,
    });
  }

  for (const scan of scanRoots({ rootDir: current, env })) {
    let children = [];
    try {
      children = fs
        .readdirSync(scan, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .slice(0, SCAN_CHILDREN)
        .map((entry) => path.join(scan, entry.name));
    } catch {
      continue;
    }
    for (const candidate of [...children, scan]) {
      const absolute = path.resolve(candidate);
      const hasEvidence = fs.existsSync(memoEvidencePath(absolute));
      const isCurrent = absolute === current;
      if (!hasEvidence && !isCurrent) continue;
      const known = byPath.get(absolute);
      if (known) {
        if (!known.origin.includes('evidence')) known.origin.push('evidence');
        known.missing = false;
      } else {
        byPath.set(absolute, {
          path: absolute,
          name: path.basename(absolute),
          origin: ['evidence'],
          registeredLastSeenAt: null,
          missing: false,
          stale: false,
        });
      }
    }
  }

  const items = [...byPath.values()].map((item) => {
    const stats = memoEvidenceStats(item.path);
    return {
      key: workspaceKey(item.path),
      ...item,
      current: item.path === current,
      lastActivityAt: stats.lastActivityAt,
      memos: stats.memos,
      sessions: countSessions(item.path),
    };
  });

  items.sort((left, right) => {
    if (left.current !== right.current) return left.current ? -1 : 1;
    return String(right.lastActivityAt ?? '').localeCompare(String(left.lastActivityAt ?? ''));
  });
  return items;
}

/**
 * key → 工作区。**只在本次清单里查**：命中才给路径，裸路径在这里没有解析能力。
 * 失败返回 `{ ok:false, reason, detail }`，让调用方如实显示，而不是抛异常糊过去。
 */
export function resolveWorkspaceKey(key, { rootDir, homeDir, env = process.env } = {}) {
  const wanted = String(key ?? '').trim();
  if (!/^[0-9a-f]{12}$/u.test(wanted)) {
    return { ok: false, reason: 'bad-key', detail: `工作区标识必须是 12 位十六进制摘要，收到「${wanted || '(空)'}」` };
  }
  const items = discoverWorkspaces({ rootDir, homeDir, env });
  const hit = items.find((item) => item.key === wanted);
  if (!hit) {
    return { ok: false, reason: 'not-listed', detail: '这个标识不在本机工作区清单里；清单会随真实使用变化，重新加载即可' };
  }
  if (hit.missing) {
    return { ok: false, reason: 'missing', detail: `登记的路径 ${hit.path} 在本机已不存在` };
  }
  return { ok: true, workspace: hit, items };
}
