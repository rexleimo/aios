/**
 * Workflow-policy adapter for legacy auto-gate callers.
 * Policy evaluation is pure; this module is the single place that persists a
 * plan after a decision explicitly asks for one.
 */

import { createHash } from 'node:crypto';
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
import {
  findStoredAiosCapabilityActivation,
  startStoredAiosCapabilityActivation,
} from '../workflows/rex-activation-store.mjs';

export const ALWAYS_ON_PLANNING_POLICY = Object.freeze({
  schemaVersion: 2,
  mode: 'adaptive',
  description: 'Risk-based workflow policy: persist plans only for planned work.',
});

const WORKFLOW_COMMAND_PATTERN = /^\/(plan|team|subagent|harness|single|grill|spec|tickets|review|implement|debug|wayfinder)\b[:\s-]*/iu;

// expectedEvidence 支持 anyOf 收敛组（如验收标准或假设记录二选一）：
// 组内 kind 都是可提交的证据种类，Provider 提交其一即可满足该契约项。
// 展开后用于证据信封与提示文本，避免把 anyOf 对象序列化成 [object Object]。
export function flattenExpectedEvidence(expectedEvidence = []) {
  const items = [];
  for (const item of expectedEvidence) {
    if (item && typeof item === 'object' && Array.isArray(item.anyOf)) {
      for (const kind of item.anyOf) items.push(kind);
    } else if (typeof item === 'string') {
      items.push(item);
    }
  }
  return items;
}
const WORKFLOW_INTENT_ALIASES = Object.freeze({
  subagent: 'team',
  planning: 'tickets',
  ticket: 'tickets',
  implementation: 'implement',
  clarification: 'grill',
  clarify: 'grill',
  specification: 'spec',
  'root-cause': 'debug',
  readonly: 'read-only',
});

function clip(value = '', max = 240) {
  const normalized = String(value || '').replace(/\s+/gu, ' ').trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, Math.max(0, max - 1)).trimEnd()}...`;
}

function parseWorkflowCommand(message = '') {
  const value = String(message || '').trim();
  const match = WORKFLOW_COMMAND_PATTERN.exec(value);
  if (!match) return { message: value, explicitIntent: null };
  const command = String(match[1] || '').toLowerCase();
  const explicitIntent = command === 'single'
    ? null
    : (WORKFLOW_INTENT_ALIASES[command] || command);
  return {
    message: value.slice(match[0].length).trim() || value,
    explicitIntent,
  };
}

function resolveExplicitIntent(message, explicitIntent) {
  if (explicitIntent) {
    const value = typeof explicitIntent === 'string'
      ? explicitIntent.trim().toLowerCase()
      : String(explicitIntent.intent || explicitIntent.kind || explicitIntent.route || '').trim().toLowerCase();
    return WORKFLOW_INTENT_ALIASES[value] || value;
  }
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

function guardedWorkItemKey({ message, explicitIntent, client, sessionId }) {
  const normalizedMessage = String(message || '').replace(/\s+/gu, ' ').trim();
  const normalizedIntent = typeof explicitIntent === 'string'
    ? explicitIntent.trim().toLowerCase()
    : JSON.stringify(explicitIntent || null);
  const objectiveHash = createHash('sha256')
    .update(JSON.stringify({ message: normalizedMessage, explicitIntent: normalizedIntent }))
    .digest('hex')
    .slice(0, 16);
  return `turn:${client || 'unknown'}:${sessionId || 'anonymous'}:${objectiveHash}`;
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
  explicitIntent = null,
  dryRun = false,
} = {}) {
  if (!rootDir) throw new Error('applyWorkflowDecision requires rootDir');
  if (!decision || typeof decision !== 'object') {
    return {
      action: 'none', created: false, plan: null, state: null, capabilityActivation: null, capabilityCommand: null,
    };
  }

  const startCapability = (plan = null) => {
    if (dryRun || !decision.capabilityDecision) return null;
    const workItemKey = plan?.relativePath
      || guardedWorkItemKey({ message, explicitIntent, client, sessionId });
    return startStoredAiosCapabilityActivation({
      rootDir,
      decision: decision.capabilityDecision,
      workItemKey,
      request: {
        message,
        explicitIntent,
      },
    });
  };

  if (dryRun || decision.persistence === 'none') {
    const capability = startCapability();
    return {
      action: decision.action || 'none',
      created: false,
      plan: null,
      state: null,
      capabilityActivation: capability?.activation || null,
      capabilityCommand: capability?.command || null,
    };
  }

  if (decision.persistence === 'reuse') {
    const plan = decision.plan || null;
    const capability = plan?.relativePath
      ? findStoredAiosCapabilityActivation({ rootDir, workItemKey: plan.relativePath })
      : null;
    return {
      action: decision.action || 'reuse',
      created: false,
      plan,
      state: plan,
      capabilityActivation: capability?.activation || null,
      capabilityCommand: capability?.command || null,
    };
  }

  if (decision.persistence === 'create') {
    const plan = startPlan({
      rootDir,
      title: titleFromMessage(message),
      objective: parseWorkflowCommand(message).message || titleFromMessage(message),
      client,
      sessionId,
      source,
      route: routeForPlan(
        ['team', 'harness'].includes(decision.executionHost)
          ? decision.executionHost
          : decision.routeHint,
      ),
      skills: decision.requiredSkills,
    });
    const capability = startCapability(plan);
    return {
      action: decision.action || 'started',
      created: true,
      plan,
      state: plan,
      capabilityActivation: capability?.activation || null,
      capabilityCommand: capability?.command || null,
    };
  }

  return {
    action: decision.action || 'none',
    created: false,
    plan: null,
    state: null,
    capabilityActivation: null,
    capabilityCommand: null,
  };
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

function buildDirectiveText({ decision, plan, command = null, mode = 'lean' } = {}) {
  if (!plan && !command) return '';

  const injectMode = String(mode || 'lean').toLowerCase() === 'full' ? 'full' : 'lean';
  const progress = summarizePlanProgress(plan);
  const skills = Array.isArray(decision?.requiredSkills) ? decision.requiredSkills : [];
  const agentId = command?.provider?.kind === 'agent'
    ? command.provider.id
    : decision?.requiredAgent;
  // Provider 只能回写当前 Command 要求的证据；Runner 会校验 activationId 后再推进状态机。
  const evidenceEnvelope = command && command.provider?.kind !== 'agent'
    ? `AIOS_REX_EVIDENCE=${JSON.stringify({
      schemaVersion: 1,
      activationId: command.activationId,
      evidence: flattenExpectedEvidence(command.expectedEvidence).map((kind) => ({
        kind,
        refs: ['artifact-or-command-ref'],
      })),
    })}`
    : '';
  const lines = [
    '## AIOS WORKFLOW',
    plan
      ? `plan: \`${plan.relativePath}\` status=${plan.status} route=${decision?.routeHint || plan.route || 'implement'} decision=${decision?.action || 'none'}`
      : `plan: none route=${decision?.routeHint || 'implement'} decision=${decision?.action || 'none'}`,
    progress ? `progress: ${progress.tasksDone}/${progress.tasksTotal} tasks evidence=${progress.evidenceCount}` : '',
    progress?.nextTask ? `next: ${progress.nextTask.id}` : '',
    skills.length ? `skills: ${skills.join(' -> ')}` : '',
    agentId ? `agent: ${agentId}${command?.provider?.role ? ` role=${command.provider.role}` : ''}` : '',
    command ? `capability: ${command.capabilityId} recipe=${command.recipeId} stage=${command.stageId}` : '',
    command?.reasonCode ? `trigger: ${command.reasonCode} refs=${command.triggerEvidenceRefs.join(', ')}` : '',
    command ? `provider: ${command.provider.kind}:${command.provider.id}` : '',
    command ? `objective: ${command.objective}` : '',
    command ? `expected-evidence: ${flattenExpectedEvidence(command.expectedEvidence).join(', ')}` : '',
    evidenceEnvelope ? `evidence-output: End the Provider response with exactly one line: ${evidenceEnvelope}` : '',
    evidenceEnvelope ? 'evidence-rule: Report only refs that actually exist; do not invoke the next Provider.' : '',
    command?.provider?.kind === 'agent'
      ? 'handoff-output: Return exactly one JSON handoff object; do not output AIOS_REX_EVIDENCE.'
      : '',
    command?.provider?.kind === 'agent'
      ? 'handoff-rule: agentId and role must match the current Provider; do not invoke the next Provider.'
      : '',
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
  const command = gateResult?.capabilityCommand || null;
  const text = buildDirectiveText({ decision, plan, command, mode });
  return {
    text,
    plan,
    capabilityCommand: command,
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
  // 北极星原则：hook 不猜"解释/说明"是否只读；调用方通过 payload.explicitIntent
  // 显式声明（如 'read-only'）。缺失时统一回退确定性 guarded。
  const explicitIntent = payload.explicitIntent || null;
  const result = runAutoGate({
    rootDir: cwd,
    message: prompt,
    client,
    sessionId,
    policyMode: payload.policyMode || payload.policy_mode || process.env.AIOS_WORKFLOW_POLICY_MODE,
    explicitIntent,
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
    capabilityActivation: result.capabilityActivation,
    capabilityCommand: result.capabilityCommand,
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
    explicitIntent,
    dryRun: Boolean(dryRun),
  });
  const directive = buildAlwaysOnPlanningDirective({
    rootDir,
    message,
    client,
    sessionId,
    policyMode: resolvedMode,
    explicitIntent,
    gateResult: {
      decision,
      plan: applied.plan,
      capabilityCommand: applied.capabilityCommand,
    },
  });

  return {
    ok: true,
    policy: policyDescriptor(resolvedMode),
    action: decision.action,
    created: applied.created,
    plan: applied.plan,
    state: applied.state,
    capabilityActivation: applied.capabilityActivation,
    capabilityCommand: applied.capabilityCommand,
    injection: directive.text,
    decision,
    dryRun: Boolean(dryRun),
    json: Boolean(json),
  };
}
