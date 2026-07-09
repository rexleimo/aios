/**
 * AIOS Planning Contract — shared plan artifacts + discovery checks.
 * Cross-client truth lives in docs/plans + .aios/planning, not host Plan UIs.
 */

import fs from 'node:fs';
import path from 'node:path';

import { CLIENT_DEFINITIONS } from '../clients/core/definitions.mjs';
import { getClientHomes } from '../platform/paths.mjs';

/** Core superpowers skills that must be discoverable for intelligent planning. */
export const PLANNING_CORE_SKILLS = Object.freeze([
  'using-superpowers',
  'brainstorming',
  'writing-plans',
  'executing-plans',
  'verification-before-completion',
  'systematic-debugging',
  'test-driven-development',
  'subagent-driven-development',
]);

export const PLANNING_STATE_REL = path.join('.aios', 'planning', 'active.json');
export const PLANS_DIR_REL = path.join('docs', 'plans');

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
  source = 'aios-plan',
  createdAt = new Date().toISOString(),
} = {}) {
  return [
    `# ${title}`,
    '',
    `> AIOS Planning Contract`,
    `> created: ${createdAt}`,
    `> client: ${client}`,
    `> source: ${source}`,
    '',
    '## Objective',
    '',
    objective || '(fill in objective)',
    '',
    '## Required AIOS skills (do not skip)',
    '',
    '1. `using-superpowers` — route process',
    '2. `brainstorming` — if design/scope unclear',
    '3. `writing-plans` — produce this artifact checklist',
    '4. `verification-before-completion` — before claiming done',
    '',
    '## Host plan mode bridge',
    '',
    '- Claude Plan mode / Hermes native planning must still land **this file** (or update it).',
    '- Do not treat host-only plan UI as complete until this artifact exists.',
    '',
    '## Tasks',
    '',
    '- [ ] Task 1',
    '- [ ] Task 2',
    '',
    '## Verification',
    '',
    '- [ ] Tests / typecheck / doctor evidence recorded',
    '- [ ] ContextDB or memo handoff updated if multi-session',
    '',
    '## Status',
    '',
    '- status: active',
    '',
  ].join('\n');
}

/**
 * Create a plan artifact under docs/plans and set it active.
 */
export function startPlan({
  rootDir,
  title,
  objective = '',
  client = 'unknown',
  source = 'aios-plan',
  now = new Date(),
} = {}) {
  if (!rootDir) throw new Error('startPlan requires rootDir');
  const safeTitle = String(title || objective || 'Untitled plan').trim() || 'Untitled plan';
  const createdAt = now.toISOString();
  const fileName = `${todayStamp(now)}-${slugify(safeTitle)}.md`;
  const plansDir = resolvePlansDir(rootDir);
  const relativePath = path.join(PLANS_DIR_REL, fileName);
  const absolutePath = path.join(rootDir, relativePath);

  fs.mkdirSync(plansDir, { recursive: true });
  const content = buildPlanMarkdown({
    title: safeTitle,
    objective,
    client,
    source,
    createdAt,
  });
  fs.writeFileSync(absolutePath, content, 'utf8');

  const state = {
    schemaVersion: 1,
    status: 'active',
    title: safeTitle,
    relativePath: relativePath.split(path.sep).join('/'),
    absolutePath,
    client,
    source,
    createdAt,
    updatedAt: createdAt,
  };
  const statePath = resolvePlanningStatePath(rootDir);
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  return state;
}

export function readActivePlan(rootDir) {
  const statePath = resolvePlanningStatePath(rootDir);
  if (!fs.existsSync(statePath)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    if (!raw || typeof raw !== 'object') return null;
    return raw;
  } catch {
    return null;
  }
}

export function setPlanStatus(rootDir, status, { note = '' } = {}) {
  const current = readActivePlan(rootDir);
  if (!current) throw new Error('no active plan');
  const allowed = new Set(['active', 'approved', 'executing', 'done', 'blocked']);
  if (!allowed.has(status)) throw new Error(`invalid plan status: ${status}`);
  const next = {
    ...current,
    status,
    note: note || current.note || '',
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(resolvePlanningStatePath(rootDir), `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  return next;
}

/**
 * Check whether planning core skills are discoverable for a client skill root.
 */
export function inspectSkillRoot(skillRoot, skillNames = PLANNING_CORE_SKILLS) {
  const missing = [];
  const present = [];
  if (!skillRoot || !fs.existsSync(skillRoot)) {
    return {
      skillRoot: skillRoot || '',
      exists: false,
      present: [],
      missing: [...skillNames],
      ok: false,
    };
  }
  for (const name of skillNames) {
    const skillMd = path.join(skillRoot, name, 'SKILL.md');
    if (fs.existsSync(skillMd)) present.push(name);
    else missing.push(name);
  }
  return {
    skillRoot,
    exists: true,
    present,
    missing,
    ok: missing.length === 0,
  };
}

/**
 * Per-client discovery report for planning skills (project root + home).
 */
export function checkPlanningSkillDiscovery({
  rootDir,
  clients = Object.keys(CLIENT_DEFINITIONS),
  env = process.env,
  homes = null,
} = {}) {
  const homeMap = homes || getClientHomes(env);
  const reports = [];

  for (const clientId of clients) {
    const def = CLIENT_DEFINITIONS[clientId];
    if (!def) continue;
    const projectRoot = rootDir ? path.join(rootDir, def.projectSkillRoot) : '';
    const homeSkills = path.join(homeMap[clientId] || '', 'skills');
    // Claude superpowers often land flat under ~/.claude/skills (linked skill names).
    // Hermes uses project .hermes/skills and optionally home skills.
    const projectReport = projectRoot ? inspectSkillRoot(projectRoot) : null;
    const homeReport = inspectSkillRoot(homeSkills);
    const ok = Boolean((projectReport && projectReport.ok) || homeReport.ok);
    reports.push({
      clientId,
      project: projectReport,
      home: homeReport,
      ok,
      recommendation: ok
        ? null
        : `Run: node scripts/aios.mjs plan project-skills --client ${clientId} --force`,
    });
  }

  return {
    schemaVersion: 1,
    kind: 'aios.planning.discovery.v1',
    ok: reports.every((r) => r.ok),
    reports,
  };
}

/**
 * Format active plan for SessionStart / prompt injection (lean).
 */
export function formatActivePlanInjection(rootDir) {
  const plan = readActivePlan(rootDir);
  if (!plan || plan.status === 'done') return null;
  return [
    '## AIOS active plan',
    '',
    `- title: ${plan.title}`,
    `- status: ${plan.status}`,
    `- path: ${plan.relativePath}`,
    '- Follow AIOS writing-plans / verification-before-completion for this work.',
    '- Host Plan mode must update this artifact; do not invent a parallel plan only in the host UI.',
    '',
  ].join('\n');
}
