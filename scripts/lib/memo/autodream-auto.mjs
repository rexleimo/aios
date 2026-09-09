import { runDream } from '../lifecycle/dream/index.mjs';
import { collectEvents } from './storage/events-read.mjs';

/* E1 Autodream Phase B: opt-in automatic triggers for the (already governed)
 * autodream pipeline. The engine itself (runDream) is deterministic, zero-LLM
 * — which is the cheapest possible consolidation route, so "cheap model
 * routing" is satisfied trivially; if a model-driven consolidator ever lands,
 * it must register a task-type with model-router and stay behind this same
 * opt-in gate. Phase B only ever runs mode=preview: proposals are produced
 * for the existing governance flow (dream apply stays a manual, reviewed
 * action). Default is OFF. */

export const AUTODREAM_AUTO_ENV = 'AIOS_AUTODREAM_AUTO';
export const AUTODREAM_IDLE_MINUTES_ENV = 'AIOS_AUTODREAM_IDLE_MINUTES';
export const AUTODREAM_DEFAULT_IDLE_MINUTES = 30;

export function autodreamAutoEnabled(env = process.env) {
  return String(env[AUTODREAM_AUTO_ENV] || '').trim() === '1';
}

function parseIdleMinutes(env = process.env) {
  const raw = Number.parseFloat(String(env[AUTODREAM_IDLE_MINUTES_ENV] || '').trim());
  if (!Number.isFinite(raw) || raw <= 0) return AUTODREAM_DEFAULT_IDLE_MINUTES;
  return raw;
}

export async function evaluateAutodreamTrigger({
  rootDir,
  now = new Date(),
  trigger = 'idle',
  env = process.env,
} = {}) {
  if (!autodreamAutoEnabled(env)) {
    return { enabled: false, shouldRun: false, reason: `opt-in off (${AUTODREAM_AUTO_ENV} != 1)` };
  }
  if (trigger === 'session-close') {
    return { enabled: true, shouldRun: true, reason: 'session-close trigger' };
  }
  const idleMinutes = parseIdleMinutes(env);
  let latestTs = '';
  try {
    const { events } = await collectEvents(rootDir, { space: '', tolerateMalformed: true, env });
    for (const event of events) {
      const ts = String(event.ts || '');
      if (ts && ts > latestTs) latestTs = ts;
    }
  } catch {
    // unreadable corpus counts as no activity; the idle branch decides below
  }
  if (!latestTs) {
    return { enabled: true, shouldRun: false, reason: `no memo events; nothing to dream about yet (idle threshold ${idleMinutes}m)` };
  }
  const ageMinutes = (now.getTime() - Date.parse(latestTs)) / 60000;
  if (!Number.isFinite(ageMinutes) || ageMinutes < idleMinutes) {
    return { enabled: true, shouldRun: false, reason: `last memo event ${Math.max(0, Math.round(ageMinutes))}m ago < ${idleMinutes}m idle threshold` };
  }
  return { enabled: true, shouldRun: true, reason: `idle ${Math.round(ageMinutes)}m >= ${idleMinutes}m threshold` };
}

export async function runAutodreamPhaseB({
  rootDir,
  trigger = 'idle',
  now = new Date(),
  env = process.env,
} = {}) {
  const gate = await evaluateAutodreamTrigger({ rootDir, now, trigger, env });
  if (!gate.shouldRun) return { ran: false, ...gate };
  // Preview only: the proposal artifacts land for human-governed apply.
  const dream = await runDream({ rootDir, mode: 'preview', spaces: ['default', 'project_shared'], env });
  return { ran: true, mode: 'preview', trigger: gate.reason, dream };
}
