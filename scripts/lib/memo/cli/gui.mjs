import { spawn } from 'node:child_process';
import path from 'node:path';
import { DEFAULT_AIOS_ROOT_DIR } from './constants.mjs';
import {
  detectWorkspaceRoot,
  parsePositivePort,
  usageError,
  workspaceProjectName,
} from './shared.mjs';

function splitGuiFlags(argv) {
  const flags = {
    port: 3210,
    project: '',
    openBrowser: true,
  };

  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') break;
    if (arg === '--port') {
      flags.port = parsePositivePort(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg === '--project') {
      const value = String(argv[index + 1] || '').trim();
      if (!value || value.startsWith('-')) throw usageError('--project requires a value');
      flags.project = value;
      index += 1;
      continue;
    }
    if (arg === '--no-open') {
      flags.openBrowser = false;
      continue;
    }
    throw usageError(`Unknown memo gui option: ${arg}`);
  }

  return flags;
}

export function buildMemoGuiLaunchPlan(
  argv = [],
  { workspaceRoot = detectWorkspaceRoot(process.cwd()), aiosRootDir = '' } = {},
) {
  if (argv[0] !== 'gui') {
    throw usageError('Usage: memo gui [--port N] [--project name] [--no-open]');
  }
  const resolvedWorkspaceRoot = path.resolve(workspaceRoot);
  const resolvedAiosRootDir = aiosRootDir ? path.resolve(aiosRootDir) : DEFAULT_AIOS_ROOT_DIR;
  const flags = splitGuiFlags(argv);
  const project = flags.project || workspaceProjectName(resolvedWorkspaceRoot);
  const contextDbArgs = [
    'genealogy:serve',
    '--workspace', resolvedWorkspaceRoot,
    '--project', project,
    '--assets-root', resolvedAiosRootDir,
    '--port', String(flags.port),
  ];
  if (!flags.openBrowser) {
    contextDbArgs.push('--no-open');
  }

  return {
    workspaceRoot: resolvedWorkspaceRoot,
    aiosRootDir: resolvedAiosRootDir,
    project,
    port: flags.port,
    openBrowser: flags.openBrowser,
    contextDbArgs,
  };
}

export function runMemoGuiServer(plan) {
  let child = null;
  const promise = new Promise((resolve, reject) => {
    const tsxCli = path.join(plan.aiosRootDir, 'mcp-server', 'node_modules', 'tsx', 'dist', 'cli.mjs');
    const contextDbCli = path.join(plan.aiosRootDir, 'mcp-server', 'src', 'contextdb', 'cli.ts');
    child = spawn(process.execPath, [tsxCli, contextDbCli, ...plan.contextDbArgs], {
      cwd: plan.workspaceRoot,
      env: {
        ...process.env,
        AIOS_ROOT_DIR: plan.aiosRootDir,
      },
      stdio: 'inherit',
    });

    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      process.off('SIGINT', forwardSigint);
      process.off('SIGTERM', forwardSigterm);
      if (error) reject(error);
      else resolve();
    };
    const forwardSignal = (signal) => {
      if (child && !child.killed) child.kill(signal);
    };
    const forwardSigint = () => forwardSignal('SIGINT');
    const forwardSigterm = () => forwardSignal('SIGTERM');
    process.once('SIGINT', forwardSigint);
    process.once('SIGTERM', forwardSigterm);

    child.once('error', finish);
    child.once('exit', (status, signal) => {
      if (signal) {
        finish();
        return;
      }
      if (status && status !== 0) {
        const error = new Error(`memo gui exited with status ${status}`);
        error.code = 'AIOS_MEMO_GUI_FAILED';
        finish(error);
        return;
      }
      finish();
    });
  });

  // Allow tests (and callers) to stop the server without process.emit races under node:test.
  promise.kill = (signal = 'SIGTERM') => {
    if (child && !child.killed) child.kill(signal);
  };
  Object.defineProperty(promise, 'pid', {
    get() {
      return child?.pid ?? null;
    },
  });
  return promise;
}
