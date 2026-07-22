import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import {
  HEADROOM_PACKAGE_SPEC,
  buildHeadroomInstallPlan,
  ensureHeadroomInstalled,
  isSupportedHeadroomVersion,
  parseHeadroomVersion,
} from '../lib/aios-init/headroom-installer.mjs';

test('Headroom version and installer policy is fixed to 0.31.x in an isolated tool env', () => {
  assert.equal(HEADROOM_PACKAGE_SPEC, 'headroom-ai[all]>=0.31.0,<0.32.0');
  assert.deepEqual(parseHeadroomVersion('headroom 0.31.0'), [0, 31, 0]);
  assert.equal(isSupportedHeadroomVersion('0.31.0'), true);
  assert.equal(isSupportedHeadroomVersion('0.31.9'), true);
  assert.equal(isSupportedHeadroomVersion('0.30.9'), false);
  assert.equal(isSupportedHeadroomVersion('0.32.0'), false);
  assert.deepEqual(buildHeadroomInstallPlan({ pythonVersion: '3.12.2', uvAvailable: true, pipxAvailable: true }), {
    status: 'missing', command: 'uv', args: ['tool', 'install', HEADROOM_PACKAGE_SPEC],
  });
  assert.deepEqual(buildHeadroomInstallPlan({ pythonVersion: '3.10.0', uvAvailable: false, pipxAvailable: true }), {
    status: 'missing', command: 'pipx', args: ['install', HEADROOM_PACKAGE_SPEC],
  });
  assert.equal(buildHeadroomInstallPlan({ pythonVersion: '3.9.18', uvAvailable: true, pipxAvailable: true }).status, 'unsupported-platform');
  assert.equal(buildHeadroomInstallPlan({ pythonVersion: '3.12.2', uvAvailable: false, pipxAvailable: false }).status, 'unsupported-platform');
  assert.equal(buildHeadroomInstallPlan({ installedVersion: '0.32.0', pythonVersion: '3.12.2', uvAvailable: true }).status, 'unsupported-version');
});

test('ensureHeadroomInstalled verifies four CLI surfaces and dry-run never spawns an installer', async () => {
  const calls = [];
  const executable = path.resolve('fixtures', 'headroom', 'bin', 'headroom');
  const resolverCommand = process.platform === 'win32' ? 'where.exe' : 'which';
  const result = await ensureHeadroomInstalled({
    dryRun: false,
    probe: { status: 'missing', pythonVersion: '3.12.2', uvAvailable: true, pipxAvailable: false },
    runImpl: async (command, args) => { calls.push([command, args]); return { status: 0 }; },
    captureImpl: (command, args) => ({
      status: 0,
      stdout: command === resolverCommand ? executable : args[0] === '--version' ? 'headroom 0.31.0' : '',
      stderr: '',
    }),
  });
  assert.equal(result.status, 'installed');
  assert.equal(result.executable, executable);
  assert.deepEqual(calls[0], ['uv', ['tool', 'install', HEADROOM_PACKAGE_SPEC]]);
  assert.deepEqual(result.smoke.map((item) => item.args), [
    ['--version'], ['--help'], ['wrap', '--help'], ['mcp', 'serve', '--help'],
  ]);

  const dryCalls = [];
  const dry = await ensureHeadroomInstalled({
    dryRun: true,
    probe: { status: 'missing', pythonVersion: '3.12.2', uvAvailable: true, pipxAvailable: false },
    runImpl: async (...args) => { dryCalls.push(args); return { status: 0 }; },
  });
  assert.equal(dry.status, 'missing');
  assert.equal(dry.planned, true);
  assert.deepEqual(dryCalls, []);
});

test('ensureHeadroomInstalled verifies existing installs and returns an absolute executable for MCP registration', async () => {
  const executable = path.resolve('fixtures', 'headroom', 'existing', 'headroom');
  const resolverCommand = process.platform === 'win32' ? 'where.exe' : 'which';
  const result = await ensureHeadroomInstalled({
    dryRun: false,
    probe: { status: 'installed', installedVersion: '0.31.2', pythonVersion: '3.12.2', uvAvailable: true, pipxAvailable: false },
    runImpl: async () => { throw new Error('installer should not run for existing Headroom'); },
    captureImpl: (command, args) => ({
      status: 0,
      stdout: command === resolverCommand ? executable : args[0] === '--version' ? 'headroom 0.31.2' : '',
      stderr: '',
    }),
  });
  assert.equal(result.status, 'installed');
  assert.equal(result.version, '0.31.2');
  assert.equal(result.executable, executable);
  assert.deepEqual(result.smoke.map((item) => item.args), [
    ['--version'], ['--help'], ['wrap', '--help'], ['mcp', 'serve', '--help'],
  ]);
});
