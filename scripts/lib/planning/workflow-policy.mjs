/**
 * Pure, client-neutral workflow policy. Adapters decide how to persist a
 * decision; this module never reads or writes planning state.
 */

import {
  describeAiosCapability,
  evaluateAiosSoftwareRequest,
} from '../workflows/rex-harness-adapter.mjs';
import { RESUME_PREFIX } from './resume-phrases.mjs';

export const WORKFLOW_POLICY_MODES = Object.freeze(['adaptive', 'strict']);

export const WORKFLOW_DISPOSITIONS = Object.freeze([
  'noop',
  'direct',
  'guarded',
  'planned',
  'blocked',
]);

export const WORKFLOW_CONTINUATIONS = Object.freeze([
  'none',
  'same-session-ack',
  'explicit-resume',
  'missing',
]);

export const WORKFLOW_PERSISTENCE = Object.freeze(['none', 'reuse', 'create']);

const TERMINAL_PLAN_STATUSES = new Set([
  'done',
  'blocked',
  'cancelled',
  'canceled',
  'completed',
  'failed',
  'abandoned',
]);

const ACKNOWLEDGEMENTS = new Set([
  'ok',
  'okay',
  'yes',
  'y',
  'sure',
  'approved',
  'approve',
  'confirmed',
  'confirm',
  'goahead',
  'soundsgood',
  '\u53ef\u4ee5',
  '\u53ef\u4ee5\u7684',
  '\u597d',
  '\u597d\u7684',
  '\u6536\u5230',
  '\u540c\u610f',
  '\u8ba4\u53ef',
  '\u786e\u8ba4',
  '\u6ca1\u95ee\u9898',
]);

const ACKNOWLEDGEMENT_PREFIX = /^(?:ok(?:ay)?|yes|y|sure|approved?|confirmed?|go\s+ahead|sounds\s+good|\u53ef\u4ee5\u7684?|\u597d\u7684?|\u6536\u5230|\u540c\u610f|\u8ba4\u53ef|\u786e\u8ba4|\u6ca1\u95ee\u9898)[\s,;:!?\u3002\u3001\uff0c\uff01\uff1f-]*/iu;

/* 北极星原则：本模块只认显式协议前缀（确认/恢复）与显式 intent，绝不用关键词
 * 正则从自由文本猜"是否只读 / 是否有新目标 / 是什么任务类型 / 是否多步 / 是否
 * 团队或长任务"。语义判断（实质行动、只读、计划需求、团队/长任务路由）一律由
 * 调用方显式声明（explicitIntent / capabilityDecision）；程序只保留确定性簿记
 * 与回退默认值，不替模型做任何语义猜测。 */

function text(value = '') {
  return String(value || '').replace(/\s+/gu, ' ').trim();
}

function identity(value = '') {
  return text(value).toLowerCase();
}

function compact(value = '') {
  return text(value)
    .toLowerCase()
    .replace(/[\s,;:!?()[\]{}'"`~_.\-\u3002\u3001\uff0c\uff01\uff1f]+/gu, '');
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function routeFromPlan(plan) {
  const route = identity(plan?.route);
  return ['implement', 'debug', 'design', 'verify', 'ops', 'team', 'harness'].includes(route)
    ? route
    : 'implement';
}

function explicitIntentValue(explicitIntent) {
  if (typeof explicitIntent === 'string') return identity(explicitIntent);
  if (!isObject(explicitIntent)) return '';
  return identity(
    explicitIntent.intent
    || explicitIntent.kind
    || explicitIntent.route
    || explicitIntent.disposition
    || explicitIntent.action,
  );
}

/**
 * Map an explicit intent to a generic route. 北极星原则：只映射显式 intent，
 * 不从自由文本猜任务类型。无显式 intent 时统一回退到默认 implement（仅作为
 * 确定性兜底，不做语义判断）。message 保留为参数以兼容调用签名。
 */
function routeForText(message, intent) {
  void message;
  switch (intent) {
    case 'implement': return 'implement';
    case 'tickets': return 'planning';
    case 'spec':
    case 'grill': return 'requirements';
    case 'review': return 'verify';
    case 'debug': return 'debug';
    case 'wayfinder': return 'implement';
    case 'team': return 'team';
    case 'harness': return 'harness';
    case 'design': return 'design';
    case 'verify': return 'verify';
    case 'ops': return 'ops';
    default: return 'implement';
  }
}

function isExplicitPlanIntent(intent) {
  return ['planned', 'plan', 'tickets', 'spec', 'grill', 'team', 'harness', 'design', 'wayfinder'].includes(intent);
}

function isExplicitDirectIntent(intent) {
  return ['direct', 'read-only', 'readonly', 'analysis', 'status', 'explain'].includes(intent);
}

function isExplicitAcknowledgement(intent) {
  return ['ack', 'acknowledgement', 'acknowledgment', 'confirm'].includes(intent);
}

function isExplicitResume(intent) {
  return ['continue', 'continuation', 'resume'].includes(intent);
}

function isPotentialCodeChange(route) {
  return ['implement', 'debug', 'ops', 'team', 'harness'].includes(route);
}

function skillsForDecision(disposition, route, {
  explicitPlan = false,
  capabilityDecision = null,
  executionHost = 'single',
} = {}) {
  const providerKind = String(capabilityDecision?.provider?.kind || '').trim();
  const selectedProvider = providerKind === 'skill'
    ? String(capabilityDecision?.provider?.id || '').trim()
    : '';
  // rex 当前 Command 始终优先；Team/Harness 只是承载这条 Command 的执行宿主。
  if (selectedProvider) return [selectedProvider];
  if (providerKind === 'agent') return [];
  // Only a current Rex Command may name a Provider. Hosts never revive a
  // compatibility playbook chain when Rex has not selected one.
  void disposition;
  void route;
  void explicitPlan;
  void executionHost;
  return [];
}

function agentForDecision(capabilityDecision) {
  if (capabilityDecision?.provider?.kind !== 'agent') return null;
  return String(capabilityDecision.provider.id || '').trim() || null;
}

function decision({
  disposition,
  continuation = 'none',
  persistence = 'none',
  requiredSkills = [],
  requiredAgent = null,
  requiresPreEditSafety = false,
  verificationScope = 'none',
  routeHint = 'none',
  executionHost = 'single',
  reason,
  plan = null,
  capabilityDecision = null,
}) {
  return {
    disposition,
    continuation,
    persistence,
    requiredSkills,
    requiredAgent,
    requiresPreEditSafety,
    verificationScope,
    routeHint,
    executionHost,
    reason,
    plan,
    capabilityDecision,
    // Existing auto-gate consumers use started/reuse action labels.
    action: persistence === 'create' ? 'started' : persistence,
  };
}

/** Normalize an unknown policy value to the safe default. */
export function normalizeWorkflowPolicyMode(policyMode = 'adaptive') {
  return identity(policyMode) === 'strict' ? 'strict' : 'adaptive';
}

/** A terminal plan cannot be continued, regardless of its client metadata. */
export function isTerminalPlan(plan) {
  return isObject(plan) && TERMINAL_PLAN_STATUSES.has(identity(plan.status));
}

export function hasUsableActivePlan(plan) {
  return isObject(plan) && !isTerminalPlan(plan);
}

/**
 * Weak acknowledgements only attach to the originating client/session. Legacy
 * callers without either session id retain same-client behavior; a partially
 * populated session identity is intentionally rejected.
 */
export function isSameSessionPlan(plan, { client, sessionId } = {}) {
  if (!hasUsableActivePlan(plan)) return false;

  const planClient = identity(plan.client);
  const requestClient = identity(client);
  if (
    !planClient
    || !requestClient
    || planClient === 'unknown'
    || requestClient === 'unknown'
    || planClient !== requestClient
  ) return false;

  const planSession = identity(plan.sessionId);
  const requestSession = identity(sessionId);
  if (!planSession && !requestSession) return true;
  return Boolean(planSession && requestSession && planSession === requestSession);
}

export function isAcknowledgementMessage(message = '') {
  return ACKNOWLEDGEMENTS.has(compact(message));
}

export function isExplicitResumeMessage(message = '') {
  return RESUME_PREFIX.test(text(message));
}

/** Detect a replacement objective after an acknowledgement or resume prefix.
 * 北极星原则：只认确定性协议前缀（确认/恢复）+ 非空 tail，不再用关键词正则
 * 从 tail 猜"是否有新目标"。非空 tail 的存在即视为新的可行动目标。 */
export function hasNewActionableObjective(message = '') {
  const value = text(message);
  const acknowledgement = ACKNOWLEDGEMENT_PREFIX.exec(value);
  if (acknowledgement) {
    const tail = value.slice(acknowledgement[0].length).trim();
    return Boolean(tail);
  }

  const resume = RESUME_PREFIX.exec(value);
  if (!resume) return false;
  const tail = value.slice(resume[0].length).trim();
  return Boolean(tail);
}

/** 北极星原则：程序不从自由文本猜"是否只读"。只读由调用方显式声明
 * （explicit-intent: read-only/direct/analysis/status/explain）。此处恒返回
 * false，作为确定性兜底，避免程序替模型做语义判断。 */
export function isReadOnlyMessage(message = '') {
  void message;
  return false;
}

/** 北极星原则：程序不从自由文本猜"是否实质行动"。实质行动由显式 intent 或
 * capabilityDecision 声明；程序层不做任何语义判断，统一视为实质行动（确定性
 * 兜底，是否落计划由 needsPlan/显式 intent 决定）。 */
function isSubstantiveMessage(message, intent, capabilityDecision = null) {
  void message;
  void intent;
  void capabilityDecision;
  return true;
}

/** 显式直接/实施类 intent（非计划意图）在 adaptive 模式下优先于 capability 的
 * 默认计划：用户显式声明"直接干"，就应尊重，不因 capability plannedByDefault
 * 而强制建计划。plan 类 intent（planned/tickets/spec/grill/team/harness/design/
 * wayfinder）仍进入计划分支。strict 模式始终计划（在 needsPlan 首行处理）。 */
function isExplicitNonPlanningIntent(intent) {
  return [
    'implement', 'direct', 'read-only', 'readonly', 'analysis', 'status',
    'explain', 'debug', 'verify', 'ops', 'guarded', 'review',
  ].includes(intent);
}

function needsPlan(message, intent, route, policyMode, capabilityPolicy) {
  void message;
  if (policyMode === 'strict') return true;
  if (isExplicitNonPlanningIntent(intent)) return false;
  if (isExplicitPlanIntent(intent)) return true;
  if (route === 'team' || route === 'harness' || route === 'design') return true;
  if (capabilityPolicy.plannedByDefault) return true;
  return false;
}

/**
 * Classify a turn without side effects. Persistence is an instruction to an
 * adapter, not a filesystem operation.
 */
export function evaluateWorkflowPolicy({
  message = '',
  activePlan = null,
  policyMode = 'adaptive',
  client = '',
  sessionId = '',
  explicitIntent = null,
  observations = [],
  completedCapabilities = [],
} = {}) {
  const value = text(message);
  const mode = normalizeWorkflowPolicyMode(policyMode);
  const intent = explicitIntentValue(explicitIntent);

  if (!value) {
    return decision({ disposition: 'noop', reason: 'empty-message' });
  }

  const newObjective = hasNewActionableObjective(value);
  const resume = !newObjective && (isExplicitResume(intent) || isExplicitResumeMessage(value));
  if (resume) {
    if (hasUsableActivePlan(activePlan)) {
      return decision({
        disposition: 'direct',
        continuation: 'explicit-resume',
        persistence: 'reuse',
        routeHint: ['team', 'harness'].includes(routeFromPlan(activePlan)) ? 'implement' : routeFromPlan(activePlan),
        executionHost: ['team', 'harness'].includes(routeFromPlan(activePlan)) ? routeFromPlan(activePlan) : 'single',
        reason: 'explicit-resume',
        plan: activePlan,
      });
    }
    return decision({
      disposition: 'direct',
      continuation: 'missing',
      routeHint: 'direct',
      reason: 'resume-without-active-plan',
    });
  }

  const acknowledgement = !newObjective && (isExplicitAcknowledgement(intent) || isAcknowledgementMessage(value));
  if (acknowledgement) {
    if (isSameSessionPlan(activePlan, { client, sessionId })) {
      return decision({
        disposition: 'direct',
        continuation: 'same-session-ack',
        persistence: 'reuse',
        routeHint: ['team', 'harness'].includes(routeFromPlan(activePlan)) ? 'implement' : routeFromPlan(activePlan),
        executionHost: ['team', 'harness'].includes(routeFromPlan(activePlan)) ? routeFromPlan(activePlan) : 'single',
        reason: 'same-session-acknowledgement',
        plan: activePlan,
      });
    }
    return decision({
      disposition: 'direct',
      continuation: 'missing',
      routeHint: 'direct',
      reason: 'acknowledgement-without-same-session-plan',
    });
  }

  if (intent === 'noop') {
    return decision({ disposition: 'noop', reason: 'explicit-noop-intent' });
  }

  if (isExplicitDirectIntent(intent)) {
    return decision({
      disposition: 'direct',
      routeHint: 'direct',
      reason: 'explicit-direct-intent',
    });
  }

  const software = evaluateAiosSoftwareRequest({
    message: value,
    explicitIntent,
    observations,
    completedCapabilities,
  });
  const capabilityDecision = software.decision;
  const capabilityPolicy = describeAiosCapability(capabilityDecision);

  if (capabilityDecision?.blocked) {
    return decision({
      disposition: 'blocked',
      routeHint: 'blocked',
      reason: capabilityDecision.blockedReason || 'rex-capability-blocked',
      capabilityDecision,
    });
  }

  if (!isSubstantiveMessage(value, intent, capabilityDecision)) {
    return decision({
      disposition: 'direct',
      routeHint: 'direct',
      reason: 'non-actionable-message',
    });
  }

  const genericRoute = routeForText(value, intent);
  const promotedHost = ['team', 'harness'].includes(software.promotion?.target)
    ? software.promotion.target
    : null;
  const executionHost = promotedHost
    || (['team', 'harness'].includes(genericRoute) ? genericRoute : 'single');
  const explicitRoute = {
    grill: 'requirements',
    spec: 'requirements',
    tickets: 'planning',
    review: 'verify',
    debug: 'debug',
    implement: 'implement',
    wayfinder: 'implement',
  }[intent] || null;
  const route = explicitRoute
    || (genericRoute === 'ops'
      ? 'ops'
      : (capabilityDecision ? capabilityPolicy.routeHint : 'implement'));
  const planned = executionHost !== 'single'
    || needsPlan(value, intent, route, mode, capabilityPolicy);
  const disposition = planned ? 'planned' : 'guarded';
  const explicitPlan = intent === 'plan' || intent === 'planned';
  return decision({
    disposition,
    persistence: planned ? 'create' : 'none',
    requiredSkills: skillsForDecision(disposition, route, {
      explicitPlan,
      capabilityDecision,
      executionHost,
    }),
    requiredAgent: agentForDecision(capabilityDecision),
    requiresPreEditSafety: capabilityDecision
      ? capabilityPolicy.mayEdit
      : isPotentialCodeChange(route),
    verificationScope: planned ? 'full' : 'focused',
    routeHint: route,
    executionHost,
    reason: capabilityDecision
      ? `rex-capability-selected:${capabilityDecision.capabilityId}`
      : planned
        ? (mode === 'strict' ? 'strict-substantive-change' : 'planned-substantive-change')
        : 'adaptive-guarded-change',
    capabilityDecision,
  });
}
