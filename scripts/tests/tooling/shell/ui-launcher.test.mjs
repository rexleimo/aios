import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
	NEXT_BIN_REL_PATH,
	UI_DEFAULT_PORT,
	UI_MODES,
	buildUiCommand,
	missingUiDependencies,
	parseUiArgv,
	resolveRepoRoot,
	resolveUiPort,
	runUi,
} from '../../../../scripts/aios-ui.mjs';

const FAKE_ROOT = path.resolve('/tmp', 'fake-repo');
const FAKE_UI = path.join(FAKE_ROOT, 'apps', 'shell', 'ui');

test('the ui modes are a closed set and an unknown mode is a usage error', () => {
	assert.deepEqual([...UI_MODES], ['dev', 'build', 'start']);
	assert.throws(() => buildUiCommand({ mode: 'serve', uiDir: FAKE_UI }), (error) => {
		assert.equal(error.usage, true);
		assert.match(error.message, /unknown ui mode/);
		return true;
	});
});

test('next is spawned as a JS entry, never as the bare "npm" command', () => {
	// 实测：Windows 上 spawnSync('npm', …) 直接 ENOENT（npm 是 npm.cmd）。
	const dev = buildUiCommand({ mode: 'dev', port: String(UI_DEFAULT_PORT), uiDir: FAKE_UI });
	assert.equal(dev.command.includes('npm'), false);
	assert.equal(dev.command, process.execPath);
	assert.equal(dev.args[0], path.join(FAKE_UI, NEXT_BIN_REL_PATH));
	assert.deepEqual(dev.args.slice(1), ['dev', '-p', String(UI_DEFAULT_PORT)]);
});

test('build carries no port; dev and start carry exactly one -p', () => {
	const built = buildUiCommand({ mode: 'build', uiDir: FAKE_UI });
	assert.deepEqual(built.args.slice(1), ['build']);
	assert.equal(built.port, UI_DEFAULT_PORT, 'the plan still resolves a port, but build does not pass it');

	const start = buildUiCommand({ mode: 'start', port: '3210', uiDir: FAKE_UI });
	assert.deepEqual(start.args.slice(1), ['start', '-p', '3210']);
});

test('an invalid or absent port falls back to the default instead of reaching next', () => {
	const saved = process.env.AIOS_UI_PORT;
	delete process.env.AIOS_UI_PORT;
	try {
		for (const port of [undefined, '', 'abc', '0', '-1', '70000', '3.5']) {
			assert.equal(resolveUiPort(port), UI_DEFAULT_PORT, `port=${port}`);
		}
		assert.equal(resolveUiPort('3210'), 3210);
		process.env.AIOS_UI_PORT = '3300';
		assert.equal(resolveUiPort(undefined), 3300);
		assert.equal(resolveUiPort('3400'), 3400, 'an explicit argument beats the env var');
	} finally {
		if (saved === undefined) delete process.env.AIOS_UI_PORT;
		else process.env.AIOS_UI_PORT = saved;
	}
});

test('a missing install names itself and does not spawn next', () => {
	const calls = [];
	const result = runUi({
		mode: 'dev',
		rootDir: FAKE_ROOT,
		spawnImpl: () => {
			calls.push('spawned');
			return { status: 0 };
		},
	});
	assert.equal(result.ok, false);
	assert.equal(result.exitCode, 1);
	assert.equal(result.plan, null);
	assert.deepEqual(calls, [], 'must not start next when dependencies are absent');
});

test('missingUiDependencies reports exactly the install and the next entry', () => {
	const absent = missingUiDependencies({ rootDir: FAKE_ROOT, existsImpl: () => false });
	assert.equal(absent.missing.length, 2);
	assert.match(absent.missing[0].replace(/\\/g, '/'), /apps\/shell\/ui\/node_modules$/u);
	assert.match(absent.missing[1].replace(/\\/g, '/'), /node_modules\/next\/dist\/bin\/next$/u);
	assert.deepEqual(missingUiDependencies({ rootDir: FAKE_ROOT, existsImpl: () => true }).missing, []);
});

test('argv parsing takes mode, --port and --root, and refuses unknown or valueless options', () => {
	assert.deepEqual(parseUiArgv([]), { mode: 'dev' });
	assert.equal(parseUiArgv(['build']).mode, 'build');
	assert.equal(parseUiArgv(['dev', '--port', '3300']).port, '3300');
	assert.equal(parseUiArgv(['--port', '3300']).mode, 'dev', 'a leading option keeps the default mode');
	const resolved = parseUiArgv(['start', '--root', FAKE_ROOT]);
	assert.equal(resolved.rootDir, FAKE_ROOT);
	for (const argv of [['dev', '--turbo'], ['dev', '--port'], ['dev', '--port', '--root']]) {
		assert.throws(() => parseUiArgv(argv), (error) => error.usage === true, argv.join(' '));
	}
});

test('the real repo root resolves to the directory holding apps/shell/ui', () => {
	const root = resolveRepoRoot();
	const probe = missingUiDependencies({ rootDir: root, existsImpl: () => true });
	assert.match(probe.uiDir.replace(/\\/g, '/'), /apps\/shell\/ui$/u);
	assert.equal(path.basename(root), 'harness-cli');
});