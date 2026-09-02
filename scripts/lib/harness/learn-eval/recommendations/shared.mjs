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

export function inferPromotionBlueprint(_summary) {
  // 北极星原则：程序不根据文本关键词猜测 promotion 蓝图类型；
  // 蓝图选择是语义判断，上移给 LLM/显式声明，程序一律返回中性 feature。
  return 'feature';
}

export function buildPromotionContext(summary, blueprint) {
  return `learn-eval promotion candidate for ${blueprint}; passRate=${summary.signals.verification.passRate}; retries=${summary.signals.retry.average}`;
}
