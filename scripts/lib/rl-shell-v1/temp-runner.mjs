/* 中文注释：temp runner facade 只保留稳定 API；策略、工作区、安全命令、补丁、动作执行和验证分别拆分。 */
export { DEFAULT_POLICY, createDefaultExecutionPolicy, ensureBudgets } from './temp-runner/policy.mjs';
export { truncateText } from './temp-runner/text.mjs';
export { makeObservation, persistObservation, recordObservation } from './temp-runner/observations.mjs';
export {
  assertWorkspaceState,
  createEnv,
  createEpisodeWorkspace,
  destroyEpisodeWorkspace,
  ensureWorkspaceReadable,
  isWithinRoot,
  resolveWorkspacePath,
} from './temp-runner/workspace.mjs';
export { checkForbiddenCommand, collectFailingTests, computeVerificationStatus, normalizeFailureLabel, runCommand } from './temp-runner/command.mjs';
export { buildNoProgressFingerprint, getStopConditionCandidate, isNoProgressObservation } from './temp-runner/no-progress.mjs';
export { applyPatch, parsePatchOperations } from './temp-runner/patch.mjs';
export { executeAction } from './temp-runner/actions.mjs';
export { runBaselineFailureCheck, runVerification } from './temp-runner/verification.mjs';
