/* 中文注释：CLI 分发层把 refs、doctor、proof 等确定性入口接到统一命令面。 */
import path from 'node:path';
import { readFile } from 'node:fs/promises';

import { buildDispatchRuntimeEnv } from '../../harness/orchestrator-runtimes/env.mjs';

const WORKSPACE_SCOPED_COMMANDS = new Set([
  'plan',
  'dream',
  'harness',
  'hud',
  'memo',
  'orchestrate',
  'team',
  'work',
  'quality-gate',
  'snapshot-rollback',
  'entropy-gc',
  'learn-eval',
  'release-status',
  'perception',
  'refs',
  'search',
  'canvas',
  'interception',
]);

/* 中文注释：这些命令的状态属于目标 workspace，不一定属于 AIOS 安装根目录。 */
export function resolveRuntimeWorkspace(command, options = {}, { rootDir, projectRoot } = {}) {
  if (!WORKSPACE_SCOPED_COMMANDS.has(command)) return rootDir;
  const explicit = String(options.workspaceRoot || options.rootDir || '').trim();
  if (explicit) return path.resolve(explicit);
  return projectRoot;
}

/* 中文注释：workspace config 是可选的；缺失时返回空对象，让 CLI 在未初始化项目里也能运行基础命令。 */
export async function loadWorkspaceConfig(workspaceRoot) {
  const settingsPath = path.join(workspaceRoot, 'config', 'settings.json');
  try {
    return JSON.parse(await readFile(settingsPath, 'utf8'));
  } catch {
    return {};
  }
}

/* 中文注释：版本读取失败时不阻塞 CLI，安装包/源码树不完整时仍能给出诊断输出。 */
export async function getRuntimeVersion(rootDir) {
  try {
    return (await readFile(path.join(rootDir, 'VERSION'), 'utf8')).trim();
  } catch {
    return 'unknown';
  }
}

/* 中文注释：team runtime env 把 CLI 参数转成子 agent 可读取的环境变量；实现委托共享构建器，避免 team/work 双份翻译。 */
export function buildTeamRuntimeEnv(options = {}, baseEnv = process.env) {
  return buildDispatchRuntimeEnv({
    clientId: options.clientId,
    workers: options.workers,
    executionMode: options.executionMode,
  }, baseEnv);
}
