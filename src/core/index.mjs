// src/core/index.mjs — 核心基础设施层 barrel
// 收集被广泛引用的基础设施模块（aios 状态根、平台路径、进程、文件系统、锁）
// 这一层不依赖任何业务层，只被 services/adapters/harness 等上层引用
// 引用者可以使用 from '../../../src/core/index.mjs' 统一入口
// 同时保留旧的 from '../../aios/state-root.mjs' 等直接路径（向后兼容）

// === AIOS 状态根解析 ===
export {
  AIOS_STATE_DIRNAME,
  CONTEXT_DB_DIRNAME,
  MEMO_DIRNAME,
  TASKS_DIRNAME,
  WORKSPACE_DIRNAME,
  resolveAiosStateRoot,
  resolveLegacyContextDbRoot,
  resolveContextDbRoot,
  resolveContextDbPath,
  resolveMemoRoot,
  resolveMemoPath,
  resolveLegacyTasksRoot,
  resolveTasksRoot,
  resolveLegacyWorkspaceRoot,
  resolveWorkspaceStateRoot,
  toWorkspaceRelative,
  contextDbRelativePath,
  tasksRelativePath,
  memoRelativePath,
  workspaceStateRelativePath,
} from '../../scripts/lib/aios/state-root.mjs';

// === 平台路径（home/xdg/client homes）===
export {
  expandHome,
  normalizeHomeDir,
  resolveXdgConfigHome,
  getClientHomes,
  resolveShellRcFile,
  resolvePowerShellProfilePaths,
  resolvePowerShellProfilePath,
  getAgentsHome,
} from '../../scripts/lib/platform/paths.mjs';

// === 进程执行（commandExists/captureCommand/runCommand）===
export {
  commandExists,
  captureCommand,
  runCommand,
} from '../../scripts/lib/platform/process.mjs';

// === 文件系统工具 ===
export {
  ensureParentDir,
  ensureFile,
  copyDirRecursive,
  readTextIfExists,
  writeText,
  stripManagedBlock,
  stripMatchingLines,
  isManagedLink,
  ensureManagedLink,
  removeManagedLink,
} from '../../scripts/lib/platform/fs.mjs';

// === 原子写入 ===
export {
  writeFileAtomic,
} from '../../scripts/lib/fs/atomic-write.mjs';

// === 仓库锁 ===
export {
  resolveRepoLockPath,
  withRepoLock,
} from '../../scripts/lib/fs/repo-lock.mjs';

// === 共享工具（Phase 1 提取）===
export {
  normalizeText,
  computeHash,
  clone,
} from '../shared/normalize.mjs';
