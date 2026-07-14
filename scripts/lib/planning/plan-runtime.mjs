/**
 * L3 Runtime bridge: solo/team execution → plan task progress + evidence.
 * Closes P9: harness writeback so intelligent planning product can reach overall PASS.
 */

import {
  addPlanEvidence,
  readActivePlan,
  updatePlanTask,
} from './contract.mjs';
import { summarizePlanProgress } from './schema.mjs';
import { isTerminalPlan } from './workflow-policy.mjs';

function normalizeText(value = '') {
  return String(value || '').trim();
}

/**
 * Return the plan already persisted by the workflow-policy adapter. Runtime
 * loops must never create a second plan as a side effect of execution.
 */
export function ensurePlanForRuntime({
  rootDir,
  objective = '',
  client = 'solo-harness',
  source = 'solo-runtime',
} = {}) {
  if (!rootDir) return null;
  const existing = readActivePlan(rootDir);
  if (existing && !isTerminalPlan(existing)) {
    return { action: 'reuse', plan: existing };
  }
  return { action: 'none', plan: null };
}

function findWritableTask(plan) {
  const tasks = Array.isArray(plan?.tasks) ? plan.tasks : [];
  return tasks.find((t) => t.status === 'in_progress')
    || tasks.find((t) => t.status === 'pending')
    || null;
}

/**
 * Call at turn start: mark next pending task in_progress.
 */
export function markPlanTaskInProgress(rootDir, { io = null } = {}) {
  try {
    const plan = readActivePlan(rootDir);
    if (!plan || isTerminalPlan(plan)) return { ok: false, reason: 'no-active-plan' };
    const task = findWritableTask(plan);
    if (!task) return { ok: false, reason: 'no-open-task', plan };
    if (task.status === 'in_progress') return { ok: true, action: 'already', task, plan };
    const next = updatePlanTask(rootDir, task.id, { status: 'in_progress' });
    io?.log?.(`[plan-runtime] task ${task.id} -> in_progress`);
    return { ok: true, action: 'in_progress', task: findWritableTask(next), plan: next };
  } catch (error) {
    io?.log?.(`[plan-runtime] mark in_progress skipped: ${error.message}`);
    return { ok: false, reason: error.message };
  }
}

/**
 * Call after a solo iteration (or similar turn).
 * - success-ish: mark current task done, attach evidence lines
 * - failed/blocked: mark current task blocked
 */
export function syncPlanWithIterationOutcome({
  rootDir,
  objective = '',
  iteration = 0,
  outcome = {},
  client = 'solo-harness',
  io = null,
} = {}) {
  if (!rootDir) return { ok: false, reason: 'root-required' };

  try {
    const active = ensurePlanForRuntime({ rootDir, objective, client, source: 'solo-runtime' });
    let plan = active?.plan || null;
    if (!plan) return { ok: false, reason: 'no-active-policy-plan' };

    const outcomeName = normalizeText(outcome.outcome) || 'unknown';
    const isHardFail = outcomeName === 'failed'
      || outcomeName === 'blocked'
      || outcome.failureClass === 'runtime-error'
      || outcome.failureClass === 'safety-gate'
      || outcome.failureClass === 'no-progress'
      || outcome.failureClass === 'tool-error';

    const isSuccess = !isHardFail && (
      outcome.ok === true
      || ['success', 'completed', 'done', 'progress', 'continue'].includes(outcomeName)
      || (outcome.shouldStop === true && !outcome.failureClass && outcomeName !== 'stopped')
    );

    // Ensure a task is in progress
    markPlanTaskInProgress(rootDir, { io });
    plan = readActivePlan(rootDir);
    const task = findWritableTask(plan);

    // Always attach iteration evidence crumbs when present
    const evidenceLines = [];
    if (Array.isArray(outcome.evidence)) {
      for (const item of outcome.evidence) {
        const text = normalizeText(item);
        if (text) evidenceLines.push(text);
      }
    }
    if (normalizeText(outcome.summary)) {
      evidenceLines.push(`iter=${iteration} outcome=${outcomeName}: ${normalizeText(outcome.summary).slice(0, 240)}`);
    }
    for (const line of evidenceLines.slice(0, 5)) {
      try {
        addPlanEvidence(rootDir, { kind: 'note', value: line });
      } catch {
        // ignore duplicate/empty
      }
    }

    if (task && isSuccess && !isHardFail) {
      plan = updatePlanTask(rootDir, task.id, { status: 'done' });
      io?.log?.(`[plan-runtime] task ${task.id} -> done (iter=${iteration})`);
    } else if (task && isHardFail) {
      plan = updatePlanTask(rootDir, task.id, { status: 'blocked' });
      io?.log?.(`[plan-runtime] task ${task.id} -> blocked (iter=${iteration})`);
    }

    const progress = summarizePlanProgress(readActivePlan(rootDir));
    return {
      ok: true,
      plan: readActivePlan(rootDir),
      progress,
      taskId: task?.id || null,
      outcome: outcomeName,
    };
  } catch (error) {
    io?.log?.(`[plan-runtime] sync skipped: ${error.message}`);
    return { ok: false, reason: error.message };
  }
}

/**
 * Attach quality-gate / verification artifact as plan evidence.
 */
export function attachPlanVerificationEvidence({
  rootDir,
  artifactPath = '',
  report = null,
  io = null,
} = {}) {
  if (!rootDir) return { ok: false, reason: 'root-required' };
  try {
    const plan = readActivePlan(rootDir);
    if (!plan || isTerminalPlan(plan)) return { ok: false, reason: 'no-active-plan' };

    if (normalizeText(artifactPath)) {
      addPlanEvidence(rootDir, { kind: 'path', value: artifactPath });
    }
    const ok = report ? Boolean(report.ok) : null;
    const mode = report?.mode || 'full';
    const summary = report
      ? `quality-gate ${mode} ${ok ? 'passed' : 'failed'}; checks=${Array.isArray(report.results) ? report.results.length : 0}`
      : 'quality-gate recorded';
    addPlanEvidence(rootDir, { kind: 'test', value: summary });

    // On pass, complete current verification-ish open task if any
    if (ok === true) {
      markPlanTaskInProgress(rootDir, { io });
      const current = readActivePlan(rootDir);
      const task = findWritableTask(current);
      if (task) {
        updatePlanTask(rootDir, task.id, { status: 'done' });
        io?.log?.(`[plan-runtime] verification pass → task ${task.id} done`);
      }
    }

    return { ok: true, plan: readActivePlan(rootDir), progress: summarizePlanProgress(readActivePlan(rootDir)) };
  } catch (error) {
    io?.log?.(`[plan-runtime] verification evidence skipped: ${error.message}`);
    return { ok: false, reason: error.message };
  }
}
