export const SOLO_OUTCOMES = new Set(['success', 'noop', 'blocked', 'infra-retry', 'human-gate', 'stopped', 'failed']);
export const SOLO_STAGES = new Set(['research', 'requirements', 'planning', 'development', 'validation', 'handoff']);
export const SOLO_FAILURE_CLASSES = new Set([
  'none',
  'no-progress',
  'tool-error',
  'runtime-error',
  'workspace-mutation',
  'ownership-gate',
  'safety-gate',
  'stop-requested',
]);
