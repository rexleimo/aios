/* 中文注释：进程平台层统一跨系统启动细节，为 shell interception 提供稳定输入。 */
export { getEnvCaseInsensitive, splitWindowsPathEntries, splitWindowsPathExt } from './process/env.mjs';
export {
  getWindowsDirectCli,
  getWindowsNodeCli,
  resolveNodeScriptFromWindowsLauncher,
  resolveWindowsLauncherTarget,
  resolveWindowsCommandExt,
  resolveWindowsCommandPath,
  shouldUseWindowsShellCommand,
} from './process/windows-command.mjs';
export {
  getCommandSpawnSpec,
  commandExists,
  captureCommand,
  spawnCommand,
  spawnCommandWithInput,
  runCommand,
  splitExecutionOptions,
} from './process/spawn.mjs';
