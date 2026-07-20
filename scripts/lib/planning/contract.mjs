/**
 * AIOS Planning Contract — shared plan artifacts + discovery checks.
 * Cross-client truth lives in docs/plans + .aios/planning, not host Plan UIs.
 */

import fs from 'node:fs';
import path from 'node:path';

import {
  buildStructuredPlanState,
  evaluateDoneGate,
  normalizeEvidence,
  normalizeTask,
  summarizePlanProgress,
  skillsForRoute,
} from './schema.mjs';

export const PLANNING_STATE_REL = path.join('.aios', 'planning', 'active.json');
export const PLANS_DIR_REL = path.join('docs', 'plans');

export { evaluateDoneGate, summarizePlanProgress, skillsForRoute };

export function resolvePlansDir(rootDir) {
  return path.join(rootDir, PLANS_DIR_REL);
}

export function resolvePlanningStatePath(rootDir) {
  return path.join(rootDir, PLANNING_STATE_REL);
}

function slugify(text = '') {
  const base = String(text)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/giu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return base || 'plan';
}

function todayStamp(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function buildPlanMarkdown({
  title = 'Untitled plan',
  objective = '',
  client = 'unknown',
  sessionId = '',
  source = 'aios-plan',
  createdAt = new Date().toISOString(),
  route = 'unknown',
  skills = [],
  tasks = [],
} = {}) {
  const skillLines = (skills.length ? skills : ['Rex selects the current provider'])
    .map((s, i) => `${i + 1}. \`${s}\``);
  const taskLines = (tasks.length ? tasks : [{ id: 't1', title: 'Task 1', status: 'pending', acceptance: '' }])
    .map((t) => {
      const box = t.status === 'done' || t.status === 'skipped' ? '[x]' : '[ ]';
      const acc = t.acceptance ? ` — _${t.acceptance}_` : '';
      return `- ${box} **${t.id}**: ${t.title}${acc}`;
    });

  return [
    `# ${title}`,
    '',
    `> AIOS Planning Contract (schema v2)`,
    `> created: ${createdAt}`,
    `> client: ${client}`,
    ...(sessionId ? [`> session: ${sessionId}`] : []),
    `> source: ${source}`,
    `> route: ${route}`,
    '',
    '## Objective',
    '',
    objective || '(fill in objective)',
    '',
    '## Route skills',
    '',
    ...skillLines,
    '',
    '## Tasks',
    '',
    ...taskLines,
    '',
    '## Progress',
    '',
    '- status: active',
    '',
    '## Decision Log',
    '',
    '- (none yet)',
    '',
    '## Acceptance',
    '',
    '- Complete planned tasks and record verification evidence.',
    '',
    '## Next Actions',
    '',
    '- Start with the first pending task.',
    '',
    '## Verification evidence',
    '',
    '- Attach via `aios plan add-evidence --kind command|path|test --value "..."`',
    '- Plan cannot be `done` without evidence and completed tasks',
    '',
    '## Status',
    '',
    '- status: active',
    '',
  ].join('\n');
}

function writeTextAtomically(filePath, content) {
  const directory = path.dirname(filePath);
  const tempPath = path.join(
    directory,
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`,
  );
  fs.writeFileSync(tempPath, content, 'utf8');
  try {
    fs.renameSync(tempPath, filePath);
  } finally {
    if (fs.existsSync(tempPath)) fs.rmSync(tempPath, { force: true });
  }
}

function writeActivePlan(rootDir, state) {
  const statePath = resolvePlanningStatePath(rootDir);
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  writeTextAtomically(statePath, `${JSON.stringify(state, null, 2)}\n`);
  return state;
}

function reservePlanArtifact(plansDir, baseFileName) {
  const parsed = path.parse(baseFileName);
  for (let attempt = 1; attempt <= 1000; attempt += 1) {
    const fileName = attempt === 1
      ? baseFileName
      : `${parsed.name}-${attempt}${parsed.ext}`;
    const absolutePath = path.join(plansDir, fileName);
    try {
      const descriptor = fs.openSync(absolutePath, 'wx');
      return {
        descriptor,
        absolutePath,
        relativePath: path.join(PLANS_DIR_REL, fileName).split(path.sep).join('/'),
      };
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
    }
  }
  throw new Error(`unable to reserve a unique plan path for ${baseFileName}`);
}

/**
 * Create a plan artifact under docs/plans and set it active (schema v2 structured).
 */
export function startPlan({
  rootDir,
  title,
  objective = '',
  client = 'unknown',
  sessionId = '',
  source = 'aios-plan',
  now = new Date(),
  route = null,
  skills = null,
  tasks = null,
} = {}) {
  if (!rootDir) throw new Error('startPlan requires rootDir');
  const safeTitle = String(title || objective || 'Untitled plan').trim() || 'Untitled plan';
  const createdAt = now.toISOString();
  const fileName = `${todayStamp(now)}-${slugify(safeTitle)}.md`;
  const plansDir = resolvePlansDir(rootDir);
  fs.mkdirSync(plansDir, { recursive: true });
  const reservation = reservePlanArtifact(plansDir, fileName);
  let descriptorOpen = true;

  try {
    const state = buildStructuredPlanState({
      title: safeTitle,
      objective: objective || safeTitle,
      client,
      sessionId,
      source,
      relativePath: reservation.relativePath,
      absolutePath: reservation.absolutePath,
      createdAt,
      status: 'active',
      route,
      skills,
      tasks,
    });

    const content = buildPlanMarkdown({
      title: state.title,
      objective: state.objective,
      client: state.client,
      sessionId: state.sessionId,
      source: state.source,
      createdAt: state.createdAt,
      route: state.route,
      skills: state.skills,
      tasks: state.tasks,
    });
    fs.writeFileSync(reservation.descriptor, content, 'utf8');
    fs.closeSync(reservation.descriptor);
    descriptorOpen = false;
    return writeActivePlan(rootDir, state);
  } catch (error) {
    if (descriptorOpen) fs.closeSync(reservation.descriptor);
    fs.rmSync(reservation.absolutePath, { force: true });
    throw error;
  }
}

export function readActivePlan(rootDir) {
  const statePath = resolvePlanningStatePath(rootDir);
  if (!fs.existsSync(statePath)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    if (!raw || typeof raw !== 'object') return null;
    // Migrate schema v1 → v2 in memory (and persist on next write)
    if (!raw.schemaVersion || raw.schemaVersion < 2) {
      return buildStructuredPlanState({
        ...raw,
        objective: raw.objective || raw.title,
        tasks: raw.tasks || null,
      });
    }
    return raw;
  } catch {
    return null;
  }
}

export function setPlanStatus(rootDir, status, { note = '', force = false } = {}) {
  const current = readActivePlan(rootDir);
  if (!current) throw new Error('no active plan');
  const allowed = new Set(['active', 'approved', 'executing', 'done', 'blocked']);
  if (!allowed.has(status)) throw new Error(`invalid plan status: ${status}`);

  if (status === 'done' && !force) {
    const gate = evaluateDoneGate(current);
    if (!gate.ok) {
      throw new Error(`cannot mark plan done: ${gate.reasons.join('; ')}`);
    }
  }

  const next = {
    ...current,
    schemaVersion: Math.max(2, Number(current.schemaVersion) || 2),
    status,
    note: note || current.note || '',
    updatedAt: new Date().toISOString(),
  };
  return writeActivePlan(rootDir, next);
}

/**
 * Update a task status on the active plan.
 */
export function updatePlanTask(rootDir, taskId, { status, title, acceptance } = {}) {
  const current = readActivePlan(rootDir);
  if (!current) throw new Error('no active plan');
  const tasks = Array.isArray(current.tasks) ? [...current.tasks] : [];
  const idx = tasks.findIndex((t) => t.id === taskId);
  if (idx < 0) throw new Error(`task not found: ${taskId}`);
  const nextTask = normalizeTask({
    ...tasks[idx],
    ...(status ? { status } : {}),
    ...(title ? { title } : {}),
    ...(acceptance !== undefined ? { acceptance } : {}),
    updatedAt: new Date().toISOString(),
  }, idx);
  tasks[idx] = nextTask;
  const allDone = tasks.every((t) => t.status === 'done' || t.status === 'skipped');
  const next = {
    ...current,
    schemaVersion: 2,
    tasks,
    status: current.status === 'done' ? current.status : (allDone ? 'executing' : current.status === 'active' ? 'executing' : current.status),
    updatedAt: new Date().toISOString(),
  };
  return writeActivePlan(rootDir, next);
}

/**
 * Attach verification evidence to the active plan.
 */
export function addPlanEvidence(rootDir, { kind = 'note', value } = {}) {
  const current = readActivePlan(rootDir);
  if (!current) throw new Error('no active plan');
  const evidenceItem = normalizeEvidence({ kind, value, at: new Date().toISOString() });
  if (!evidenceItem.value) throw new Error('evidence value is required');
  const evidence = [...(Array.isArray(current.evidence) ? current.evidence : []), evidenceItem];
  const next = {
    ...current,
    schemaVersion: 2,
    evidence,
    updatedAt: new Date().toISOString(),
  };
  return writeActivePlan(rootDir, next);
}

/**
 * Format active plan for SessionStart / prompt injection (lean).
 */
export function formatActivePlanInjection(rootDir) {
  const plan = readActivePlan(rootDir);
  if (!plan || plan.status === 'done') return null;
  const progress = summarizePlanProgress(plan);
  const next = progress?.nextTask;
  return [
    '## AIOS active plan (v2)',
    '',
    `- title: ${plan.title}`,
    `- status: ${plan.status} route=${plan.route || 'unknown'}`,
    `- path: ${plan.relativePath}`,
    `- progress: ${progress ? `${progress.tasksDone}/${progress.tasksTotal} tasks, evidence=${progress.evidenceCount}` : 'n/a'}`,
    next ? `- next: ${next.id} ${next.title}` : '- next: (none pending)',
    `- skills: ${(plan.skills || []).slice(0, 4).join(', ')}`,
    '- Update tasks via `aios plan task <id> --status done`; attach evidence before plan done.',
    '',
  ].join('\n');
}
