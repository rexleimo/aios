import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { parsePluginArgs } from '../../../lib/tooling/cli/parse-args/platform/plugin.mjs';
import { runPluginCommand } from '../../../lib/clients/plugins/cli.mjs';

const COMMIT = '1111111111111111111111111111111111111111';

function tempRoot(t) {
  const rootDir = mkdtempSync(path.join(os.tmpdir(), 'aios-plugin-github-'));
  t.after(() => rmSync(rootDir, { recursive: true, force: true }));
  return rootDir;
}

function pluginFixture(dir, manifest = { schemaVersion: 1, id: 'demo-plugin', version: '1.0.0', contributes: {} }) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest));
  writeFileSync(path.join(dir, 'panel.html'), '<h1>demo</h1>');
}

function recordingGit({ sourceDir = '', commit = COMMIT, fail = false } = {}) {
  const calls = [];
  const runGit = async (args) => {
    calls.push(args);
    if (fail) throw new Error('git failed');
    if (args[0] === 'clone') {
      cpSync(sourceDir, args.at(-1), { recursive: true });
    }
    if (args.includes('fetch')) {
      cpSync(sourceDir, args[1], { recursive: true });
    }
    if (args.includes('rev-parse')) return { stdout: `${commit}\n`, stderr: '' };
    return { stdout: '', stderr: '' };
  };
  return { calls, runGit };
}

async function githubModule() {
  return import('../../../lib/clients/plugins/sources/github.mjs');
}

test('parseGithubSource accepts shorthand and HTTPS GitHub URLs with optional refs', async () => {
  const { parseGithubSource } = await githubModule();
  assert.deepEqual(parseGithubSource('github:acme/demo'), {
    repo: 'acme/demo',
    ref: '',
    url: 'https://github.com/acme/demo.git',
  });
  assert.deepEqual(parseGithubSource('https://github.com/acme/demo.git#v1.2.3'), {
    repo: 'acme/demo',
    ref: 'v1.2.3',
    url: 'https://github.com/acme/demo.git',
  });
  assert.equal(parseGithubSource('github:acme/demo#main', { ref: 'main' }).ref, 'main');
});

test('parseGithubSource rejects non-GitHub, credentialed, query, and unsafe ref sources', async () => {
  const { parseGithubSource } = await githubModule();
  for (const source of [
    'https://gitlab.com/acme/demo',
    'ssh://git@github.com/acme/demo',
    'https://user:token@github.com/acme/demo',
    'https://github.com/acme/demo?tab=readme',
    'https://github.com/acme/demo/tree/main',
    'github:acme/demo#--upload-pack=evil',
    'github:acme/demo#feature/../main',
  ]) {
    assert.throws(() => parseGithubSource(source), undefined, source);
  }
  assert.throws(() => parseGithubSource('github:acme/demo#main', { ref: 'dev' }), /conflict|different|mismatch/u);
});

test('GitHub install publishes a validated plugin and registers its project-relative path', async t => {
  const { installGithubPlugin } = await githubModule();
  const rootDir = tempRoot(t);
  const sourceDir = tempRoot(t);
  pluginFixture(sourceDir);
  const git = recordingGit({ sourceDir });

  const result = await installGithubPlugin({ rootDir, source: 'github:acme/demo#v1.0.0', runGit: git.runGit });

  assert.equal(result.ok, true);
  assert.equal(result.value.id, 'demo-plugin');
  assert.equal(result.value.commit, COMMIT);
  const target = path.join(rootDir, '.aios', 'plugins', 'demo-plugin');
  assert.equal(existsSync(path.join(target, 'manifest.json')), true);
  const registry = JSON.parse(readFileSync(path.join(rootDir, 'config', 'plugins.json'), 'utf8'));
  assert.deepEqual(registry.plugins, [{ id: 'demo-plugin', manifest: '.aios/plugins/demo-plugin', enabled: true }]);
  assert.equal(readdirSync(path.join(rootDir, '.aios', 'plugins')).some(name => name.startsWith('.gitconfig-') || name.startsWith('.staging-')), false);
  assert.ok(git.calls.some(args => args[0] === 'clone' && args.includes('--branch') && args.includes('v1.0.0')));
  assert.ok(git.calls.some(args => args.includes('rev-parse')));
  assert.ok(git.calls.some(args => args.includes('checkout') && args.includes('--detach') && args.includes(COMMIT)));
  assert.equal(git.calls.some(args => /npm|pnpm|yarn|prepare|build/u.test(args.join(' '))), false);
});

test('GitHub install supports a pinned SHA without running package scripts', async t => {
  const { installGithubPlugin } = await githubModule();
  const rootDir = tempRoot(t);
  const sourceDir = tempRoot(t);
  pluginFixture(sourceDir);
  const git = recordingGit({ sourceDir });

  const result = await installGithubPlugin({ rootDir, source: `github:acme/demo#${COMMIT}`, runGit: git.runGit });

  assert.equal(result.ok, true);
  assert.ok(git.calls.some(args => args[0] === 'init'));
  assert.ok(git.calls.some(args => args.includes('fetch') && args.includes(COMMIT)));
  assert.ok(git.calls.some(args => args.includes('checkout') && args.includes('--detach')));
  assert.equal(git.calls.some(args => /npm|pnpm|yarn|prepare|build/u.test(args.join(' '))), false);
});

test('invalid manifest leaves no published target and no registry entry', async t => {
  const { installGithubPlugin } = await githubModule();
  const rootDir = tempRoot(t);
  const sourceDir = tempRoot(t);
  pluginFixture(sourceDir, { schemaVersion: 1, id: '', version: '1.0.0', contributes: {} });
  const git = recordingGit({ sourceDir });

  const result = await installGithubPlugin({ rootDir, source: 'github:acme/demo', runGit: git.runGit });

  assert.equal(result.ok, false);
  assert.match(result.error, /id/u);
  assert.equal(existsSync(path.join(rootDir, '.aios', 'plugins', 'demo-plugin')), false);
  assert.equal(existsSync(path.join(rootDir, 'config', 'plugins.json')), false);
});

test('duplicate plugin id preserves the existing registry and target', async t => {
  const { installGithubPlugin } = await githubModule();
  const rootDir = tempRoot(t);
  const sourceDir = tempRoot(t);
  pluginFixture(sourceDir);
  mkdirSync(path.join(rootDir, 'config'), { recursive: true });
  const registryPath = path.join(rootDir, 'config', 'plugins.json');
  const original = `${JSON.stringify({ schemaVersion: 1, plugins: [{ id: 'demo-plugin', manifest: 'plugins/original', enabled: true }] }, null, 2)}\n`;
  writeFileSync(registryPath, original);
  const target = path.join(rootDir, '.aios', 'plugins', 'demo-plugin');
  mkdirSync(target, { recursive: true });
  writeFileSync(path.join(target, 'keep.txt'), 'keep');
  const git = recordingGit({ sourceDir });

  const result = await installGithubPlugin({ rootDir, source: 'github:acme/demo', runGit: git.runGit });

  assert.equal(result.ok, false);
  assert.match(result.error, /already installed|already exists/u);
  assert.equal(readFileSync(registryPath, 'utf8'), original);
  assert.equal(readFileSync(path.join(target, 'keep.txt'), 'utf8'), 'keep');
});

test('Git failure is reported without publishing a plugin', async t => {
  const { installGithubPlugin } = await githubModule();
  const rootDir = tempRoot(t);
  const git = recordingGit({ fail: true });

  const result = await installGithubPlugin({ rootDir, source: 'github:acme/demo', runGit: git.runGit });

  assert.equal(result.ok, false);
  assert.match(result.error, /git failed/u);
  assert.equal(existsSync(path.join(rootDir, '.aios', 'plugins', 'demo-plugin')), false);
  assert.equal(existsSync(path.join(rootDir, 'config', 'plugins.json')), false);
});

test('plugin parser accepts install/add GitHub sources and preserves local install grammar', () => {
  const installed = parsePluginArgs(['plugin', 'install', 'github:acme/demo#v1.2.3']);
  assert.equal(installed.mode, 'command');
  assert.equal(installed.options.action, 'install');
  assert.equal(installed.options.source, 'github:acme/demo#v1.2.3');

  const added = parsePluginArgs(['plugin', 'add', 'https://github.com/acme/demo', '--ref', 'main']);
  assert.equal(added.options.action, 'add');
  assert.equal(added.options.source, 'https://github.com/acme/demo');
  assert.equal(added.options.ref, 'main');

  const local = parsePluginArgs(['plugin', 'install', '--id', 'demo-plugin', '--dir', 'plugins/demo']);
  assert.equal(local.options.id, 'demo-plugin');
  assert.equal(local.options.dir, 'plugins/demo');
  assert.equal(local.options.source, '');
});

test('existing local install still drives the real registry and UI projection', async t => {
  const rootDir = tempRoot(t);
  pluginFixture(path.join(rootDir, 'plugins', 'demo'), {
    schemaVersion: 1,
    id: 'demo-plugin',
    version: '1.0.0',
    contributes: { panels: [{ id: 'demo', href: '/demo', label: 'Demo', title: 'Demo', ui: { entry: 'panel.html' } }] },
  });
  const output = [];
  const result = await runPluginCommand(
    { action: 'install', id: 'demo-plugin', dir: 'plugins/demo', json: true },
    { projectRoot: rootDir, stdout: { write: value => output.push(value) } },
  );
  assert.equal(result.exitCode, 0);
  const registry = JSON.parse(readFileSync(path.join(rootDir, 'config', 'plugins.json'), 'utf8'));
  assert.equal(registry.plugins[0].id, 'demo-plugin');
  assert.equal(existsSync(path.join(rootDir, '.aios', 'gateway', 'plugin-views.json')), true);
  assert.match(output.join(''), /demo-plugin/u);
});
