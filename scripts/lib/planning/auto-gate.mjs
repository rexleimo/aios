/**
 * Always-on intelligent planning gate.
 * Every user message is forced into the AIOS planning contract:
 * - ensure an active plan (create/refresh from this message)
 * - return hard instruction text for hooks / SessionStart / MCP
 */

import fs from 'node:fs';
import path from 'node:path';

import {
  readActivePlan,
  startPlan,
  setPlanStatus,
  formatActivePlanInjection,
  resolvePlanningStatePath,
} from './contract.mjs';

export const ALWAYS_ON_PLANNING_POLICY = Object.freeze({
  schemaVersion: 1,
  mode: 'always',
  description: 'Every user input enters AIOS intelligent planning before other work.',
});

function clip(text = '', max = 240) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function titleFromMessage(message = '') {
  const clipped = clip(message, 72);
  return clipped || 'user-request';
}

function sameObjective(plan, message) {
  if (!plan) return false;
  const left = clip(plan.title || '', 120).toLowerCase();
  const right = clip(message, 120).toLowerCase();
  if (!left || !right) return false;
  return left === right || right.includes(left) || left.includes(right);
}

/**
 * Ensure planning state exists for this user message.
 * If no active plan or objective changed materially → start a new plan.
 * If active plan matches → keep and optionally mark executing.
 */
export function ensurePlanForMessage({
  rootDir,
  message = '',
  client = 'unknown',
  source = 'auto-gate',
  forceNew = false,
} = {}) {
  if (!rootDir) throw new Error('ensurePlanForMessage requires rootDir');
  const text = String(message || '').trim();
  const existing = readActivePlan(rootDir);

  if (!forceNew && existing && existing.status !== 'done' && existing.status !== 'blocked') {
    if (!text || sameObjective(existing, text)) {
      // Touch updatedAt so sessions see fresh activity
      const touched = {
        ...existing,
        updatedAt: new Date().toISOString(),
        lastUserMessage: clip(text, 400),
        client: client || existing.client,
        source: source || existing.source,
      };
      fs.mkdirSync(path.dirname(resolvePlanningStatePath(rootDir)), { recursive: true });
      fs.writeFileSync(resolvePlanningStatePath(rootDir), `${JSON.stringify(touched, null, 2)}\n`, 'utf8');
      return { action: 'reuse', state: touched, created: false };
    }
  }

  // New plan for this message (or no active plan)
  if (existing && (existing.status === 'done' || existing.status === 'blocked' || !sameObjective(existing, text))) {
    // leave previous artifact on disk; start a new active pointer
  }

  const state = startPlan({
    rootDir,
    title: titleFromMessage(text || existing?.title || 'session'),
    objective: text || existing?.title || 'Continue AIOS planning session',
    client,
    source,
  });
  state.lastUserMessage = clip(text, 400);
  fs.writeFileSync(resolvePlanningStatePath(rootDir), `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  return { action: 'started', state, created: true };
}

/**
 * Hard instruction block injected on every user turn.
 */
export function buildAlwaysOnPlanningDirective({
  rootDir,
  message = '',
  client = 'unknown',
  gateResult = null,
} = {}) {
  const result = gateResult || ensurePlanForMessage({ rootDir, message, client, source: 'always-on-planning' });
  const plan = result.state;
  const lines = [
    '## AIOS ALWAYS-ON INTELLIGENT PLANNING (MANDATORY)',
    '',
    'Policy: **Every user input automatically enters AIOS intelligent planning.**',
    'This overrides host Plan mode, Hermes built-in loops, and ad-hoc improvisation.',
    '',
    '### Before any other action on THIS message',
    '1. Treat the user message as a planning request first (even if short).',
    '2. Invoke `using-superpowers` then route: `brainstorming` (if unclear) → `writing-plans` (always for multi-step or any code change) → later `verification-before-completion`.',
    '3. Use the active AIOS plan artifact (do not invent a host-only plan):',
    `   - path: \`${plan.relativePath}\``,
    `   - status: \`${plan.status}\``,
    `   - gate: \`${result.action}\``,
    '4. Update the plan file with tasks for this message before implementing.',
    '5. Host Plan UI (Claude Plan / Hermes native) is only a draft aid — mirror into the AIOS plan file.',
    '6. Do not claim completion without verification evidence and `aios plan set-status --status done` when the objective is finished.',
    '',
    '### Forbidden',
    '- Skipping planning because the request "looks small" without writing at least a one-task plan update.',
    '- Implementing only in host Plan mode without updating `docs/plans/`.',
    '- Ignoring `.aios/planning/active.json`.',
    '',
  ];

  if (message) {
    lines.push('### Current user message (planning objective)');
    lines.push('');
    lines.push(clip(message, 1200));
    lines.push('');
  }

  const inject = formatActivePlanInjection(rootDir);
  if (inject) {
    lines.push(inject.trim());
    lines.push('');
  }

  return {
    text: lines.join('\n'),
    plan,
    action: result.action,
    created: result.created,
  };
}

/**
 * Claude Code UserPromptSubmit hook entry.
 * Reads JSON from stdin; writes JSON with additionalContext to stdout.
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
  const directive = buildAlwaysOnPlanningDirective({
    rootDir: cwd,
    message: prompt,
    client,
  });

  // Claude Code hook shape: additionalContext / hookSpecificOutput
  const output = {
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext: directive.text,
    },
    // older / alternate readers
    additionalContext: directive.text,
  };
  return { exitCode: 0, output, directive };
}

/**
 * CLI-friendly auto-gate for any client.
 */
export function runAutoGate({
  rootDir,
  message = '',
  client = 'cli',
  json = false,
} = {}) {
  const directive = buildAlwaysOnPlanningDirective({ rootDir, message, client });
  return {
    ok: true,
    policy: ALWAYS_ON_PLANNING_POLICY,
    action: directive.action,
    created: directive.created,
    plan: directive.plan,
    injection: directive.text,
  };
}
