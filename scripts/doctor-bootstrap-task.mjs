import { promises as fs } from 'node:fs';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveTasksRoot, toWorkspaceRelative } from './lib/aios/state-root.mjs';

function usage() {
  console.log(`Usage:
  node scripts/doctor-bootstrap-task.mjs [--workspace <path>]

Options:
  --workspace <path>  Workspace root to inspect (default: current working directory)
  -h, --help          Show this help`);
}

function parseArgs(argv) {
  const opts = {
    workspaceRoot: process.cwd(),
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--workspace':
        opts.workspaceRoot = argv[++i] || process.cwd();
        break;
      case '-h':
      case '--help':
        usage();
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return opts;
}

function normalizeTaskRef(currentTask) {
  return currentTask.replaceAll('\\', '/').split('/').filter(Boolean);
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

async function listNonHiddenEntries(dirPath) {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries.filter((entry) => !entry.name.startsWith('.')).map((entry) => entry.name);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

export async function inspectBootstrapTask(workspaceRoot) {
  const root = path.resolve(workspaceRoot || process.cwd());
  const tasksDir = resolveTasksRoot(root, { preferLegacyExisting: true });
  const tasksRel = toWorkspaceRelative(root, tasksDir);
  const pendingDir = path.join(tasksDir, 'pending');
  const currentTaskPath = path.join(tasksDir, '.current-task');

  if (!existsSync(tasksDir)) {
    return {
      status: 'warn',
      code: 'tasks-missing',
      message: `${tasksRel} directory is missing; bootstrap has not been initialized in this workspace`,
      workspaceRoot: root,
    };
  }

  const currentTask = (await readTextIfExists(currentTaskPath)).trim();
  if (currentTask) {
    const currentTaskFile = path.join(tasksDir, ...normalizeTaskRef(currentTask));
    if (existsSync(currentTaskFile)) {
      return {
        status: 'ok',
        code: 'current-task-present',
        message: `current task pointer is valid: ${tasksRel}/${currentTask}`,
        workspaceRoot: root,
      };
    }

    return {
      status: 'warn',
      code: 'current-task-broken',
      message: `${tasksRel}/.current-task points to missing file: ${tasksRel}/${currentTask}`,
      workspaceRoot: root,
    };
  }

  const pendingEntries = await listNonHiddenEntries(pendingDir);
  if (pendingEntries.length === 0) {
    return {
      status: 'warn',
      code: 'pending-empty',
      message: `no current task and ${tasksRel}/pending is empty; run agent once to auto-bootstrap`,
      workspaceRoot: root,
    };
  }

  const bootstrapEntries = pendingEntries.filter((entry) => entry.includes('bootstrap_guidelines'));
  if (bootstrapEntries.length > 0) {
    return {
      status: 'warn',
      code: 'bootstrap-without-current-task',
      message: `bootstrap task exists but ${tasksRel}/.current-task is empty: ${bootstrapEntries[0]}`,
      workspaceRoot: root,
    };
  }

  return {
    status: 'ok',
    code: 'pending-has-tasks',
    message: `pending task queue has ${pendingEntries.length} item(s); bootstrap check passed`,
    workspaceRoot: root,
  };
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

const modulePath = fileURLToPath(import.meta.url);
const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (entryPath === modulePath) {
  runDoctor().catch((error) => {
    const reason = error instanceof Error ? error.message : String(error);
    console.log(`[warn] bootstrap task doctor failed: ${reason}`);
  });
}
