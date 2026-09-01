/**
 * Structured intelligent planning schema (quality layer).
 * Prior planning patterns, OpenHarness objective loops, and verification gates
 * are mapped to machine-readable tasks and evidence, not host Plan UI.
 */

export const PLAN_SCHEMA_VERSION = 3;

export const PLAN_STATUSES = Object.freeze([
  'active',
  'approved',
  'executing',
  'done',
  'blocked',
]);

export const TASK_STATUSES = Object.freeze([
  'pending',
  'in_progress',
  'done',
  'blocked',
  'skipped',
]);

export const PLAN_ROUTES = Object.freeze([
  'design',
  'implement',
  'debug',
  'verify',
  'ops',
  'team',
  'harness',
  'unknown',
]);

/**
 * Resolve a planning route without guessing the caller's intent.
 *
 * 北极星原则：程序只提供确定性簿记，绝不用正则/关键词替模型判断"任务意图"。
 * 具体是 debug/design/verify/ops/implement 应由显式声明或模型决定；调用方没给
 * 合法 route 时返回 'unknown'，种子任务回退到通用模板，由后续 agent 细化，
 * 而不是靠扫描 objective 里的 "bug"/"design"/"test" 等词假装知道意图。
 */
export function classifyPlanRoute(message = '') {
  void message;
  return 'unknown';
}

/** Rex owns provider selection; host plans do not inject a fixed skill chain. */
export function skillsForRoute(route = 'unknown') {
  void route;
  return [];
}

/**
 * Seed tasks from objective + route (deterministic scaffold — agent refines later).
 */
export function seedTasksFromObjective(objective = '', route = 'unknown') {
  // Prefer first line + short cap so bulk/sentinel dumps do not pollute task titles
  // (those titles surface in always-on inject headers and break turn-compression).
  const firstLine = String(objective || 'user request').split(/\r?\n/u)[0] || 'user request';
  const title = firstLine.replace(/\s+/g, ' ').trim().slice(0, 72) || 'user request';
  const base = [
    {
      id: 't1-understand',
      title: `Clarify objective: ${title}`,
      status: 'pending',
      acceptance: 'Objective restated; constraints listed',
      dependsOn: [],
    },
  ];

  if (route === 'design') {
    return [
      ...base,
      {
        id: 't2-options',
        title: 'Explore approaches and pick one',
        status: 'pending',
        acceptance: 'Chosen approach + rejected alternatives written in plan',
        dependsOn: ['t1-understand'],
      },
      {
        id: 't3-plan',
        title: 'Write executable task plan',
        status: 'pending',
        acceptance: 'Tasks have acceptance criteria',
        dependsOn: ['t2-options'],
      },
      {
        id: 't4-verify-gate',
        title: 'Define verification evidence',
        status: 'pending',
        acceptance: 'Tests/commands listed before implementation',
        dependsOn: ['t3-plan'],
      },
    ];
  }

  if (route === 'debug') {
    return [
      ...base,
      {
        id: 't2-repro',
        title: 'Reproduce and isolate failure',
        status: 'pending',
        acceptance: 'Failing command/log captured as evidence',
        dependsOn: ['t1-understand'],
      },
      {
        id: 't3-fix',
        title: 'Implement fix',
        status: 'pending',
        acceptance: 'Root cause addressed in code',
        dependsOn: ['t2-repro'],
      },
      {
        id: 't4-verify',
        title: 'Verify fix',
        status: 'pending',
        acceptance: 'Previously failing check now passes (evidence attached)',
        dependsOn: ['t3-fix'],
      },
    ];
  }

  if (route === 'verify') {
    return [
      ...base,
      {
        id: 't2-run-checks',
        title: 'Run verification suite',
        status: 'pending',
        acceptance: 'Commands executed with recorded output paths/summaries',
        dependsOn: ['t1-understand'],
      },
      {
        id: 't3-report',
        title: 'Report gaps and next actions',
        status: 'pending',
        acceptance: 'Failures listed with owners/next steps',
        dependsOn: ['t2-run-checks'],
      },
    ];
  }

  // implement / ops / unknown
  return [
    ...base,
    {
      id: 't2-plan',
      title: 'Break work into executable tasks',
      status: 'pending',
      acceptance: 'Plan tasks updated beyond scaffold if needed',
      dependsOn: ['t1-understand'],
    },
    {
      id: 't3-implement',
      title: 'Implement changes',
      status: 'pending',
      acceptance: 'Code changes match objective',
      dependsOn: ['t2-plan'],
    },
    {
      id: 't4-verify',
      title: 'Verify with tests/checks',
      status: 'pending',
      acceptance: 'Evidence recorded (command or artifact path)',
      dependsOn: ['t3-implement'],
    },
  ];
}

function normalizeStringList(raw = []) {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.map((value) => String(value || '').trim()).filter(Boolean))];
}

export function normalizeContextRequirement(raw, index = 0) {
  if (typeof raw === 'string') {
    const ref = raw.trim();
    return ref ? {
      ref,
      reason: 'Declared required context',
      required: true,
      verification: [],
    } : null;
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const ref = String(raw.ref || raw.path || '').trim();
  if (!ref) return null;
  return {
    ref,
    reason: String(raw.reason || `Declared context requirement ${index + 1}`).trim(),
    required: raw.required !== false,
    verification: normalizeStringList(raw.verification),
    ...(raw.expectedHash ? { expectedHash: String(raw.expectedHash).trim() } : {}),
  };
}

export function normalizeTask(raw = {}, index = 0) {
  const id = String(raw.id || `t${index + 1}`).trim();
  const status = TASK_STATUSES.includes(raw.status) ? raw.status : 'pending';
  return {
    id,
    title: String(raw.title || id).trim(),
    status,
    acceptance: String(raw.acceptance || '').trim(),
    dependsOn: Array.isArray(raw.dependsOn) ? raw.dependsOn.map(String) : [],
    targets: normalizeStringList(raw.targets),
    allowedWrites: normalizeStringList(raw.allowedWrites),
    contextRequirements: (Array.isArray(raw.contextRequirements) ? raw.contextRequirements : [])
      .map((requirement, requirementIndex) => normalizeContextRequirement(requirement, requirementIndex))
      .filter(Boolean),
    interfaces: normalizeStringList(raw.interfaces),
    verification: normalizeStringList(raw.verification),
    contextRevision: String(raw.contextRevision || '').trim(),
    contextCandidateConfirmationId: String(raw.contextCandidateConfirmationId || '').trim(),
    updatedAt: raw.updatedAt || null,
  };
}

export function normalizeEvidence(raw = {}) {
  const kind = ['command', 'path', 'note', 'test'].includes(raw.kind) ? raw.kind : 'note';
  return {
    kind,
    value: String(raw.value || '').trim(),
    at: raw.at || new Date().toISOString(),
  };
}

/**
 * Build structured plan state (schema v3).
 */
export function buildStructuredPlanState({
  title,
  objective,
  client = 'unknown',
  sessionId = '',
  source = 'aios-plan',
  relativePath = '',
  absolutePath = '',
  createdAt = new Date().toISOString(),
  status = 'active',
  route = null,
  contextRevision = '',
  skills = null,
  tasks = null,
  evidence = [],
} = {}) {
  const resolvedRoute = PLAN_ROUTES.includes(route) ? route : classifyPlanRoute(objective || title);
  const taskSource = Array.isArray(tasks) && tasks.length > 0
    ? tasks
    : seedTasksFromObjective(objective || title, resolvedRoute);
  const resolvedTasks = taskSource.map((task, index) => normalizeTask(task, index));

  return {
    schemaVersion: PLAN_SCHEMA_VERSION,
    title: String(title || 'Untitled plan').trim(),
    objective: String(objective || title || '').trim(),
    status: PLAN_STATUSES.includes(status) ? status : 'active',
    relativePath,
    absolutePath,
    client,
    sessionId: String(sessionId || '').trim(),
    source,
    createdAt,
    updatedAt: createdAt,
    route: resolvedRoute,
    contextRevision: String(contextRevision || '').trim(),
    skills: Array.isArray(skills) && skills.length > 0
      ? [...new Set(skills.map((skill) => String(skill || '').trim()).filter(Boolean))]
      : skillsForRoute(resolvedRoute),
    tasks: resolvedTasks,
    evidence: (Array.isArray(evidence) ? evidence : []).map(normalizeEvidence).filter((e) => e.value),
  };
}

/**
 * Rules for marking plan done.
 */
export function evaluateDoneGate(state) {
  const reasons = [];
  if (!state || typeof state !== 'object') {
    return { ok: false, reasons: ['no plan state'] };
  }
  const tasks = Array.isArray(state.tasks) ? state.tasks : [];
  const open = tasks.filter((t) => t.status !== 'done' && t.status !== 'skipped');
  if (open.length > 0) {
    reasons.push(`${open.length} task(s) not done: ${open.map((t) => t.id).join(', ')}`);
  }
  const evidence = Array.isArray(state.evidence) ? state.evidence : [];
  if (evidence.length === 0) {
    reasons.push('no verification evidence attached (use plan add-evidence)');
  }
  return { ok: reasons.length === 0, reasons };
}

/**
 * Progress summary for injection / status.
 */
export function summarizePlanProgress(state) {
  if (!state) return null;
  const tasks = Array.isArray(state.tasks) ? state.tasks : [];
  const done = tasks.filter((t) => t.status === 'done' || t.status === 'skipped').length;
  const total = tasks.length;
  const evidenceCount = Array.isArray(state.evidence) ? state.evidence.length : 0;
  return {
    route: state.route || 'unknown',
    status: state.status,
    tasksDone: done,
    tasksTotal: total,
    evidenceCount,
    nextTask: tasks.find((t) => t.status === 'pending' || t.status === 'in_progress') || null,
  };
}
