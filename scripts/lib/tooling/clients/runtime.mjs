import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const ENV_KEYS = ['PATH', 'HOME', 'USERPROFILE', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'TMPDIR', 'TEMP', 'TMP'];
export const PROBE_LIMITS = Object.freeze({ timeout: 2_500, maxBuffer: 16_384 });
export const UPDATE_LIMITS = Object.freeze({ timeout: 120_000, maxBuffer: 262_144 });

export class ClientManagementError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'ClientManagementError';
    this.code = code;
    Object.assign(this, details);
  }
}

export function hash(value) {
  return createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
}

export function redact(value) {
  return String(value ?? '')
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?(?:-----END [^-]*PRIVATE KEY-----|$)/g, '[REDACTED PRIVATE KEY]')
    .replace(/\b(?:sk-[a-zA-Z0-9_-]{8,}|gh[pousr]_[a-zA-Z0-9_]+|github_pat_[a-zA-Z0-9_]+|npm_[a-zA-Z0-9]+)\b/g, '[REDACTED]')
    .replace(/(https?:\/\/)[^\s/@]+(?::[^\s/@]*)?@/gi, '$1[REDACTED]@')
    .replace(/(\b(?:authorization|proxy-authorization|cookie|set-cookie)\s*["']?\s*[:=]\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\r\n,;}]+)/gi, '$1[REDACTED]')
    .replace(/((?:[?&]|\b)[\w-]*(?:api[_-]?key|token|secret|password|passwd|_auth)[\w-]*["']?\s*[:=]\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,"';&}]+)/gi, '$1[REDACTED]')
    .replace(/\b(?:bearer|basic)\s+[a-z\d+/_=.-]{8,}/gi, '[REDACTED]')
    .replace(/\beyJ[a-z\d_-]+\.[a-z\d_-]+\.[a-z\d_-]+\b/gi, '[REDACTED]')
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');
}

export function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

function environment(env) {
  return { ...Object.fromEntries(ENV_KEYS.filter((key) => typeof env[key] === 'string').map((key) => [key, env[key]])),
    LANG: 'C', LC_ALL: 'C', CI: '1', NO_COLOR: '1' };
}

export function createRuntime(options = {}) {
  const platform = options.platform ?? process.platform;
  const io = options.fs ?? fs;
  const env = environment(options.env ?? process.env);
  const paths = platform === 'win32' ? path.win32 : path.posix;
  const runtime = {
    fs: io, env: freeze(env), platform, paths,
    home: options.home ?? os.homedir(),
    cwd: options.cwd ?? os.tmpdir(),
    nodePath: options.nodePath ?? process.execPath,
    lockPath: options.lockPath ?? path.join(os.tmpdir(), `aios-client-management-${process.getuid?.() ?? 'user'}.lock`),
    run: options.run ?? execFileAsync,
  };
  runtime.resolveExecutable = options.resolveExecutable ?? ((name) => resolveExecutable(name, runtime));
  return Object.freeze(runtime);
}

export function fileIdentity(stat) {
  return Object.fromEntries(['dev', 'ino', 'size', 'mode', 'mtimeMs', 'ctimeMs'].map((key) => [key, String(stat[key] ?? '')]));
}

export async function inspectExecutable(candidate, runtime) {
  if (typeof candidate !== 'string' || !runtime.paths.isAbsolute(candidate)) {
    throw new ClientManagementError('INVALID_EXECUTABLE', 'Executable resolver must return an absolute path.');
  }
  const executable = runtime.paths.normalize(candidate);
  const links = [];
  let current = executable;
  for (let depth = 0; depth <= 12; depth += 1) {
    const stat = await runtime.fs.lstat(current);
    if (!stat.isSymbolicLink()) {
      if (!stat.isFile()) throw new ClientManagementError('INVALID_EXECUTABLE', 'Resolved executable is not a regular file.');
      await runtime.fs.access(current, runtime.platform === 'win32' ? constants.F_OK : constants.X_OK);
      const realPath = await runtime.fs.realpath(executable);
      if (realPath !== current) throw new ClientManagementError('EXECUTABLE_CHANGED', 'Executable changed while resolving symlinks.');
      return { path: executable, realPath, identity: fileIdentity(stat), links };
    }
    if (depth === 12) throw new ClientManagementError('INVALID_EXECUTABLE', 'Executable symlink chain exceeds the safety limit.');
    const target = await runtime.fs.readlink(current);
    links.push({ path: current, target, identity: fileIdentity(stat) });
    current = runtime.paths.resolve(runtime.paths.dirname(current), target);
  }
}

export async function resolveExecutable(name, runtime) {
  const { paths, platform } = runtime;
  const suffixes = platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : [''];
  for (const directory of String(runtime.env.PATH ?? '').split(paths.delimiter)) {
    // Relative/empty PATH entries are project-controlled, not installation evidence.
    if (!paths.isAbsolute(directory)) continue;
    for (const suffix of suffixes) {
      const candidate = paths.join(directory, `${name}${suffix}`);
      try {
        await inspectExecutable(candidate, runtime);
        return candidate;
      } catch (error) {
        if (!['ENOENT', 'ENOTDIR', 'EACCES'].includes(error?.code)) throw error;
      }
    }
  }
  return null;
}

export async function readMetadata(file, runtime) {
  let handle;
  try {
    handle = await runtime.fs.open(file, 'r');
    const before = await handle.stat();
    if (!before.isFile() || before.size > 65_536) throw new Error('metadata size/type');
    const buffer = Buffer.alloc(65_537);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const after = await handle.stat();
    if (bytesRead > 65_536 || hash(fileIdentity(before)) !== hash(fileIdentity(after))) throw new Error('metadata changed');
    const text = buffer.subarray(0, bytesRead).toString('utf8');
    return { path: file, digest: hash(text), identity: fileIdentity(after), data: JSON.parse(text) };
  } finally {
    if (handle) await handle.close();
  }
}

export async function runBounded(command, runtime, limits) {
  try {
    const result = await runtime.run(command.file, [...command.args], {
      ...limits, shell: false, windowsHide: true, encoding: 'utf8', killSignal: 'SIGKILL',
      cwd: runtime.cwd, env: { ...runtime.env },
    });
    const stdout = String(result.stdout ?? '');
    const stderr = String(result.stderr ?? '');
    if (Buffer.byteLength(stdout) > limits.maxBuffer || Buffer.byteLength(stderr) > limits.maxBuffer) {
      throw new Error('output-limit');
    }
    if (typeof result.code === 'number' && result.code !== 0) throw new Error('nonzero-exit');
    return { stdout: redact(stdout), stderr: redact(stderr) };
  } catch (error) {
    // Do not serialize Error/argv/env: execFile errors can contain the whole process output.
    throw new ClientManagementError('PROCESS_FAILED', 'Client process failed or exceeded its time/output limit.', {
      output: redact(`${error?.stdout ?? ''}\n${error?.stderr ?? ''}`).slice(0, limits.maxBuffer),
    });
  }
}
