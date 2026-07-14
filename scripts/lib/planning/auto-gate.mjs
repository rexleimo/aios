/**
 * Workflow-policy adapter for legacy auto-gate callers.
 * Policy evaluation is pure; this module is the single place that persists a
 * plan after a decision explicitly asks for one.
 */

import path from 'node:path';

import {
  readActivePlan,
  startPlan,
  summarizePlanProgress,
} from './contract.mjs';
import {
  evaluateWorkflowPolicy,
  normalizeWorkflowPolicyMode,
} from './workflow-policy.mjs';

export const ALWAYS_ON_PLANNING_POLICY = Object.freeze({
  schemaVersion: 2,
  mode: 'adaptive',
  description: 'Risk-based workflow policy: persist plans only for planned work.',
});

function clip(value = '', max = 240) {
  const normalized = String(value || '').replace(/\s+/gu, ' ').trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, Math.max(0, max - 1)).trimEnd()}...`;
}

function parseWorkflowCommand(message = '') {
  const value = String(message || '').trim();
  const match = /^\/(plan|team|subagent|harness|single)\b[:\s-]*/iu.exec(value);
  if (!match) return { message: value, explicitIntent: null };
  const command = String(match[1] || '').toLowerCase();
  return {
    message: value.slice(match[0].length).trim() || value,
    // /single selects an execution route, never an unsafe direct disposition.
    explicitIntent: command === 'single' ? null : (command === 'subagent' ? 'team' : command),
  };
}

function resolveExplicitIntent(message, explicitIntent) {
  if (explicitIntent) return explicitIntent;
  return parseWorkflowCommand(message).explicitIntent;
}

function titleFromMessage(message = '') {
  const parsed = parseWorkflowCommand(message);
  return clip(parsed.message, 72) || 'user-request';
}

function routeForPlan(routeHint = '') {
  const route = String(routeHint || '').trim().toLowerCase();
  return ['design', 'implement', 'debug', 'verify', 'ops', 'team', 'harness'].includes(route)
    ? route
    : 'implement';
}

function policyDescriptor(policyMode) {
  return {
    ...ALWAYS_ON_PLANNING_POLICY,
    mode: normalizeWorkflowPolicyMode(policyMode),
  };
}

/** Evaluate the policy using the current active state without writing files. */
export function evaluateAutoGateDecision({
  rootDir,
  message = '',
  client = 'unknown',
  sessionId = '',
  policyMode = process.env.AIOS_WORKFLOW_POLICY_MODE || 'adaptive',
  explicitIntent = null,
} = {}) {
  if (!rootDir) throw new Error('evaluateAutoGateDecision requires rootDir');
  return evaluateWorkflowPolicy({
    message,
    activePlan: readActivePlan(rootDir),
    policyMode: normalizeWorkflowPolicyMode(policyMode),
    client,
    sessionId,
    explicitIntent: resolveExplicitIntent(message, explicitIntent),
  });
}

/**
 * Apply a pure workflow decision. Direct, guarded, noop, and dry-run paths
 * never write a plan; reuse returns the original plan object untouched.
 */
export function applyWorkflowDecision({
  rootDir,
  decision,
  message = '',
  client = 'unknown',
  sessionId = '',
  source = 'auto-gate',
  dryRun = false,
} = {}) {
  if (!rootDir) throw new Error('applyWorkflowDecision requires rootDir');
  if (!decision || typeof decision !== 'object') {
    return { action: 'none', created: false, plan: null, state: null };
  }

  if (dryRun || decision.persistence === 'none') {
    return { action: decision.action || 'none', created: false, plan: null, state: null };
  }

  if (decision.persistence === 'reuse') {
    const plan = decision.plan || null;
    return { action: decision.action || 'reuse', created: false, plan, state: plan };
  }

  if (decision.persistence === 'create') {
    const plan = startPlan({
      rootDir,
      title: titleFromMessage(message),
      objective: parseWorkflowCommand(message).message || titleFromMessage(message),
      client,
      sessionId,
      source,
      route: routeForPlan(decision.routeHint),
      skills: decision.requiredSkills,
    });
    return { action: decision.action || 'started', created: true, plan, state: plan };
  }

  return { action: decision.action || 'none', created: false, plan: null, state: null };
}

/**
 * Legacy imperative entry point. It now obeys the workflow policy instead of
 * creating a plan for every message.
 */
export function ensurePlanForMessage({
  rootDir,
  message = '',
  client = 'unknown',
  sessionId = '',
  source = 'auto-gate',
  forceNew = false,
  policyMode = process.env.AIOS_WORKFLOW_POLICY_MODE || 'adaptive',
  explicitIntent = null,
  dryRun = false,
} = {}) {
  const result = runAutoGate({
    rootDir,
    message,
    client,
    sessionId,
    source,
    policyMode,
    explicitIntent: forceNew ? 'plan' : explicitIntent,
    dryRun,
  });
  return {
    action: result.action,
    state: result.plan,
    created: result.created,
    decision: result.decision,
  };
}

function buildDirectiveText({ decision, plan, mode = 'lean' } = {}) {
  if (!plan) return '';

  const injectMode = String(mode || 'lean').toLowerCase() === 'full' ? 'full' : 'lean';
  const progress = summarizePlanProgress(plan);
  const skills = Array.isArray(decision?.requiredSkills) ? decision.requiredSkills : [];
  const lines = [
    '## AIOS WORKFLOW',
    `plan: \`${plan.relativePath}\` status=${plan.status} route=${decision?.routeHint || plan.route || 'implement'} decision=${decision?.action || 'none'}`,
    progress ? `progress: ${progress.tasksDone}/${progress.tasksTotal} tasks evidence=${progress.evidenceCount}` : '',
    progress?.nextTask ? `next: ${progress.nextTask.id}` : '',
    skills.length ? `skills: ${skills.join(' -> ')}` : '',
  ].filter(Boolean);

  if (injectMode === 'full') {
    lines.push(
      `workflow: ${decision?.disposition || 'planned'} persistence=${decision?.persistence || 'none'}`,
      'Record plan evidence before marking the active plan done.',
    );
  }
  return `${lines.join('\n')}\n`;
}

/**
 * Compatibility name for plan-context injection. This is deliberately pure:
 * callers must run auto-gate first if they need a planned artifact persisted.
 */
export function buildAlwaysOnPlanningDirective({
  rootDir,
  message = '',
  client = 'unknown',
  sessionId = '',
  gateResult = null,
  mode = process.env.AIOS_PLAN_INJECT_MODE || 'lean',
  policyMode = process.env.AIOS_WORKFLOW_POLICY_MODE || 'adaptive',
  explicitIntent = null,
} = {}) {
  if (!rootDir) throw new Error('buildAlwaysOnPlanningDirective requires rootDir');
  const decision = gateResult?.decision || evaluateAutoGateDecision({
    rootDir,
    message,
    client,
    sessionId,
    policyMode,
    explicitIntent,
  });
  const plan = gateResult?.plan || (decision.persistence === 'reuse' ? decision.plan : null);
  const text = buildDirectiveText({ decision, plan, mode });
  return {
    text,
    plan,
    decision,
    action: decision.action,
    created: false,
    mode: String(mode || 'lean').toLowerCase() === 'full' ? 'full' : 'lean',
    chars: text.length,
  };
}

/**
 * Claude Code UserPromptSubmit hook entry. Its output has the legacy context
 * fields plus the policy decision for clients that understand structured data.
 */
export async function runClaudeUserPromptSubmitHook({
  rootDir = process.cwd(),
  stdinText = '',
  client = 'claude',
} = {}) {
  let payload = {};
  try {
    payload = stdinText ? JSON.parse(stdinText) : {};
  } catch {
    payload = {};
  }
  const prompt = String(payload.prompt || payload.message || '').trim();
  const cwd = payload.cwd && path.isAbsolute(payload.cwd) ? payload.cwd : rootDir;
  const sessionId = String(payload.sessionId || payload.session_id || payload.session?.id || '').trim();
  const result = runAutoGate({
    rootDir: cwd,
    message: prompt,
    client,
    sessionId,
    policyMode: payload.policyMode || payload.policy_mode || process.env.AIOS_WORKFLOW_POLICY_MODE,
  });

  const output = {
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext: result.injection,
    },
    additionalContext: result.injection,
    decision: result.decision,
    policy: result.policy,
    plan: result.plan,
    created: result.created,
  };
  return { exitCode: 0, output, directive: result };
}

/** CLI- and MCP-friendly policy adapter. */
export function runAutoGate({
  rootDir,
  message = '',
  client = 'cli',
  sessionId = '',
  source = 'auto-gate',
  policyMode = process.env.AIOS_WORKFLOW_POLICY_MODE || 'adaptive',
  explicitIntent = null,
  dryRun = false,
  json = false,
} = {}) {
  const resolvedMode = normalizeWorkflowPolicyMode(policyMode);
  const decision = evaluateAutoGateDecision({
    rootDir,
    message,
    client,
    sessionId,
    policyMode: resolvedMode,
    explicitIntent,
  });
  const applied = applyWorkflowDecision({
    rootDir,
    decision,
    message,
    client,
    sessionId,
    source,
    dryRun: Boolean(dryRun),
  });
  const directive = buildAlwaysOnPlanningDirective({
    rootDir,
    message,
    client,
    sessionId,
    policyMode: resolvedMode,
    explicitIntent,
    gateResult: { decision, plan: applied.plan },
  });

  return {
    ok: true,
    policy: policyDescriptor(resolvedMode),
    action: decision.action,
    created: applied.created,
    plan: applied.plan,
    state: applied.state,
    injection: directive.text,
    decision,
    dryRun: Boolean(dryRun),
    json: Boolean(json),
  };
}
