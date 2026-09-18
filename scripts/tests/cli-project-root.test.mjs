import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  applyProjectRootFlag,
  resolveProjectRoot,
} from '../lib/cli/project-root.mjs';

const SCRIPT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function createTempRoot(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aios-project-root-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('the explicit --project-root flag wins over AIOS_PROJECT_ROOT and the working directory', (t) => {
  const temp = createTempRoot(t);
  const flagged = path.join(temp, 'flagged');
  const fromEnv = path.join(temp, 'from-env');
  const fromCwd = path.join(temp, 'from-cwd');
  for (const dir of [flagged, fromEnv, fromCwd]) fs.mkdirSync(dir);

  assert.equal(
    resolveProjectRoot({ flagValue: flagged, env: { AIOS_PROJECT_ROOT: fromEnv }, cwd: fromCwd }),
    flagged,
  );
});

test('AIOS_PROJECT_ROOT is honored when no flag is passed, and relative values resolve against cwd', (t) => {
  const temp = createTempRoot(t);
  const fromEnv = path.join(temp, 'from-env');
  fs.mkdirSync(fromEnv);

  assert.equal(resolveProjectRoot({ env: { AIOS_PROJECT_ROOT: fromEnv }, cwd: temp }), fromEnv);
  assert.equal(resolveProjectRoot({ env: { AIOS_PROJECT_ROOT: 'from-env' }, cwd: temp }), fromEnv);
  const nested = path.join(temp, 'sub');
  fs.mkdirSync(nested);
  assert.equal(resolveProjectRoot({ flagValue: 'sub', env: {}, cwd: temp }), nested);
});

test('a stale AIOS_PROJECT_ROOT falls back to the working directory instead of failing the command', (t) => {
  const temp = createTempRoot(t);
  const missing = path.join(temp, 'deleted-checkout');
  const file = path.join(temp, 'not-a-directory');
  fs.writeFileSync(file, '');

  assert.equal(resolveProjectRoot({ env: { AIOS_PROJECT_ROOT: missing }, cwd: temp }), temp);
  assert.equal(resolveProjectRoot({ env: { AIOS_PROJECT_ROOT: file }, cwd: temp }), temp);
  assert.equal(resolveProjectRoot({ env: { AIOS_PROJECT_ROOT: '   ' }, cwd: temp }), temp);
});

test('an explicit --project-root that is not a directory fails closed with the flag name', () => {
  assert.throws(
    () => resolveProjectRoot({ flagValue: '/definitely/not/here', env: {}, cwd: process.cwd() }),
    (error) => {
      assert.match(error.message, /--project-root/u);
      assert.match(error.message, /not a directory/u);
      return true;
    },
  );
});

test('applyProjectRootFlag rewrites the dispatch context only when the flag is present', (t) => {
  const temp = createTempRoot(t);
  const context = { rootDir: '/runtime/root', projectRoot: '/runtime/root' };

  assert.equal(applyProjectRootFlag(context, {}), '/runtime/root');
  assert.equal(context.projectRoot, '/runtime/root');

  assert.equal(applyProjectRootFlag(context, { projectRoot: '  ' }), '/runtime/root');
  assert.equal(applyProjectRootFlag(context, { projectRoot: temp }), temp);
  assert.equal(context.projectRoot, temp);
});

test('the project root channel is declared in the parser, specs, and help text', () => {
  const read = (relativePath) => fs.readFileSync(path.join(SCRIPT_ROOT, relativePath), 'utf8');
  for (const relativePath of [
    'lib/cli/parse-args/top-level.mjs',
    'lib/cli/parse-args/internal.mjs',
    'lib/cli/commander/specs/lifecycle.mjs',
    'lib/cli/commander/specs/internal.mjs',
    'lib/cli/help/commands/basic.mjs',
  ]) {
    assert.match(read(relativePath), /--project-root <path>/u, `${relativePath} must document the flag`);
  }
  assert.match(read('lib/cli/dispatch.mjs'), /applyProjectRootFlag\(context, parsed\.options\)/u);
  assert.match(read('aios.mjs'), /resolveProjectRoot\(\{ env: process\.env \}\)/u);
});

test('the parsers map --project-root into the dispatch options', async () => {
  const { parseArgs } = await import('../lib/cli/parse-args.mjs');

  const internal = await parseArgs(['internal', 'skills', 'doctor', '--project-root', '/tmp/declared']);
  assert.equal(internal.options.projectRoot, '/tmp/declared');

  const setup = await parseArgs(['setup', '--components', 'skills', '--scope', 'project', '--project-root', '/tmp/declared']);
  assert.equal(setup.options.projectRoot, '/tmp/declared');

  const doctor = await parseArgs(['doctor', '--project-root', '/tmp/declared']);
  assert.equal(doctor.options.projectRoot, '/tmp/declared');
});

test('a guard refusal prints one actionable line instead of a stack trace', () => {
  const repoRoot = path.resolve(SCRIPT_ROOT, '..');
  const result = spawnSync(
    process.execPath,
    [path.join(SCRIPT_ROOT, 'aios.mjs'), 'internal', 'skills', 'doctor', '--client', 'codex', '--scope', 'project'],
    { encoding: 'utf8', cwd: repoRoot },
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /--project-root <path>/u, result.stderr);
  assert.doesNotMatch(result.stderr, /at assertProjectScopeAllowed/u, result.stderr);
});

test('the runtime entry resolves the project root from the flag before dispatch', (t) => {
  const temp = createTempRoot(t);
  const declared = path.join(temp, 'declared');
  fs.mkdirSync(declared);

  const result = spawnSync(
    process.execPath,
    [
      path.join(SCRIPT_ROOT, 'aios.mjs'),
      'internal',
      'skills',
      'doctor',
      '--client',
      'codex',
      '--scope',
      'global',
      '--project-root',
      declared,
    ],
    {
      encoding: 'utf8',
      env: { ...process.env, AGENTS_HOME: temp },
    },
  );
  const output = `${result.stdout}${result.stderr}`;
  assert.equal(result.status, 0, output);
  // 中文注释：断言解析后的 project root 被回显，用户不再靠 cwd 猜测命令作用在哪个项目上。
  assert.match(output, new RegExp(`Project root: ${escapeRegExp(declared)}`, 'u'));
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
