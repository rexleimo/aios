/* 中文注释：平台和 native 规则独立分组，减少 components 规则入口职责。 */
export const NATIVE_PLATFORM_COMPONENT_RULES = Object.freeze([
  Object.freeze({
    id: 'platform-process-facade',
    label: 'Platform Process Facade',
    path: 'scripts/lib/platform/process.mjs',
    maxLines: 80,
    requiredModules: Object.freeze([
      'scripts/lib/platform/process/env.mjs',
      'scripts/lib/platform/process/windows-command.mjs',
      'scripts/lib/platform/process/spawn.mjs',
    ]),
  }),
  Object.freeze({
    id: 'native-route-commands-facade',
    label: 'Native Route Commands Facade',
    path: 'scripts/lib/native/route-commands.mjs',
    maxLines: 80,
    requiredModules: Object.freeze([
      'scripts/lib/native/route-commands/constants.mjs',
      'scripts/lib/native/route-commands/selection.mjs',
      'scripts/lib/native/route-commands/render.mjs',
      'scripts/lib/native/route-commands/io.mjs',
      'scripts/lib/native/route-commands/sync.mjs',
    ]),
  }),
  Object.freeze({
    id: 'native-sync-facade',
    label: 'Native Sync Facade',
    path: 'scripts/lib/native/sync.mjs',
    maxLines: 80,
    requiredModules: Object.freeze([
      'scripts/lib/native/sync/constants.mjs',
      'scripts/lib/native/sync/fs-ops.mjs',
      'scripts/lib/native/sync/operations.mjs',
      'scripts/lib/native/sync/apply.mjs',
      'scripts/lib/native/sync/run.mjs',
    ]),
  }),
  Object.freeze({
    id: 'native-doctor-facade',
    label: 'Native Doctor Facade',
    path: 'scripts/lib/native/doctor.mjs',
    maxLines: 80,
    requiredModules: Object.freeze([
      'scripts/lib/native/doctor/shared.mjs',
      'scripts/lib/native/doctor/inspect-operation.mjs',
      'scripts/lib/native/doctor/inspect-client.mjs',
      'scripts/lib/native/doctor/check.mjs',
      'scripts/lib/native/doctor/report.mjs',
      'scripts/lib/native/doctor/run.mjs',
    ]),
  }),
  Object.freeze({
    id: 'native-repairs-facade',
    label: 'Native Repairs Facade',
    path: 'scripts/lib/native/repairs.mjs',
    maxLines: 80,
    requiredModules: Object.freeze([
      'scripts/lib/native/repairs/constants.mjs',
      'scripts/lib/native/repairs/paths.mjs',
      'scripts/lib/native/repairs/snapshot.mjs',
      'scripts/lib/native/repairs/manifest.mjs',
      'scripts/lib/native/repairs/session.mjs',
      'scripts/lib/native/repairs/query.mjs',
      'scripts/lib/native/repairs/rollback.mjs',
    ]),
  }),
]);
