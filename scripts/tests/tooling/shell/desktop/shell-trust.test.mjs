// The local trust boundary, asserted as a table.
//
// These cases are the whole contract of `apps/shell/ui/src/lib/trust.mjs`: the gate in
// `proxy.ts` only translates a decision into HTTP, so a case that is right here is
// right on the wire — and a case that is wrong here cannot be rescued by the server.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { bootstrapUrl, decide, isSelfOrigin, parseOrigin } from '../../../../../apps/shell/ui/src/lib/trust.mjs';
import {
	bootstrapUiUrl,
	childEnvironment,
	createToken,
	publishToken,
	tokenPath,
} from '../../../../../scripts/aios-ui.mjs';

const TOKEN = 'a'.repeat(32);
const PORT = 3126;

function ask(overrides = {}) {
	return decide(
		{
			pathname: '/',
			cookie: null,
			origin: null,
			secFetchSite: null,
			...overrides,
		},
		{ token: TOKEN, port: PORT },
	);
}

test('an undeclared token denies instead of serving the page ungated', () => {
	const decision = decide({ pathname: '/' }, { token: '', port: PORT });
	assert.equal(decision.action, 'deny');
	assert.equal(decision.reason, 'no-token-configured');
});

test('a cross-site request is denied even with the right cookie', () => {
	const decision = ask({ cookie: TOKEN, secFetchSite: 'cross-site' });
	assert.deepEqual(decision, { action: 'deny', reason: 'cross-site' });
});

test('a foreign origin is denied even with the right cookie', () => {
	// 实测风险：浏览器把同一主机的不同端口算作 same-site，所以 SameSite 单独不够。
	for (const origin of [
		`http://127.0.0.1:${PORT + 1}`,
		'http://localhost:8080',
		'http://evil.example',
		'null',
	]) {
		const decision = ask({ cookie: TOKEN, origin });
		assert.equal(decision.action, 'deny', `origin=${origin}`);
		assert.equal(decision.reason, 'foreign-origin');
	}
});

test('the token exchange is the only path that mints a cookie', () => {
	assert.deepEqual(ask({ pathname: `/t/${TOKEN}/` }), {
		action: 'bootstrap',
		reason: 'token-exchange',
	});
	assert.deepEqual(ask({ pathname: `/t/${TOKEN}` }), {
		action: 'bootstrap',
		reason: 'token-exchange',
	});
	for (const pathname of [
		'/',
		'/t/',
		'/t/wrong/',
		`/t/${TOKEN}/extra`,
		`/t/${TOKEN}x/`,
	]) {
		const decision = ask({ pathname });
		assert.equal(decision.action, 'deny', `pathname=${pathname}`);
		assert.equal(decision.reason, 'missing-token', `pathname=${pathname}`);
	}
});

test('a same-origin request with the cookie is the only allow', () => {
	assert.deepEqual(ask({ cookie: TOKEN, origin: `http://127.0.0.1:${PORT}`, secFetchSite: 'same-origin' }), {
		action: 'allow',
		reason: 'cookie',
	});
	assert.equal(ask({ cookie: 'other', origin: `http://127.0.0.1:${PORT}` }).action, 'deny');
});

test('origin parsing treats a missing port as the scheme default', () => {
	assert.deepEqual(parseOrigin('http://example.com'), { host: 'example.com', port: 80 });
	assert.deepEqual(parseOrigin('https://example.com'), { host: 'example.com', port: 443 });
	assert.equal(parseOrigin('not a url'), null);
	assert.equal(isSelfOrigin('http://127.0.0.1:3126', 3126), true);
	assert.equal(isSelfOrigin('http://[::1]:3126', 3126), true);
	assert.equal(isSelfOrigin('http://127.0.0.1:3127', 3126), false);
});

test('the launcher mints 128 bits and publishes them where the shell looks', () => {
	const token = createToken();
	assert.match(token, /^[0-9a-f]{32}$/u);

	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aios-shell-trust-'));
	try {
		const published = publishToken({ port: PORT, token, tmpDir: tmp });
		assert.equal(published, tokenPath(PORT, tmp));
		assert.equal(fs.readFileSync(published, 'utf8'), token);
		assert.equal(path.basename(published), `aios-ui-token-${PORT}`);
	} finally {
		fs.rmSync(tmp, { recursive: true, force: true });
	}
});

test('the child is told the port and the token, and nothing else is derived', () => {
	const env = childEnvironment({ port: 3210, token: 'abc', env: { PATH: '/bin' } });
	assert.deepEqual(env, { PATH: '/bin', AIOS_UI_PORT: '3210', AIOS_UI_TOKEN: 'abc' });
	assert.equal(bootstrapUiUrl(3210, 'abc'), bootstrapUrl(3210, 'abc'));
});
