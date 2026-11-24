// sources/github.mjs — GitHub 插件来源适配器。
// 只克隆并固定 commit；不运行仓库的 build/prepare/install 脚本。
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';

import { loadPluginManifest } from '../loader.mjs';
import { PLUGIN_ID_PATTERN } from '../core/manifest.mjs';
import { changePluginsRegistry, writePluginsRegistry } from '../core/registry.mjs';
import { attempt, attemptAsync, ok } from '../core/result.mjs';

const REPO_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\/[A-Za-z0-9._-]+$/u;
const SHA_PATTERN = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/iu;
const UNSAFE_REF_PATTERN = /(?:^|\/)(?:\.{1,2})(?:\/|$)|@\{/u;
const UNSAFE_REF_CHARS = new Set('~^:?*[\\'.split(''));

export class GithubSourceError extends Error {
  constructor(message) {
    super(message);
    this.name = 'GithubSourceError';
  }
}

function normalizeRef(value, label) {
  const ref = String(value || '').trim();
  if (!ref) return '';
  if (ref.startsWith('-')
    || UNSAFE_REF_PATTERN.test(ref)
    || [...ref].some((char) => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127 || UNSAFE_REF_CHARS.has(char))
    || ref.endsWith('/')
    || ref.endsWith('.lock')) {
    throw new GithubSourceError(`${label} contains an unsafe Git ref`);
  }
  return ref;
}

function decodeFragment(fragment) {
  if (!fragment) return '';
  const decoded = attempt(() => decodeURIComponent(fragment));
  if (!decoded.ok) throw new GithubSourceError('GitHub source contains an invalid ref fragment');
  return normalizeRef(decoded.value, 'GitHub source ref');
}

function normalizeRepo(value) {
  const repo = String(value || '').replace(/\.git$/iu, '').replace(/^\/+|\/+$/gu, '');
  if (!REPO_PATTERN.test(repo)) throw new GithubSourceError('GitHub source must name owner/repo');
  return repo;
}

/** 解析 github:owner/repo[#ref] 或 https://github.com/owner/repo[.git][#ref]。 */
export function parseGithubSource(input, { ref = '' } = {}) {
  const source = String(input || '').trim();
  const flagRef = normalizeRef(ref, '--ref');
  if (!source) throw new GithubSourceError('GitHub source is required');

  if (source.startsWith('github:')) {
    const [rawRepo, fragment = ''] = source.slice('github:'.length).split('#');
    const repo = normalizeRepo(rawRepo);
    const sourceRef = decodeFragment(fragment);
    if (flagRef && sourceRef && flagRef !== sourceRef) {
      throw new GithubSourceError('GitHub source ref conflicts with --ref');
    }
    return Object.freeze({ repo, ref: flagRef || sourceRef, url: `https://github.com/${repo}.git` });
  }

  const parsed = attempt(() => new URL(source));
  if (!parsed.ok
    || parsed.value.protocol !== 'https:'
    || parsed.value.hostname.toLowerCase() !== 'github.com'
    || parsed.value.port
    || parsed.value.username
    || parsed.value.password
    || parsed.value.search) {
    throw new GithubSourceError('GitHub source must be an HTTPS github.com URL without credentials or query parameters');
  }
  const segments = parsed.value.pathname.split('/').filter(Boolean);
  if (segments.length !== 2) {
    throw new GithubSourceError('GitHub URL must contain exactly owner/repo; use #ref for a branch, tag, or commit');
  }
  const repo = normalizeRepo(segments.join('/'));
  const sourceRef = decodeFragment(parsed.value.hash.slice(1));
  if (flagRef && sourceRef && flagRef !== sourceRef) {
    throw new GithubSourceError('GitHub source ref conflicts with --ref');
  }
  return Object.freeze({ repo, ref: flagRef || sourceRef, url: `https://github.com/${repo}.git` });
}

function gitEnv(globalConfig) {
  return {
    ...process.env,
    GIT_TERMINAL_PROMPT: '0',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: globalConfig,
  };
}

function runGitCommand(args, { cwd, globalConfig } = {}) {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, env: gitEnv(globalConfig), windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        const detail = String(stderr || stdout || error.message).trim();
        reject(new Error(`git ${args[0]} failed: ${detail}`));
        return;
      }
      resolve({ stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

async function cloneSource({ source, staging, runGit }) {
  if (!source.ref) {
    await runGit(['clone', '--depth', '1', '--single-branch', '--no-tags', source.url, staging]);
    return;
  }
  if (SHA_PATTERN.test(source.ref)) {
    fs.mkdirSync(staging, { recursive: true });
    await runGit(['init', staging]);
    await runGit(['-C', staging, 'remote', 'add', 'origin', source.url]);
    await runGit(['-C', staging, 'fetch', '--depth', '1', 'origin', source.ref]);
    await runGit(['-C', staging, 'checkout', '--detach', 'FETCH_HEAD']);
    return;
  }
  await runGit(['clone', '--depth', '1', '--single-branch', '--branch', source.ref, '--no-tags', source.url, staging]);
}

function cleanup(target) {
  attempt(() => fs.rmSync(target, { recursive: true, force: true }));
}

/** 安装 GitHub 插件：stage → validate → publish → registry，失败回滚本次发布。 */
export async function installGithubPlugin({
  rootDir,
  source,
  id = '',
  ref = '',
  runGit = runGitCommand,
} = {}) {
  const prepared = attempt(() => {
    const parsed = parseGithubSource(source, { ref });
    const root = path.resolve(String(rootDir || ''));
    const pluginRoot = path.join(root, '.aios', 'plugins');
    return {
      root,
      parsed,
      pluginRoot,
      staging: path.join(pluginRoot, `.staging-${randomUUID()}`),
      globalConfig: path.join(pluginRoot, `.gitconfig-${randomUUID()}`),
    };
  });
  if (!prepared.ok) return prepared;

  const { root, parsed, pluginRoot, staging, globalConfig } = prepared.value;
  const published = { target: '' };
  const installed = await attemptAsync(async () => {
    fs.mkdirSync(pluginRoot, { recursive: true });
    fs.writeFileSync(globalConfig, '', { mode: 0o600 });
    const git = (args) => runGit(args, { globalConfig });
    await cloneSource({ source: parsed, staging, runGit: git });
    const resolved = await git(['-C', staging, 'rev-parse', 'HEAD']);
    const commit = resolved.stdout.trim();
    if (!SHA_PATTERN.test(commit)) throw new Error(`git rev-parse returned an invalid commit: ${JSON.stringify(commit)}`);
    await git(['-C', staging, 'checkout', '--detach', commit]);

    const manifestResult = loadPluginManifest({ dir: staging });
    if (!manifestResult.ok) throw new Error(manifestResult.error);
    const manifest = manifestResult.value;
    const pluginId = String(id || manifest.id).trim();
    if (!PLUGIN_ID_PATTERN.test(pluginId)) throw new GithubSourceError(`invalid plugin id ${JSON.stringify(pluginId)}`);
    if (id && manifest.id !== pluginId) throw new GithubSourceError(`manifest id ${manifest.id} != requested ${pluginId}`);

    const target = path.join(pluginRoot, pluginId);
    if (fs.existsSync(target)) throw new Error(`plugin target already exists: ${target}`);
    const registryEntry = path.relative(root, target).split(path.sep).join('/');
    const changed = changePluginsRegistry({ rootDir: root, action: 'add', id: pluginId, manifest: registryEntry });
    if (!changed.ok) throw new Error(changed.error);

    fs.renameSync(staging, target);
    published.target = target;
    const written = writePluginsRegistry({ rootDir: root, plugins: changed.value.plugins });
    if (!written.ok) throw new Error(written.error);
    return {
      id: pluginId,
      source: `github:${parsed.repo}${parsed.ref ? `#${parsed.ref}` : ''}`,
      commit,
      manifest: registryEntry,
      contributes: manifest.contributes,
    };
  });

  if (!installed.ok) {
    cleanup(staging);
    cleanup(globalConfig);
    if (published.target) cleanup(published.target);
    return installed;
  }
  cleanup(globalConfig);
  return ok(installed.value);
}
