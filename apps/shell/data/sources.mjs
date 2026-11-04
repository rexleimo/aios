// apps/shell/data/sources.mjs — 矩阵输入的唯一采集点。
//
// 唯一职责：把「数字从哪来」变成数据，而不是把来源写在界面文案里。
// 界面里每一个数字都必须能在 `sources` 里找到一条同名字段，否则它就是手写常量。
//
// 采集策略（实测决定，不是偏好）：
//   - 能力声明来自 `config/host-capabilities.json`（读文件，稳定）
//   - 证据状态来自 `node scripts/aios.mjs status --json`（子进程，可能失败或超时）
//   - status 不可用时**不猜**：返回 null，由视图层的 `not-covered` 表达「没有证据」，
//     并把这条失败本身记进 sources——缺失也要有出处。

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

export const CAPABILITIES_REL_PATH = 'config/host-capabilities.json';
export const STATUS_KIND = 'aios.status.v1';
export const STATUS_TIMEOUT_MS = 30_000;

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

/** 只认 `aios.status.v1`：结构变了必须失败，不能拿字段名相似的别的东西冒充证据状态。 */
export function parseStatusPayload(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (parsed?.kind !== STATUS_KIND) return null;
  return parsed;
}

export function readCapabilities(rootDir) {
  const file = path.join(rootDir, CAPABILITIES_REL_PATH);
  return { data: readJson(file), file, command: `read ${CAPABILITIES_REL_PATH}` };
}

/** 默认 status 采集器：跑一次真实 CLI。测试注入替身，所以本函数不在单测里起子进程。 */
export function createStatusCollector({ rootDir, spawnImpl = spawnSync, timeoutMs = STATUS_TIMEOUT_MS } = {}) {
  const script = path.join(rootDir, 'scripts', 'aios.mjs');
  const command = `node scripts/aios.mjs status --json`;
  return () => {
    const result = spawnImpl(process.execPath, [script, 'status', '--json'], {
      cwd: rootDir,
      encoding: 'utf8',
      timeout: timeoutMs,
      maxBuffer: 8 * 1024 * 1024,
    });
    if (result?.error) {
      return { data: null, command, error: String(result.error.message ?? result.error) };
    }
    const data = parseStatusPayload(result?.stdout ?? '');
    return {
      data,
      command,
      error: data ? null : `status output is not a ${STATUS_KIND} payload`,
    };
  };
}

/**
 * 矩阵的全部输入 + 每条输入的来源。返回的 `sources` 不含任何数值本身，只含出处；
 * 数值由 buildMatrix 现算，所以出处与数字不可能各自漂移。
 */
export function collectMatrixInput({ rootDir, statusCollector } = {}) {
  const capabilities = readCapabilities(rootDir);
  const collect =
    statusCollector ?? createStatusCollector({ rootDir });
  const status = collect();
  const sources = [
    { field: 'rows[*].axes / rows[*].level / rows[*].limits / rows[*].evidenceRef', origin: capabilities.command },
    { field: 'rows[*].evidence / blockers / coverage', origin: status.command },
  ];
  if (status.error) {
    sources.push({ field: 'rows[*].evidence=not-covered（本次证据不可用）', origin: `${status.command} -> ${status.error}` });
  }
  return {
    capabilities: capabilities.data,
    status: status.data,
    rootDir,
    sources,
  };
}