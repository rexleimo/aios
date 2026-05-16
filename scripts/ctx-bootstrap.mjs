import { promises as fs } from 'node:fs';
import path from 'node:path';
import { resolveTasksRoot } from './lib/aios/state-root.mjs';

const DISABLED_VALUES = new Set(['0', 'false', 'off', 'no']);

function formatTaskTimestamp(now) {
  return now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, '');
}

function buildTaskId(now) {
  return `task_${formatTaskTimestamp(now)}_bootstrap_guidelines`;
}

function buildTaskJson(taskId, project, agent, now) {
  return {
    id: taskId,
    title: 'Bootstrap project guidance',
    description: 'Create baseline AIOS project guidance before feature work',
    type: 'analysis',
    status: 'pending',
    params: {
      bootstrap: true,
      project,
      agent,
      checklist: [
        'Read AGENTS.md and repository guidelines',
        'Document project-specific conventions in docs/plans',
        'Run first scoped task with ContextDB checkpoint evidence',
      ],
    },
    result: {},
    created_at: now.toISOString(),
    started_at: '',
    completed_at: '',
    error: null,
  };
}

function buildBootstrapPrd(project, agent, taskId, now) {
  const date = now.toISOString().slice(0, 10);
  return `# Bootstrap: Establish Project Guidance

## Context

- Project: \`${project}\`
- Agent: \`${agent}\`
- Task ID: \`${taskId}\`
- Created: \`${date}\`

## Goal

Create the minimum project guidance baseline so future AI runs do not start from an empty context.

## Required Steps

1. Confirm repository constraints from \`AGENTS.md\`.
2. Create or update a plan artifact under \`docs/plans/\`.
3. Define acceptance criteria for the next concrete engineering task.
4. Execute the next task with ContextDB checkpoint evidence.

## Definition of Done

- [ ] Guidance notes are written and discoverable.
- [ ] Next task objective is explicit and scoped.
- [ ] At least one checkpoint includes summary + next actions.
`;
}

async function readTextIfExists(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return '';
    }
    throw error;
  }
}

async function hasPendingEntries(dirPath) {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries.some((entry) => !entry.name.startsWith('.'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

export function isBootstrapEnabled(env = process.env) {
  const raw = env.AIOS_BOOTSTRAP_AUTO;
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return true;
  }
  return !DISABLED_VALUES.has(String(raw).trim().toLowerCase());
}

export async function ensureBootstrapTask(workspaceRoot, options = {}) {
  const root = path.resolve(workspaceRoot);
  const project = options.project || path.basename(root);
  const agent = options.agent || 'unknown-agent';
  const now = options.now instanceof Date ? options.now : new Date();

  const tasksDir = resolveTasksRoot(root, { preferLegacyExisting: true });
  const pendingDir = path.join(tasksDir, 'pending');
  const currentTaskPath = path.join(tasksDir, '.current-task');

  await fs.mkdir(pendingDir, { recursive: true });

  const currentTask = (await readTextIfExists(currentTaskPath)).trim();
  if (currentTask) {
    return { created: false, reason: 'current-task-exists' };
  }

  if (await hasPendingEntries(pendingDir)) {
    return { created: false, reason: 'pending-has-tasks' };
  }

  const taskId = buildTaskId(now);
  const taskDir = path.join(pendingDir, taskId);
  const taskJsonPath = path.join(taskDir, 'task.json');
  const prdPath = path.join(taskDir, 'prd.md');
  const currentTaskRel = path.posix.join('pending', taskId, 'task.json');

  await fs.mkdir(taskDir, { recursive: true });
  await Promise.all([
    fs.writeFile(taskJsonPath, `${JSON.stringify(buildTaskJson(taskId, project, agent, now), null, 2)}\n`, 'utf8'),
    fs.writeFile(prdPath, buildBootstrapPrd(project, agent, taskId, now), 'utf8'),
    fs.writeFile(currentTaskPath, `${currentTaskRel}\n`, 'utf8'),
  ]);

  return {
    created: true,
    taskId,
    taskPath: currentTaskRel,
  };
}
