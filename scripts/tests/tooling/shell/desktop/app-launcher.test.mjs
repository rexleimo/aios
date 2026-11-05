// `npm run app` — the one command that must actually open a window.
//
// The complaint that produced it is worth keeping as the test's subject: `npm run ui`
// serves a browser page, `npm run shell:dev` compiles Rust for minutes, and neither is
// "start the desktop app", so the person trying it concludes it is broken. These cases
// pin the launcher's three decisions (reuse or start a server, which binary, compile or
// not) without starting anything real; the window itself is verified by hand.
import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import {
	missingUiDependencies,
	resolveShellBinary,
	runApp,
	serverCommand,
} from '../../../../../scripts/aios-app.mjs';
import { resolveUiMode } from '../../../../../scripts/aios-ui.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..', '..', '..', '..');
const UI_DIR = path.join(ROOT, 'apps', 'shell', 'ui');

/** A pathless `exists` so the tests do not depend on what is on disk right now. */
function existsFor(...suffixes) {
	const wanted = suffixes.map((entry) => entry.replace(/\\/g, '/'));
	return (candidate) => {
		const normalised = String(candidate).replace(/\\/g, '/');
		return wanted.some((suffix) => normalised.endsWith(suffix));
	};
}

function fakeChild(pid = 4242) {
	return { pid, kill() {}, on() {} };
}

test('auto resolves to the production build when one exists, otherwise to dev', () => {
	assert.equal(resolveUiMode({ mode: 'auto', uiDir: UI_DIR, existsImpl: existsFor('.next/BUILD_ID') }), 'start');
	assert.equal(resolveUiMode({ mode: 'auto', uiDir: UI_DIR, existsImpl: () => false }), 'dev');
	assert.equal(resolveUiMode({ mode: 'build', uiDir: UI_DIR, existsImpl: () => false }), 'build');
});

test('the shell binary prefers release, then debug, then says a build is needed', () => {
	const release = resolveShellBinary({
		rootDir: ROOT,
		platform: 'win32',
		existsImpl: existsFor('target/release/aios-shell.exe'),
	});
	assert.equal(release.profile, 'release');
	assert.equal(release.needsBuild, false);

	const debug = resolveShellBinary({ rootDir: ROOT, platform: 'win32', existsImpl: () => false });
	assert.equal(debug.profile, 'debug');
	assert.equal(
		debug.needsBuild,
		true,
		'with no binary the launcher compiles once instead of failing',
	);
});

test('the server it may start is the same launcher, in auto mode, on the declared port', () => {
	const plan = serverCommand({ rootDir: ROOT, port: 3400, execPath: 'node' });
	assert.deepEqual(plan.args, [path.join(ROOT, 'scripts', 'aios-ui.mjs'), 'auto', '--port', '3400']);
	assert.equal(plan.port, 3400);
});

test('without interface dependencies it names the command and starts nothing', async () => {
	let started = 0;
	const result = await runApp({
		rootDir: ROOT,
		existsImpl: () => false,
		spawnImpl: () => {
			started += 1;
			return fakeChild();
		},
		spawnSyncImpl: () => ({ status: 0 }),
		log: { write() {} },
	});
	assert.equal(result.ok, false);
	assert.equal(result.exitCode, 1);
	assert.equal(started, 0);
	assert.deepEqual(missingUiDependencies({ rootDir: ROOT, existsImpl: () => false }).missing.length, 2);
});

test('a server already answering is reused, and nothing is stopped afterwards', async () => {
	const calls = [];
	const result = await runApp({
		rootDir: ROOT,
		existsImpl: existsFor('node_modules', 'node_modules/next/dist/bin/next', 'target/release/aios-shell.exe'),
		answeringImpl: async () => true,
		spawnImpl: (...args) => {
			calls.push(['spawn', ...args]);
			return fakeChild();
		},
		spawnSyncImpl: (command) => {
			calls.push(['sync', command]);
			return { status: 0 };
		},
		stopImpl: () => calls.push(['stop']),
		log: { write() {} },
	});
	assert.equal(result.ok, true);
	assert.equal(result.startedServer, false);
	assert.equal(calls.filter(([kind]) => kind === 'spawn').length, 0, 'must not start a second server');
	assert.equal(calls.filter(([kind]) => kind === 'stop').length, 0, 'must not stop a server it did not start');
	// Exactly one synchronous call: the shell itself.
	assert.equal(calls.filter(([kind]) => kind === 'sync').length, 1);
});

test('a silent port is started, waited for, and stopped when the window closes', async () => {
	const calls = [];
	const answers = [false, true];
	const result = await runApp({
		rootDir: ROOT,
		// The published token file is part of the readiness condition, so the stub must
		// claim it exists — otherwise the wait runs to its 3-minute timeout, which is
		// exactly how the first version of this test hung.
		existsImpl: existsFor(
			'node_modules',
			'node_modules/next/dist/bin/next',
			'target/release/aios-shell.exe',
			'unused-token',
		),
		// The wait loop asks twice: before starting (silent) and after (answering).
		answeringImpl: async () => (answers.length > 1 ? answers.shift() : true),
		spawnImpl: (...args) => {
			calls.push(['spawn', ...args]);
			return fakeChild();
		},
		spawnSyncImpl: (command) => {
			calls.push(['sync', command]);
			return { status: 0 };
		},
		stopImpl: (child) => calls.push(['stop', child.pid]),
		tokenPathImpl: () => path.join(ROOT, 'temp', 'unused-token'),
		log: { write() {} },
	});
	assert.equal(result.startedServer, true);
	const spawns = calls.filter(([kind]) => kind === 'spawn');
	assert.equal(spawns.length, 1);
	assert.deepEqual(spawns[0][2], [
		path.join(ROOT, 'scripts', 'aios-ui.mjs'),
		'auto',
		'--port',
		'3126',
	]);
	assert.deepEqual(
		calls.filter(([kind]) => kind === 'stop'),
		[['stop', 4242]],
		'the server this launcher started is the only one it stops',
	);
});
