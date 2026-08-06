// scripts/lib/lifecycle/install-state.mjs
// 幂等安装状态：记录每个 component 的完成状态，支持 --retry 断点续跑。
// 状态文件放在 .aios/install-state.json（AIOS 状态根内，gitignored）。

import fs from 'node:fs';
import path from 'node:path';

import { resolveAiosStateRoot } from '../aios/state-root.mjs';

const INSTALL_STATE_FILENAME = 'install-state.json';

export function readInstallState(projectRoot, { env = process.env } = {}) {
  const statePath = path.join(resolveAiosStateRoot(projectRoot, { env }), INSTALL_STATE_FILENAME);
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.completed)) {
      return { statePath, completed: new Set(parsed.completed) };
    }
  } catch {
    // 文件不存在或损坏：视为全新状态
  }
  return { statePath, completed: new Set() };
}

export function writeInstallState(statePath, completed) {
  const payload = {
    schemaVersion: 1,
    kind: 'aios.install-state.v1',
    updatedAt: new Date().toISOString(),
    completed: [...completed].sort(),
  };
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  const tmpPath = `${statePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(payload, null, 2), 'utf8');
  fs.renameSync(tmpPath, statePath);
}

export function markComponentCompleted(statePath, completed, component) {
  // 原地更新调用方持有的 Set，保证连续多次标记时状态不丢失。
  completed.add(component);
  writeInstallState(statePath, completed);
  return completed;
}
