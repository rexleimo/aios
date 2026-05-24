export const DEFAULT_GROUPCHAT_CONFIG = Object.freeze({
  maxRounds: 10,
  concurrency: 3,
  speakerStrategy: 'blueprint-phases',
  terminationCheck: 'consensus',
  timeoutMs: 10 * 60 * 1000,
});

export const BLOCKED_STATUSES = new Set(['blocked', 'needs-input']);
export const RE_PLAN_ROLES = new Set(['planner']);
