import { promises as fs } from 'node:fs';
import path from 'node:path';
import { resolveContextDbRoot, resolveTasksRoot, toWorkspaceRelative } from '../aios/state-root.mjs';
import { readHandoffPacket } from '../contextdb/handoff.mjs';

const ACTIVE_TASK_STATUSES = new Set(['pending', 'running', 'blocked']);
const ACTIVE_SESSION_STATUSES = new Set(['pending', 'running', 'blocked']);

async function readTextIfExists(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') return '';
    throw error;
  }
}

async function readJsonIfExists(filePath) {
  const raw = await readTextIfExists(filePath);
  if (!raw.trim()) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function normalizeStatus(value) {
  return String(value || '').trim().toLowerCase();
}

function taskSummaryFromJson(workspaceRoot, taskPath, task) {
  const status = normalizeStatus(task?.status);
  if (!ACTIVE_TASK_STATUSES.has(status)) return null;
  const checklist = Array.isArray(task?.params?.checklist)
    ? task.params.checklist.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  return {
    kind: 'task',
    title: String(task?.title || task?.id || path.basename(path.dirname(taskPath))).trim(),
    status,
    path: toWorkspaceRelative(workspaceRoot, taskPath),
    description: String(task?.description || '').trim(),
    nextActions: checklist.slice(0, 3),
  };
}

async function collectCurrentTask(workspaceRoot, tasksRoot) {
  const currentTaskRef = (await readTextIfExists(path.join(tasksRoot, '.current-task'))).trim();
  if (!currentTaskRef) return [];
  const taskPath = path.resolve(tasksRoot, currentTaskRef);
  const task = await readJsonIfExists(taskPath);
  const summary = taskSummaryFromJson(workspaceRoot, taskPath, task);
  return summary ? [summary] : [];
}

async function collectPendingTasks(workspaceRoot, tasksRoot, seenPaths) {
  const pendingRoot = path.join(tasksRoot, 'pending');
  let entries = [];
  try {
    entries = await fs.readdir(pendingRoot, { withFileTypes: true });
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') return [];
    throw error;
  }

  const summaries = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const taskPath = path.join(pendingRoot, entry.name, 'task.json');
    const key = path.resolve(taskPath);
    if (seenPaths.has(key)) continue;
    const task = await readJsonIfExists(taskPath);
    const summary = taskSummaryFromJson(workspaceRoot, taskPath, task);
    if (summary) summaries.push(summary);
  }
  return summaries;
}

async function collectLatestHandoff(workspaceRoot, facade) {
  const sessionId = String(facade?.sessionId || '').trim();
  const status = normalizeStatus(facade?.status);
  if (!sessionId || !ACTIVE_SESSION_STATUSES.has(status)) return [];

  const handoff = await readHandoffPacket(workspaceRoot, sessionId);
  if (!handoff || (!handoff.nextActions?.length && !handoff.blockers?.length && !handoff.progress)) return [];
  return [{
    kind: 'handoff',
    title: String(facade?.goal || handoff.intent || sessionId).trim(),
    status,
    path: toWorkspaceRelative(workspaceRoot, path.join(resolveContextDbRoot(workspaceRoot, { preferLegacyExisting: true }), 'sessions', sessionId, 'handoff.json')),
    description: String(handoff.progress || '').trim(),
    nextActions: Array.isArray(handoff.nextActions) ? handoff.nextActions.slice(0, 3) : [],
    blockers: Array.isArray(handoff.blockers) ? handoff.blockers.slice(0, 3) : [],
  }];
}

export async function collectStartupSummaries(workspaceRoot, facade = null) {
  const tasksRoot = resolveTasksRoot(workspaceRoot, { preferLegacyExisting: true });
  const currentTasks = await collectCurrentTask(workspaceRoot, tasksRoot);
  const seenPaths = new Set(currentTasks.map((task) => path.resolve(workspaceRoot, task.path)));
  const pendingTasks = await collectPendingTasks(workspaceRoot, tasksRoot, seenPaths);
  const handoffs = await collectLatestHandoff(workspaceRoot, facade);
  return [...currentTasks, ...pendingTasks, ...handoffs];
}

function formatActionList(label, items) {
  if (!items?.length) return [];
  return [
    `  ${label}:`,
    ...items.map((item) => `    - ${item}`),
  ];
}

export function renderStartupSummary(items = []) {
  if (!items.length) return 'AIOS: no unfinished tasks. Starting fresh.';

  const lines = ['AIOS: unfinished tasks detected. No prompt was injected.'];
  items.forEach((item, index) => {
    lines.push(`${index + 1}. [${item.status}] ${item.title}`);
    lines.push(`   path: ${item.path}`);
    if (item.description) lines.push(`   summary: ${item.description.replace(/\s+/g, ' ').slice(0, 240)}`);
    lines.push(...formatActionList('next', item.nextActions));
    lines.push(...formatActionList('blockers', item.blockers));
  });
  lines.push('To continue, tell the agent which item to resume; load the listed file only if needed.');
  return lines.join('\n');
}

export async function printStartupSummary(workspaceRoot, facade = null, stream = process.stderr) {
  const summaries = await collectStartupSummaries(workspaceRoot, facade);
  stream.write(`${renderStartupSummary(summaries)}\n`);
  return summaries;
}
