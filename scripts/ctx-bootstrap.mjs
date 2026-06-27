// scripts/ctx-bootstrap.mjs — 薄壳入口，逻辑在 scripts/lib/ctx-bootstrap/
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { resolveTasksRoot } from './lib/aios/state-root.mjs';
import { buildTaskId, buildTaskJson, buildBootstrapPrd, isBootstrapEnabled } from './lib/ctx-bootstrap/tasks.mjs';
import { readTextIfExists, hasPendingEntries } from './lib/ctx-bootstrap/io.mjs';

export { isBootstrapEnabled };

export async function ensureBootstrapTask(workspaceRoot, options = {}) {
  const root = path.resolve(workspaceRoot);
  const project = options.project || path.basename(root);
  const agent = options.agent || 'unknown-agent';
  const now = options.now instanceof Date ? options.now : new Date();

  const tasksDir = resolveTasksRoot(root);
  const legacyTasksDir = path.join(root, 'tasks');
  const pendingDir = path.join(tasksDir, 'pending');
  const currentTaskPath = path.join(tasksDir, '.current-task');

  const currentTask = (await readTextIfExists(currentTaskPath)).trim();
  if (currentTask) {
    return { created: false, reason: 'current-task-exists' };
  }
  const legacyCurrentTask = (await readTextIfExists(path.join(legacyTasksDir, '.current-task'))).trim();
  if (legacyCurrentTask) {
    return { created: false, reason: 'legacy-current-task-exists' };
  }

  if (await hasPendingEntries(pendingDir)) {
    return { created: false, reason: 'pending-has-tasks' };
  }
  if (await hasPendingEntries(path.join(legacyTasksDir, 'pending'))) {
    return { created: false, reason: 'legacy-pending-has-tasks' };
  }

  const taskId = buildTaskId(now);
  const taskDir = path.join(pendingDir, taskId);
  const taskJsonPath = path.join(taskDir, 'task.json');
  const prdPath = path.join(taskDir, 'prd.md');
  const currentTaskRel = path.posix.join('pending', taskId, 'task.json');

  await fs.mkdir(pendingDir, { recursive: true });
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
