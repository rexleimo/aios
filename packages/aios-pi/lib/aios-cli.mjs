// AIOS CLI runner for the Pi extension. Pure + injectable: execFileImpl and
// existsImpl are injected so node --test can verify without spawning.
import path from 'node:path';

export const AIOS_ROOT_ENV_VARS = Object.freeze(['AIOS_ROOT_DIR', 'AIOS_ROOT', 'ROOTPATH']);
const AIOS_CLI_REL = ['scripts', 'aios.mjs'];
const MAX_WALK_UP = 4;

export class AiosCliError extends Error {
  constructor(message, { exitCode = 1, stderr = '' } = {}) {
    super(message);
    this.name = 'AiosCliError';
    this.exitCode = exitCode;
    this.stderr = stderr;
  }
}

// Resolve the AIOS install root: explicit env first, then walk up from the
// extension file looking for scripts/aios.mjs (repo checkout layout).
export function resolveAiosRoot({ env = {}, startDir = '', existsSync = null } = {}) {
  for (const key of AIOS_ROOT_ENV_VARS) {
    const raw = String(env[key] || '').trim();
    if (raw) return raw;
  }
  if (!startDir || typeof existsSync !== 'function') return '';
  let dir = path.resolve(startDir);
  for (let level = 0; level <= MAX_WALK_UP; level += 1) {
    if (existsSync(path.join(dir, ...AIOS_CLI_REL))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return '';
}

function defaultExecFile(nodeModule) {
  return nodeModule.child_process.execFile;
}

export async function runAios({ aiosRoot = '', argv = [], execFileImpl = null, nodeModule = null } = {}) {
  if (!aiosRoot) {
    throw new AiosCliError(
      `AIOS root not resolved: export one of ${AIOS_ROOT_ENV_VARS.join('/')} or install the extension inside an AIOS checkout.`,
    );
  }
  const execFile = execFileImpl || defaultExecFile(nodeModule || await import('node:child_process'));
  const cliPath = path.join(aiosRoot, ...AIOS_CLI_REL);
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [cliPath, ...argv], { timeout: 120000 }, (error, stdout, stderr) => {
      if (error) {
        reject(new AiosCliError(`aios ${argv[0] || ''} failed: ${String(stderr || error.message).trim()}`, {
          exitCode: typeof error.code === 'number' ? error.code : 1,
          stderr: String(stderr || ''),
        }));
        return;
      }
      resolve(String(stdout || ''));
    });
  });
}

export async function runAiosJson(options = {}) {
  const output = await runAios(options);
  const argv = options.argv || [];
  try {
    return JSON.parse(output);
  } catch {
    throw new AiosCliError(`aios ${argv[0] || ''} returned non-JSON output`, { stderr: output.slice(0, 500) });
  }
}

export function memoRecallArgs({ query = '', limit = 5 } = {}) {
  return ['memo', 'search', String(query || ''), '--limit', String(limit)];
}

export function memoWriteArgs({ text = '' } = {}) {
  return ['memo', 'add', String(text || '')];
}

export function memoUsefulArgs({ eventIds = [] } = {}) {
  return ['memo', 'useful', [...eventIds].map(String).join(',')];
}

export function skillSearchArgs({ query = '' } = {}) {
  return ['search', String(query || ''), '--json'];
}
