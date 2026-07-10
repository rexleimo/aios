/* 中文注释：CLI 分发层把 refs、doctor、proof 等确定性入口接到统一命令面。 */
import path from 'node:path';
import { readFile } from 'node:fs/promises';

const WORKSPACE_SCOPED_COMMANDS = new Set([
  'plan',
  'dream',
  'harness',
  'hud',
  'memo',
  'orchestrate',
  'team',
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

/* 中文注释：team runtime env 把 CLI 参数转成子 agent 可读取的环境变量，保持 orchestrate 入参简洁。 */
export function buildTeamRuntimeEnv(options = {}, baseEnv = process.env) {
  const runtimeEnv = { ...baseEnv };
  const clientId = String(options.clientId || '').trim();
  if (clientId) {
    runtimeEnv.AIOS_SUBAGENT_CLIENT = clientId;
  }
  if (runtimeEnv.AIOS_MODEL_ROUTER === undefined) {
    runtimeEnv.AIOS_MODEL_ROUTER = '1';
  }
  const workers = Number.parseInt(String(options.workers ?? '').trim(), 10);
  if (Number.isFinite(workers) && workers > 0) {
    runtimeEnv.AIOS_SUBAGENT_CONCURRENCY = String(workers);
  }
  if (String(options.executionMode || '').trim().toLowerCase() === 'live') {
    runtimeEnv.AIOS_EXECUTE_LIVE = '1';
  }
  return runtimeEnv;
}
