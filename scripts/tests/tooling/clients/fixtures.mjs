import path from 'node:path';
import { createClientManager } from '../../../lib/tooling/clients/index.mjs';

const PACKAGES = { claude: '@anthropic-ai/claude-code', codex: '@openai/codex', pi: '@mariozechner/pi-coding-agent' };

function error(code) { return Object.assign(new Error(code), { code }); }

/** Entirely in-memory filesystem: no client/config/registry files or processes are touched. */
export function fixture() {
  const files = new Map();
  const calls = [];
  const reads = [];
  const versions = new Map();
  let serial = 0;
  const state = { onRun: null, onRead: null };
  const normalize = (file) => path.posix.resolve(file);
  function add(file, kind, details = {}) {
    file = normalize(file);
    const parent = path.posix.dirname(file);
    if (parent !== file && !files.has(parent)) add(parent, 'directory');
    const number = ++serial;
    files.set(file, { kind, ino: number, mtimeMs: number, ctimeMs: number, mode: 0o755, ...details });
    return file;
  }
  add('/', 'directory');
  function realpath(file, depth = 0) {
    if (depth > 20) throw error('ELOOP');
    const parts = normalize(file).split('/').filter(Boolean);
    let current = '/';
    for (let index = 0; index < parts.length; index += 1) {
      current = path.posix.join(current, parts[index]);
      const entry = files.get(current);
      if (!entry) throw error('ENOENT');
      if (entry.kind === 'link') {
        return realpath(path.posix.resolve(path.posix.dirname(current), entry.target, ...parts.slice(index + 1)), depth + 1);
      }
    }
    return current;
  }
  function stat(entry) {
    if (!entry) throw error('ENOENT');
    return {
      dev: 1, ino: entry.ino, size: Buffer.byteLength(entry.text ?? entry.target ?? ''), mode: entry.mode,
      mtimeMs: entry.mtimeMs, ctimeMs: entry.ctimeMs,
      isSymbolicLink: () => entry.kind === 'link', isFile: () => entry.kind === 'file', isDirectory: () => entry.kind === 'directory',
    };
  }
  const io = {
    async realpath(file) { return realpath(file); },
    async lstat(file) { return stat(files.get(normalize(file))); },
    async access(file, mode) { const entry = files.get(realpath(file)); if ((mode & 1) && !(entry.mode & 0o111)) throw error('EACCES'); },
    async readlink(file) { const entry = files.get(normalize(file)); if (!entry) throw error('ENOENT'); return entry.target; },
    async open(file, mode) {
      if (mode !== 'r') throw error('EPERM');
      const resolved = realpath(file);
      reads.push(resolved);
      state.onRead?.(resolved);
      return {
        async stat() { return stat(files.get(resolved)); },
        async read(buffer, offset, length, position) {
          const bytes = Buffer.from(files.get(resolved).text ?? '').subarray(position, position + length);
          bytes.copy(buffer, offset);
          return { bytesRead: bytes.length };
        },
        async close() {},
      };
    },
    async mkdir(file) {
      file = normalize(file);
      if (files.has(file)) throw error('EEXIST');
      if (!files.has(path.posix.dirname(file))) throw error('ENOENT');
      add(file, 'directory');
    },
    async rmdir(file) {
      file = normalize(file);
      if (files.get(file)?.kind !== 'directory') throw error('ENOENT');
      if ([...files.keys()].some((key) => key.startsWith(`${file}/`))) throw error('ENOTEMPTY');
      files.delete(file);
    },
  };
  const api = {
    files, calls, reads, state, fs: io,
    file: (file, text = '', mode = 0o755) => add(file, 'file', { text, mode }),
    link: (file, target) => add(file, 'link', { target }),
    json: (file, data) => add(file, 'file', { text: JSON.stringify(data) }),
    setVersion: (file, value) => versions.set(file, value),
    install(id, { prefix = '/tools', version = '1.2.3', npm = true } = {}) {
      const root = `${prefix}/lib/node_modules/${PACKAGES[id]}`;
      const bin = id === 'pi' ? 'dist/cli.js' : 'bin/cli.js';
      api.json(`${root}/package.json`, { name: PACKAGES[id], version, bin: { [id]: bin } });
      api.file(`${root}/${bin}`, '#!/usr/bin/env node\n');
      api.link(`${prefix}/bin/${id}`, `../lib/node_modules/${PACKAGES[id]}/${bin}`);
      versions.set(`${root}/${bin}`, version);
      if (npm && !files.has(`${prefix}/lib/node_modules/npm/package.json`)) {
        api.json(`${prefix}/lib/node_modules/npm/package.json`, { name: 'npm', version: '10.0.0', bin: { npm: 'bin/npm-cli.js' } });
        api.file(`${prefix}/lib/node_modules/npm/bin/npm-cli.js`, '#!/usr/bin/env node\n');
      }
      return { root, bin: `${root}/${bin}`, link: `${prefix}/bin/${id}`, metadata: `${root}/package.json` };
    },
  };
  api.file('/runtime/node', 'fake node');
  add('/locks', 'directory');
  api.options = {
    fs: io, platform: 'linux', home: '/home/test', env: { PATH: '/tools/bin:/usr/bin', HOME: '/home/test', OPENAI_API_KEY: 'do-not-inherit', NODE_OPTIONS: '--require malicious' },
    cwd: '/tmp', nodePath: '/runtime/node', lockPath: '/locks/client.lock',
    async run(file, args, options) {
      const call = { file, args, options };
      calls.push(call);
      const overridden = await state.onRun?.(call);
      if (overridden !== undefined) return overridden;
      if (args.length === 1 && args[0] === '--version') return { stdout: versions.get(file) ?? '1.2.3', stderr: '' };
      if (args[1] !== 'update') throw new Error('Unexpected fake command');
      return { stdout: 'up to date', stderr: '' };
    },
  };
  api.manager = (overrides = {}) => createClientManager({ ...api.options, ...overrides });
  return api;
}

export function mutationCalls(fx) { return fx.calls.filter((call) => call.args.includes('update')); }
