export { getEnvCaseInsensitive, splitWindowsPathEntries, splitWindowsPathExt } from './process/env.mjs';
export {
  getWindowsNodeCli,
  resolveNodeScriptFromWindowsLauncher,
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
