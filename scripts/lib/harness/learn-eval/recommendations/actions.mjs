export const DISPATCH_HINDSIGHT_FAILURE_ACTIONS = {
  'ownership-policy': {
    targetType: 'runbook',
    targetId: 'runbook.dispatch-merge-triage',
    reason: 'Dispatch hindsight shows repeated ownership/policy blockage; fix file ownership boundaries before retrying parallel execution.',
    priority: 50,
  },
  contract: {
    targetType: 'runbook',
    targetId: 'runbook.dispatch-merge-triage',
    reason: 'Dispatch hindsight shows repeated handoff contract blockage; ensure subagents emit a single JSON handoff conforming to the schema before retrying.',
    priority: 50,
  },
  timeout: {
    targetType: 'gate',
    targetId: 'gate.timeout-budget',
    reason: 'Dispatch hindsight shows repeated timeouts; add wait/timeout budgets or split work-items before retrying.',
    priority: 45,
  },
  'dependency-blocked': {
    targetType: 'runbook',
    targetId: 'runbook.failure-triage',
    reason: 'Dispatch hindsight shows repeat blocked-by-dependency turns; ensure dependencies complete and unblock the merge gate before retrying.',
    priority: 40,
  },
  'unsupported-job': {
    targetType: 'runbook',
    targetId: 'runbook.tool-repair',
    reason: 'Dispatch hindsight shows repeated unsupported job errors; repair orchestrator tooling/runtime before retrying.',
    priority: 40,
  },
  'runtime-error': {
    targetType: 'runbook',
    targetId: 'runbook.tool-repair',
    reason: 'Dispatch hindsight shows repeated runtime errors; stabilize tooling and capture a recovery path before retrying.',
    priority: 40,
  },
  default: {
    targetType: 'runbook',
    targetId: 'runbook.failure-triage',
    reason: 'Dispatch hindsight shows recurring regressions or repeated blocked turns; stabilize the failing jobs before retrying.',
    priority: 45,
  },
};

export const HINDSIGHT_DRAFT_GATE_TARGETS = {
  timeout: 'gate.timeout-budget',
  'ownership-policy': 'gate.blocked-triage',
  contract: 'gate.blocked-triage',
  'dependency-blocked': 'gate.blocked-triage',
  'runtime-error': 'gate.quality-triage',
  'unsupported-job': 'gate.quality-triage',
};
export const HINDSIGHT_DRAFT_SKILL_PATCH_CANDIDATES = {
  'ownership-policy': {
    skillId: 'skill-constraints',
    scope: 'ownership-policy',
    patchHint: 'Add ownership boundary and ownedPathPrefixes preflight guidance for parallel phases before execution.',
  },
  contract: {
    skillId: 'skill-constraints',
    scope: 'handoff-contract',
    patchHint: 'Reinforce single-JSON handoff contract validation before merge-gate execution.',
  },
  timeout: {
    skillId: 'aios-long-running-harness',
    scope: 'timeout-budget',
    patchHint: 'Add timeout budgets and split long work-items before retrying repeated blocked turns.',
  },
  'dependency-blocked': {
    skillId: 'aios-long-running-harness',
    scope: 'dependency-gating',
    patchHint: 'Add dependency completion checks before retry-blocked resume workflows.',
  },
  'runtime-error': {
    skillId: 'debug',
    scope: 'runtime-triage',
    patchHint: 'Add evidence-first runtime triage sequence before retries in unstable flows.',
  },
  'unsupported-job': {
    skillId: 'aios-project-system',
    scope: 'runtime-capability',
    patchHint: 'Clarify executor/job-type compatibility and fallback routing for unsupported job failures.',
  },
};

export const FAILURE_CATEGORY_ACTIONS = {
  auth: {
    targetType: 'gate',
    targetId: 'gate.auth-preflight',
    reason: 'Auth-related failures are recurring; add a reusable login/session-validity check before execution.',
    priority: 40,
  },
  timeout: {
    targetType: 'gate',
    targetId: 'gate.timeout-budget',
    reason: 'Timeouts are recurring; add wait-budget checks or split long actions before dispatch.',
    priority: 40,
  },
  network: {
    targetType: 'gate',
    targetId: 'gate.retry-backoff',
    reason: 'Network failures are recurring; standardize retry/backoff and transient-error handling.',
    priority: 40,
  },
  permission: {
    targetType: 'gate',
    targetId: 'gate.human-approval',
    reason: 'Permission-related failures suggest the workflow needs a clear human approval or access check.',
    priority: 40,
  },
  'rate-limit': {
    targetType: 'gate',
    targetId: 'gate.rate-limit-pacing',
    reason: 'Rate limits are recurring; add pacing and cooldown controls before retries.',
    priority: 40,
  },
  'quality-build': {
    targetType: 'gate',
    targetId: 'gate.quality-build',
    reason: 'Build failures are recurring inside the local quality gate; repair the build before dispatch.',
    priority: 40,
  },
  'quality-types': {
    targetType: 'gate',
    targetId: 'gate.quality-types',
    reason: 'Typecheck failures are recurring inside the local quality gate; fix type errors before dispatch.',
    priority: 40,
  },
  'quality-scripts': {
    targetType: 'gate',
    targetId: 'gate.quality-scripts',
    reason: 'Script test failures are recurring inside the local quality gate; stabilize script coverage before dispatch.',
    priority: 40,
  },
  'quality-contextdb': {
    targetType: 'gate',
    targetId: 'gate.quality-contextdb',
    reason: 'ContextDB regressions are recurring inside the local quality gate; repair context pack/index behavior before dispatch.',
    priority: 40,
  },
  'quality-logs': {
    targetType: 'gate',
    targetId: 'gate.quality-log-audit',
    reason: 'The local quality gate is failing on stdout log audit; remove accidental debug logs or tighten the allowlist for intentional CLI output.',
    priority: 40,
  },
  'quality-security': {
    targetType: 'gate',
    targetId: 'gate.quality-security',
    reason: 'Security config failures are recurring inside the local quality gate; repair the security checklist before dispatch.',
    priority: 40,
  },
  'quality-git': {
    targetType: 'gate',
    targetId: 'gate.quality-git',
    reason: 'Git state checks are failing inside the local quality gate; repair repository health before dispatch.',
    priority: 35,
  },
  'quality-multi': {
    targetType: 'gate',
    targetId: 'gate.quality-triage',
    reason: 'Multiple quality-gate checks are failing together; triage the failing checks before dispatch.',
    priority: 35,
  },
  tool: {
    targetType: 'runbook',
    targetId: 'runbook.tool-repair',
    reason: 'Generic tool failures are recurring; capture the recovery path in a reusable runbook.',
    priority: 40,
  },
  'merge-gate-blocked': {
    targetType: 'runbook',
    targetId: 'runbook.dispatch-merge-triage',
    reason: 'Dry-run orchestration is blocking at the merge gate; resolve ownership or blocked handoff issues before enabling a real runtime.',
    priority: 45,
  },
  default: {
    targetType: 'runbook',
    targetId: 'runbook.failure-triage',
    reason: 'Failures are recurring; document a short triage path before promoting the workflow.',
    priority: 40,
  },
};


// 纯函数：从推荐证据中提取排序强度，保证 fix/observe/promote 的排序可复用且稳定。
