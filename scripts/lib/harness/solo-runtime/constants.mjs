export const SOLO_OUTCOMES = new Set(['success', 'noop', 'blocked', 'infra-retry', 'human-gate', 'stopped', 'failed']);
export const SOLO_STAGES = new Set(['research', 'requirements', 'planning', 'development', 'validation', 'handoff']);
// rate-limited / provider-overloaded 可退避重试；host-unsupported / budget-exhausted
// 是 fail-closed 类（换宿主 / 等额度窗口），不允许盲目重试烧钱。
export const SOLO_FAILURE_CLASSES = new Set([
  'none',
  'no-progress',
  'tool-error',
  'runtime-error',
  'rate-limited',
  'provider-overloaded',
  'host-unsupported',
  'budget-exhausted',
  'workspace-mutation',
  'ownership-gate',
  'safety-gate',
  'stop-requested',
]);
