/**
 * L3 Runtime bridge: solo/team execution → plan task progress + evidence.
 * Closes P9: harness writeback so intelligent planning product can reach overall PASS.
 */

import { execFileSync } from 'node:child_process';
import path from 'node:path';

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

function normalizeStringList(raw = []) {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.map((value) => String(value || '').trim()).filter(Boolean))];
}

function resolveTaskById(plan, taskId) {
  const tasks = Array.isArray(plan?.tasks) ? plan.tasks : [];
  return tasks.find((t) => t.id === taskId) || null;
}

function hasMeaningfulEvidence(outcome = {}) {
  const evidence = Array.isArray(outcome.evidence) ? outcome.evidence : [];
  if (evidence.some((item) => normalizeText(item))) return true;
  const keyChanges = Array.isArray(outcome.keyChanges) ? outcome.keyChanges : [];
  if (keyChanges.some((item) => normalizeText(item))) return true;
  if (normalizeText(outcome.summary)) return true;
  return false;
}

function hasTargetFileChanges(rootDir, targets = []) {
  const files = normalizeStringList(targets);
  if (files.length === 0) return true;
  try {
    const changed = execFileSync('git', ['-C', rootDir, 'diff', '--name-only'], {
      encoding: 'utf8',
      timeout: 5000,
    });
    const names = changed.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
    return files.some((target) => {
      const rel = path.isAbsolute(target) ? path.relative(rootDir, target) : target;
      return names.includes(rel);
    });
  } catch {
    return false;
  }
}

function canMarkTaskDone({ rootDir, task, outcome }) {
  if (!task) return false;
  if (!hasMeaningfulEvidence(outcome)) return false;
  const targets = normalizeStringList(task.targets);
  if (targets.length > 0 && !hasTargetFileChanges(rootDir, targets)) return false;
  return true;
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
  taskId = '',
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

    // The provider must explicitly tell us which task it completed. If it does not,
    // we only record evidence and never advance or guess a pending task. Sync must
    // not mutate in_progress state — that transition is owned by the harness loop.
    const explicitTaskId = normalizeText(taskId || outcome.taskId);

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

    let resolvedTaskId = explicitTaskId || null;
    let task = null;
    if (explicitTaskId) {
      task = resolveTaskById(plan, explicitTaskId);
    }

    // Hard fail: mark the explicitly referenced task, or the current in_progress task, blocked.
    if (isHardFail) {
      const blockedTaskId = explicitTaskId || plan.tasks.find((t) => t.status === 'in_progress')?.id;
      if (blockedTaskId) {
        plan = updatePlanTask(rootDir, blockedTaskId, { status: 'blocked' });
        io?.log?.(`[plan-runtime] task ${blockedTaskId} -> blocked (iter=${iteration})`);
        resolvedTaskId = blockedTaskId;
      }
      const progress = summarizePlanProgress(readActivePlan(rootDir));
      return {
        ok: true,
        plan: readActivePlan(rootDir),
        progress,
        taskId: resolvedTaskId,
        outcome: outcomeName,
      };
    }

    // Success: only mark done when the provider returned a task id and we can verify
    // meaningful evidence for that task. Otherwise keep the task open and just record evidence.
    if (isSuccess && task) {
      if (canMarkTaskDone({ rootDir, task, outcome })) {
        plan = updatePlanTask(rootDir, task.id, { status: 'done' });
        io?.log?.(`[plan-runtime] task ${task.id} -> done (iter=${iteration})`);
      } else {
        io?.log?.(`[plan-runtime] task ${task.id} success received but evidence/target-changes missing; leaving open`);
      }
    } else if (isSuccess && !explicitTaskId) {
      io?.log?.(`[plan-runtime] success without explicit taskId; evidence recorded, no task marked done`);
    }

    const progress = summarizePlanProgress(readActivePlan(rootDir));
    return {
      ok: true,
      plan: readActivePlan(rootDir),
      progress,
      taskId: resolvedTaskId,
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

    // On pass, complete the current in_progress task only. Never fall back to a
    // pending task, so verification gates cannot accidentally skip ahead.
    if (ok === true) {
      const current = readActivePlan(rootDir);
      const task = current?.tasks?.find((t) => t.status === 'in_progress') || null;
      if (task) {
        updatePlanTask(rootDir, task.id, { status: 'done' });
        io?.log?.(`[plan-runtime] verification pass → task ${task.id} done`);
      } else {
        io?.log?.('[plan-runtime] verification pass but no in_progress task; leaving plan unchanged');
      }
    }

    return { ok: true, plan: readActivePlan(rootDir), progress: summarizePlanProgress(readActivePlan(rootDir)) };
  } catch (error) {
    io?.log?.(`[plan-runtime] verification evidence skipped: ${error.message}`);
    return { ok: false, reason: error.message };
  }
}
