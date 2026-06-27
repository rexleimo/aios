// scripts/lib/ctx-bootstrap/tasks.mjs — bootstrap 任务构建函数
// 从 ctx-bootstrap.mjs 拆分：时间戳、任务数据、PRD 文档

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

export { buildTaskId, buildTaskJson, buildBootstrapPrd, formatTaskTimestamp };

export function isBootstrapEnabled(env = process.env) {
  const raw = env.AIOS_BOOTSTRAP_AUTO;
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return true;
  }
  return !DISABLED_VALUES.has(String(raw).trim().toLowerCase());
}
