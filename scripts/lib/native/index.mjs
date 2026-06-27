/* 中文注释：Native barrel，集中导出 source-tree/doctor/repairs/route-commands/emitters 等公开能力。 */
export { doctorNativeEnhancements } from './doctor.mjs';
export { syncNativeEnhancements } from './sync.mjs';
export {
  getNativeRepair,
  listNativeRepairs,
  rollbackNativeRepair,
} from './repairs.mjs';
export {
  checkRouteTriggerCommandsSync,
  syncRouteTriggerCommands,
} from './route-commands.mjs';
export {
  AIOS_NATIVE_BEGIN_MARK,
  AIOS_NATIVE_END_MARK,
} from './emitters/shared.mjs';
export { NATIVE_SYNC_META_FILE } from './install-metadata.mjs';
