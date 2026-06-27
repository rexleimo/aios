/* 中文注释：平台层 barrel，集中导出跨域消费的进程/文件系统/路径能力。 */
export {
  captureCommand,
  commandExists,
  getCommandSpawnSpec,
  runCommand,
  spawnCommand,
  spawnCommandWithInput,
} from './process.mjs';

export {
  collectUnexpectedSkillRootFindings,
  copyDirRecursive,
  ensureFile,
  ensureManagedLink,
  ensureParentDir,
  isLegacyManagedSkillLink,
  isManagedLink,
  readTextIfExists,
  removeManagedDirectory,
  removeManagedLink,
  stripManagedBlock,
  stripMatchingLines,
  writeText,
} from './fs.mjs';

export {
  getAgentsHome,
  getClientHomes,
  resolvePowerShellProfilePaths,
  resolveShellRcFile,
} from './paths.mjs';
