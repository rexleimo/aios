import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const TSX_CLI = path.join(REPO_ROOT, 'mcp-server', 'node_modules', 'tsx', 'dist', 'cli.mjs');
const CONTEXTDB_CLI = path.join(REPO_ROOT, 'mcp-server', 'src', 'contextdb', 'cli.ts');

function getCommandFailureDetail(result) {
  if (result?.error) {
    return result.error.message || String(result.error);
  }
  const stderr = String(result?.stderr || '').trim();
  const stdout = String(result?.stdout || '').trim();
  return stderr || stdout || `contextdb cli failed with exit code ${result?.status ?? 1}`;
}

export function runContextDbCli(args = [], { cwd = REPO_ROOT, env = process.env, spawnSyncImpl = spawnSync } = {}) {
  const commandArgs = [TSX_CLI, CONTEXTDB_CLI, ...args];
  const runCli = () => spawnSyncImpl(process.execPath, commandArgs, {
    cwd,
    env,
    encoding: 'utf8',
  });
  const result = runCli();

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(getCommandFailureDetail(result));
  }

  const stdout = String(result.stdout || '').trim();
  return stdout.length > 0 ? JSON.parse(stdout) : {};
}
