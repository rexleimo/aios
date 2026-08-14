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
const NEW_OBJECTIVE_MARKER = /\b(?:also|additionally|instead|switch|new\s+(?:task|objective|project|feature)|another\s+(?:task|objective|project|feature)|separately)\b|\u987a\u4fbf|\u53e6\u5916|\u6539\u4e3a|\u6362\u6210|\u65b0\u4efb\u52a1|\u65b0\u76ee\u6807|\u53e6\u8d77/iu;
const ACTION_PATTERN = /\b(?:implement|add|build|create|write|change|update|modify|refactor|fix|remove|delete|migrate|integrate|install|configure|deploy|test|run|launch|execute|develop|code|optimi[sz]e|replace|enable|disable|sync|commit|push)\b|\u5b9e\u73b0|\u65b0\u589e|\u6dfb\u52a0|\u5f00\u53d1|\u4fee\u6539|\u66f4\u65b0|\u91cd\u6784|\u4fee\u590d|\u5220\u9664|\u8fc1\u79fb|\u96c6\u6210|\u5b89\u88c5|\u914d\u7f6e|\u90e8\u7f72|\u6d4b\u8bd5|\u8fd0\u884c|\u6267\u884c|\u7f16\u5199|\u4f18\u5316|\u6539\u9020|\u8c03\u6574|\u66ff\u6362|\u5173\u95ed|\u542f\u7528|\u7981\u7528|\u540c\u6b65|\u63d0\u4ea4|\u63a8\u9001/iu;
const QUESTION_PREFIX = /^(?:why|what|how|when|where|is|are|do|does|did|why\s+did|\u4e3a\u4ec0\u4e48|\u600e\u4e48|\u5982\u4f55|\u662f\u5426|\u4ec0\u4e48|\u8bf7\u95ee)/iu;
const REQUEST_PREFIX = /^(?:can\s+you|could\s+you|would\s+you|please|help(?:\s+me)?|\u8bf7|\u5e2e\u6211|\u628a|\u9700\u8981)/iu;
const READ_ONLY_PATTERN = /\b(?:analy[sz]e|explain|review|research|investigate|status|show|list|inspect|compare|audit|question)\b|\u5206\u6790|\u89e3\u91ca|\u8bf4\u660e|\u7814\u7a76|\u8c03\u67e5|\u8bc4\u4f30|\u5ba1\u67e5|\u72b6\u6001|\u67e5\u770b|\u67e5\u8be2|\u4e3a\u4ec0\u4e48|\u600e\u4e48|\u5982\u4f55|\u662f\u5426/iu;
const DESIGN_PATTERN = /\b(?:design|architecture|architect|brainstorm)\b|\u8bbe\u8ba1|\u65b9\u6848|\u67b6\u6784|\u5934\u8111\u98ce\u66b4/iu;
const DEBUG_PATTERN = /\b(?:debug|bug|fix|broken|error|failure|crash)\b|\u4fee\u590d|\u62a5\u9519|\u6545\u969c|\u5d29\u6e83|\u5f02\u5e38/iu;
const VERIFY_PATTERN = /\b(?:verify|validation|test|tests|typecheck|ci|regression)\b|\u9a8c\u8bc1|\u6d4b\u8bd5|\u9a8c\u6536|\u56de\u5f52/iu;
const OPS_PATTERN = /\b(?:install|configure|setup|upgrade|update|deploy|release)\b|\u5b89\u88c5|\u914d\u7f6e|\u8bbe\u7f6e|\u5347\u7ea7|\u90e8\u7f72|\u53d1\u5e03/iu;
const TEAM_PATTERN = /\b(?:agent\s+team|team|parallel|delegate|dispatch|orchestrat(?:e|ion))\b|\u5e76\u53d1|\u5e76\u884c|\u56e2\u961f|\u591a\s*agent|\u59d4\u6d3e|\u7f16\u6392/iu;
const HARNESS_PATTERN = /\b(?:harness|long[-\s]?running|overnight)\b|\u957f\u4efb\u52a1|\u8fc7\u591c|\u65ad\u70b9/iu;
const MULTI_STEP_PATTERN = /\b(?:first.+then|then.+finally|multi[-\s]?step|multiple\s+files|across)\b|\u5148.+\u518d|\u6700\u540e|\u591a\u6b65\u9aa4|\u591a\u6587\u4ef6|\u8de8\u57df/iu;
const PLANNED_SIGNAL = /\b(?:plan|multi[-\s]?step|multiple\s+files|across|migration|migrate|refactor|architecture|security|database|auth|workflow)\b|\u5148.+\u518d|\u6700\u540e|\u591a\u6b65\u9aa4|\u591a\u6587\u4ef6|\u8de8\u57df|\u8fc1\u79fb|\u91cd\u6784|\u67b6\u6784|\u5b89\u5168|\u6570\u636e\u5e93|\u9274\u6743|\u5de5\u4f5c\u6d41/iu;

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

function routeForText(message, intent) {
  if (intent === 'implement') return 'implement';
  if (intent === 'tickets') return 'planning';
  if (intent === 'spec' || intent === 'grill') return 'requirements';
  if (intent === 'review') return 'verify';
  if (intent === 'debug') return 'debug';
  if (intent === 'wayfinder') return 'implement';
  if (intent === 'team') return 'team';
  if (intent === 'harness') return 'harness';
  if (intent === 'design') return 'design';
  if (intent === 'debug') return 'debug';
  if (intent === 'verify') return 'verify';
  if (intent === 'ops') return 'ops';
  if (TEAM_PATTERN.test(message)) return 'team';
  if (HARNESS_PATTERN.test(message)) return 'harness';
  if (DESIGN_PATTERN.test(message)) return 'design';
  if (DEBUG_PATTERN.test(message)) return 'debug';
  if (MULTI_STEP_PATTERN.test(message) && ACTION_PATTERN.test(message)) return 'implement';
  if (VERIFY_PATTERN.test(message)) return 'verify';
  if (OPS_PATTERN.test(message)) return 'ops';
  return 'implement';
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

/** Detect a replacement objective after an acknowledgement or resume prefix. */
export function hasNewActionableObjective(message = '') {
  const value = text(message);
  const acknowledgement = ACKNOWLEDGEMENT_PREFIX.exec(value);
  if (acknowledgement) {
    const tail = value.slice(acknowledgement[0].length).trim();
    return Boolean(tail) && (NEW_OBJECTIVE_MARKER.test(tail) || (ACTION_PATTERN.test(tail) && !isReadOnlyMessage(tail)));
  }

  const resume = RESUME_PREFIX.exec(value);
  if (!resume) return false;
  const tail = value.slice(resume[0].length).trim();
  return Boolean(tail) && NEW_OBJECTIVE_MARKER.test(tail);
}

export function isReadOnlyMessage(message = '') {
  const value = text(message);
  if (!value) return false;
  if (QUESTION_PREFIX.test(value) && !REQUEST_PREFIX.test(value)) return true;
  return READ_ONLY_PATTERN.test(value) && !ACTION_PATTERN.test(value);
}

function isSubstantiveMessage(message, intent, capabilityDecision = null) {
  if (capabilityDecision) return true;
  if (isExplicitPlanIntent(intent) || ['guarded', 'implement', 'debug', 'verify', 'ops'].includes(intent)) {
    return true;
  }
  return ACTION_PATTERN.test(message)
    || DESIGN_PATTERN.test(message)
    || TEAM_PATTERN.test(message)
    || HARNESS_PATTERN.test(message)
    || PLANNED_SIGNAL.test(message);
}

function needsPlan(message, intent, route, policyMode, capabilityPolicy) {
  if (policyMode === 'strict') return true;
  if (intent === 'guarded') return false;
  if (isExplicitPlanIntent(intent)) return true;
  if (route === 'team' || route === 'harness' || route === 'design') return true;
  if (capabilityPolicy.plannedByDefault) return true;
  return PLANNED_SIGNAL.test(message);
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

  if (isReadOnlyMessage(value) && (!intent || isExplicitDirectIntent(intent))) {
    return decision({
      disposition: 'direct',
      routeHint: 'direct',
      reason: 'read-only-request',
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
