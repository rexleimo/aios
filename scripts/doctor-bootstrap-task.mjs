#!/usr/bin/env node
// scripts/doctor-bootstrap-task.mjs — 薄壳入口，逻辑在 scripts/lib/bootstrap-doctor/
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { resolveTasksRoot, toWorkspaceRelative } from './lib/aios/state-root.mjs';
import { normalizeTaskRef, readTextIfExists, listNonHiddenEntries } from './lib/bootstrap-doctor/task-utils.mjs';

function usage() {
  console.log(`Usage:
  node scripts/doctor-bootstrap-task.mjs [--workspace <path>]

Options:
  --workspace <path>  Workspace root to inspect (default: current working directory)
  -h, --help          Show this help`);
}

function parseArgs(argv) {
  const opts = { workspaceRoot: process.cwd() };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--workspace': opts.workspaceRoot = argv[++i] || process.cwd(); break;
      case '-h': case '--help': usage(); process.exit(0); break;
      default: throw new Error(`Unknown option: ${arg}`);
    }
  }
  return opts;
}

export async function inspectBootstrapTask(workspaceRoot) {
  const root = path.resolve(workspaceRoot || process.cwd());
  const tasksDir = resolveTasksRoot(root, { preferLegacyExisting: true });
  const tasksRel = toWorkspaceRelative(root, tasksDir);
  const pendingDir = path.join(tasksDir, 'pending');
  const currentTaskPath = path.join(tasksDir, '.current-task');

  if (!existsSync(tasksDir)) {
    return { status: 'warn', code: 'tasks-missing', message: `${tasksRel} directory is missing; bootstrap has not been initialized in this workspace`, workspaceRoot: root };
  }

  const currentTask = (await readTextIfExists(currentTaskPath)).trim();
  if (currentTask) {
    const currentTaskFile = path.join(tasksDir, ...normalizeTaskRef(currentTask));
    if (existsSync(currentTaskFile)) {
      return { status: 'ok', code: 'current-task-present', message: `current task pointer is valid: ${tasksRel}/${currentTask}`, workspaceRoot: root };
    }
    return { status: 'warn', code: 'current-task-broken', message: `${tasksRel}/.current-task points to missing file: ${tasksRel}/${currentTask}`, workspaceRoot: root };
  }

  const pendingEntries = await listNonHiddenEntries(pendingDir);
  if (pendingEntries.length === 0) {
    return { status: 'warn', code: 'pending-empty', message: `no current task and ${tasksRel}/pending is empty; run agent once to auto-bootstrap`, workspaceRoot: root };
  }

  const bootstrapEntries = pendingEntries.filter((entry) => entry.includes('bootstrap_guidelines'));
  if (bootstrapEntries.length > 0) {
    return { status: 'warn', code: 'pending-bootstrap', message: `${tasksRel}/pending has ${bootstrapEntries.length} bootstrap entries; consider running agent to process them`, pendingEntries: bootstrapEntries, workspaceRoot: root };
  }

  return { status: 'warn', code: 'pending-stale', message: `${tasksRel}/pending has ${pendingEntries.length} non-bootstrap tasks but no current task`, pendingEntries, workspaceRoot: root };
}

export async function runDoctor(argv = process.argv.slice(2), io = console) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (error) {
    io.error(error instanceof Error ? error.message : String(error));
    usage();
    return { status: 'warn', code: 'invalid-args' };
  }

  const result = await inspectBootstrapTask(opts.workspaceRoot);
  io.log('Bootstrap Task Doctor');
  io.log('---------------------');
  io.log(`Workspace: ${result.workspaceRoot}`);
  if (result.status === 'ok') {
    io.log(`[ok] ${result.message}`);
  } else {
    io.log(`[warn] ${result.message}`);
  }
  return result;
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  runDoctor().catch((error) => {
    const reason = error instanceof Error ? error.message : String(error);
    console.log(`[warn] bootstrap task doctor failed: ${reason}`);
  });
}
