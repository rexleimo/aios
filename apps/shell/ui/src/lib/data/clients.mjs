// ADR 0007: only the capability subprocess imports scripts/lib; Next never does.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { repoRoot, resolveCapabilityCli } from './capability.mjs';

const execFileAsync = promisify(execFile);
const ACTIONS = Object.freeze(['inventory', 'preview-update', 'update']);
const PROCESS_ENV_KEYS = ['PATH', 'HOME', 'USERPROFILE', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'TMPDIR', 'TEMP', 'TMP'];
const ERROR_STATUS = Object.freeze({
  INVALID_REQUEST: 400, INVALID_CLIENT: 400, CONFIRM_REQUIRED: 400, REVISION_REQUIRED: 400,
  STALE_REVISION: 409, CLIENTS_LOCKED: 423, UPDATE_UNSUPPORTED: 422,
});

function failure(code, message) {
  return { ok: false, error: { code, message } };
}

export function clientManagementStatus(result) {
  if (result.ok) return 200;
  return Object.hasOwn(ERROR_STATUS, result.error?.code) ? ERROR_STATUS[result.error.code] : 502;
}

function requestArgs(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)
    || !ACTIONS.includes(request.action)
    || Object.keys(request).some((key) => !['action', 'client', 'confirm', 'expectedRevision'].includes(key))) return null;
  if (request.action === 'inventory') return Object.keys(request).length === 1 ? ['inventory'] : null;
  if (typeof request.client !== 'string' || !/^[a-z][a-z0-9-]{0,39}$/.test(request.client)) return null;
  if (request.action === 'preview-update') return Object.keys(request).length === 2 ? ['preview-update', request.client] : null;
  if (request.confirm !== true || typeof request.expectedRevision !== 'string' || !/^[a-f0-9]{64}$/.test(request.expectedRevision)) return null;
  return ['update', request.client, '--confirm', '--expected-revision', request.expectedRevision];
}

function defaultExists(file) {
  try { return fs.statSync(file).isFile(); } catch { return false; }
}

/** The injected runner has execFile/promisify's signature; no shell and no cached mutation. */
export async function runClientManagement(request, options = {}) {
  const args = requestArgs(request);
  if (!args) return failure('INVALID_REQUEST', 'Invalid client action. Updates require confirm:true and the exact preview expectedRevision.');
  const root = options.rootDir ?? repoRoot();
  const exists = options.exists ?? defaultExists;
  const located = (options.resolveCli ?? resolveCapabilityCli)(root);
  if (!located.ok) return failure('CLI_UNAVAILABLE', 'The AIOS capability runtime could not be located.');
  const script = path.join(path.dirname(located.script), 'aios-client-management.mjs');
  if (!exists(script)) return failure('CLI_UNAVAILABLE', 'The installed runtime does not include client management.');
  const maxBuffer = 1_048_576;
  let stdout;
  let failed = false;
  try {
    const result = await (options.run ?? execFileAsync)(process.execPath, [script, ...args], {
      shell: false, windowsHide: true, encoding: 'utf8', cwd: root,
      timeout: request.action === 'update' ? 145_000 : 20_000,
      maxBuffer, killSignal: 'SIGKILL', env: {
        ...Object.fromEntries(PROCESS_ENV_KEYS.filter((key) => typeof process.env[key] === 'string').map((key) => [key, process.env[key]])),
        AIOS_PROJECT_ROOT: root, LANG: 'C', LC_ALL: 'C', CI: '1', NO_COLOR: '1',
      },
    });
    stdout = result.stdout;
  } catch (error) {
    // Domain errors exit 1 with a JSON envelope. Never echo raw stderr/Error messages.
    if (error?.code !== 1 || error.killed || error.signal) return failure('CAPABILITY_FAILED', 'Client capability failed or exceeded its time/output limit.');
    failed = true;
    stdout = error.stdout;
  }
  if (typeof stdout !== 'string' || Buffer.byteLength(stdout) > maxBuffer) return failure('CAPABILITY_FAILED', 'Invalid client capability response.');
  try {
    const result = JSON.parse(stdout);
    if (!result || typeof result !== 'object' || typeof result.ok !== 'boolean') throw new Error('envelope');
    if (failed && result.ok) throw new Error('exit-status');
    if (!result.ok && (typeof result.error?.code !== 'string' || typeof result.error?.message !== 'string')) throw new Error('error');
    if (result.ok && (request.action === 'inventory' ? !Array.isArray(result.clients)
      : request.action === 'preview-update' ? !result.preview || typeof result.preview !== 'object' || Array.isArray(result.preview)
        : !result.result || typeof result.result !== 'object' || Array.isArray(result.result))) throw new Error('payload');
    return result;
  } catch {
    return failure('CAPABILITY_FAILED', 'Client capability returned invalid JSON or an invalid response shape.');
  }
}

export const loadClients = (options) => runClientManagement({ action: 'inventory' }, options);
export const previewClientUpdate = (client, options) => runClientManagement({ action: 'preview-update', client }, options);
export const updateClient = (request, options) => runClientManagement({ ...request, action: 'update' }, options);
