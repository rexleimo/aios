export const RECOMMENDATION_KIND_ORDER = ['fix', 'observe', 'promote'];
export const RECOMMENDATION_KIND_BASE_PRIORITY = {
  fix: 300,
  observe: 200,
  promote: 100,
};
export const RECOMMENDATION_SECTION_LABELS = {
  fix: 'Fix',
  observe: 'Observe',
  promote: 'Promote',
};

export function getQualityGateFixCommand() {
  return 'node scripts/aios.mjs quality-gate pre-pr';
}

export function getVerificationCommand() {
  return 'node scripts/aios.mjs quality-gate full';
}

export function getQualityGatePromoteCommand() {
  return 'node scripts/aios.mjs quality-gate pre-pr';
}

export function getDoctorCommand() {
  return 'node scripts/aios.mjs doctor';
}

export function getDispatchReplayCommand(sessionId) {
  return `node scripts/aios.mjs orchestrate --session ${sessionId} --dispatch local --execute dry-run --format json`;
}

export function buildOrchestrateCommand(blueprint, taskTitle, contextSummary = '') {
  const args = ['node scripts/aios.mjs', 'orchestrate', blueprint, '--task', JSON.stringify(taskTitle)];
  if (String(contextSummary || '').trim()) {
    args.push('--context', JSON.stringify(String(contextSummary).trim()));
  }
  return args.join(' ');
}

export function inferPromotionBlueprint(summary) {
  const context = [
    summary.session.goal,
    summary.session.project,
    ...summary.signals.failures.top.map((item) => item.category),
  ].join(' ').toLowerCase();

  if (/security|auth|login|permission|secret|token|privacy|compliance|audit|risk/.test(context)) {
    return 'security';
  }
  if (/refactor|cleanup|rename|restructure|simplify|dedupe|extract|tidy/.test(context)) {
    return 'refactor';
  }
  if (/bug|fix|issue|incident|error|regression|flaky|crash|repair|defect/.test(context)) {
    return 'bugfix';
  }
  return 'feature';
}

export function buildPromotionContext(summary, blueprint) {
  return `learn-eval promotion candidate for ${blueprint}; passRate=${summary.signals.verification.passRate}; retries=${summary.signals.retry.average}`;
}
