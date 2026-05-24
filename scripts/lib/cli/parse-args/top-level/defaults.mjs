/* 中文注释：顶层命令默认值集中在这里，parseTopLevelArgs 只负责调度。 */
import {
  createDefaultDoctorOptions,
  createDefaultEntropyGcOptions,
  createDefaultLearnEvalOptions,
  createDefaultOrchestrateOptions,
  createDefaultQualityGateOptions,
  createDefaultReleaseStatusOptions,
  createDefaultSetupOptions,
  createDefaultSnapshotRollbackOptions,
  createDefaultUninstallOptions,
  createDefaultUpdateOptions,
} from '../shared.mjs';

export function getCommandDefaults(command) {
  if (command === 'setup') return createDefaultSetupOptions();
  if (command === 'update') return createDefaultUpdateOptions();
  if (command === 'uninstall') return createDefaultUninstallOptions();
  if (command === 'doctor') return createDefaultDoctorOptions();
  if (command === 'quality-gate') return createDefaultQualityGateOptions();
  if (command === 'orchestrate') return createDefaultOrchestrateOptions();
  if (command === 'entropy-gc') return createDefaultEntropyGcOptions();
  if (command === 'snapshot-rollback') return createDefaultSnapshotRollbackOptions();
  if (command === 'release-status') return createDefaultReleaseStatusOptions();
  return createDefaultLearnEvalOptions();
}
