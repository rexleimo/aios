// The config editor's pure half: what may be written, and what an edit is allowed to touch.
//
// The file this edits is the declaration the whole matrix is built from, so the tests are
// about refusals and preservation, not about happy paths:
//   - a bad level, an unknown axis, a non-array limits field must be errors with a path;
//   - an edit must leave every field the form does not show exactly as it was;
//   - an edit for a client that does not exist must refuse, not vanish.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';

import { CAPABILITY_AXES } from '../../../../client-capability-scorecard.mjs';

import {
	ConfigError,
	applyEdits,
	diffEditable,
	parseDocument,
	toEditable,
	validateDocument,
} from '../../../../../apps/shell/ui/src/lib/data/host-capabilities.mjs';

const AXES = ['sessionStartInjection', 'mcpProxy', 'metrics'];

function document() {
	return {
		schemaVersion: 1,
		levels: { L2: 'controlled runtime' },
		clients: {
			codex: {
				targetLevel: 'L2',
				capabilities: ['mcpProxy'],
				limits: ['one limit'],
				requiredEntrypoint: 'aios-managed-runner',
				directHostBypassAllowed: false,
				turnCompression: { preSendRequired: true },
			},
			gemini: {
				targetLevel: 'L1',
				capabilities: [],
				limits: [],
			},
		},
	};
}

test('a well-formed document passes and is returned', () => {
	const doc = document();
	assert.equal(validateDocument(doc, { axes: AXES }), doc);
});

test('structural problems are refused with the path that is wrong', () => {
	const cases = [
		[{ ...document(), schemaVersion: '1' }, 'schemaVersion'],
		[{ ...document(), clients: [] }, 'clients'],
		[{ ...document(), clients: { codex: { targetLevel: 'L9', capabilities: [], limits: [] } } }, 'clients.codex.targetLevel'],
		[{ ...document(), clients: { codex: { targetLevel: 'L2', capabilities: 'mcpProxy', limits: [] } } }, 'clients.codex.capabilities'],
		[{ ...document(), clients: { codex: { targetLevel: 'L2', capabilities: [], limits: 'none' } } }, 'clients.codex.limits'],
		[{ ...document(), clients: { codex: { targetLevel: 'L2', capabilities: ['mcpProxy', 'mcpProxy'], limits: [] } } }, 'clients.codex.capabilities'],
	];
	for (const [doc, path] of cases) {
		assert.throws(
			() => validateDocument(doc, { axes: AXES }),
			(error) => error instanceof ConfigError && error.path === path,
			`expected a ConfigError at ${path}`,
		);
	}
});

test('an axis outside the vocabulary is refused, but only when a vocabulary is given', () => {
	const doc = { ...document(), clients: { codex: { targetLevel: 'L2', capabilities: ['notAnAxis'], limits: [] } } };
	assert.throws(
		() => validateDocument(doc, { axes: AXES }),
		(error) => error instanceof ConfigError && /unknown capability/.test(error.message),
	);
	// A read-only caller passes no vocabulary; it must not invent a failure.
	assert.doesNotThrow(() => validateDocument(doc));
});

test('an edit changes the three fields it owns and preserves everything else', () => {
	const before = document();
	const after = applyEdits(before, [
		{ clientId: 'codex', targetLevel: 'L3', capabilities: ['mcpProxy', 'metrics'], limits: ['new'] },
	]);
	assert.deepEqual(after.clients.codex, {
		targetLevel: 'L3',
		capabilities: ['mcpProxy', 'metrics'],
		limits: ['new'],
		// 表单不显示这些字段，它们必须原样活下来。
		requiredEntrypoint: 'aios-managed-runner',
		directHostBypassAllowed: false,
		turnCompression: { preSendRequired: true },
	});
	assert.deepEqual(after.clients.gemini, before.clients.gemini, 'untouched clients stay as they were');
	assert.deepEqual(before.clients.codex.capabilities, ['mcpProxy'], 'the input is not mutated');
});

test('an edit for a client that does not exist refuses instead of disappearing', () => {
	assert.throws(
		() => applyEdits(document(), [{ clientId: 'ghost', targetLevel: 'L1', capabilities: [], limits: [] }]),
		(error) => error instanceof ConfigError && /unknown client/.test(error.message),
	);
});

test('the diff names only the clients and fields that changed', () => {
	const before = toEditable(document());
	const after = before.map((client) =>
		client.clientId === 'codex' ? { ...client, targetLevel: 'L3' } : client,
	);
	assert.deepEqual(diffEditable(before, after), [{ clientId: 'codex', fields: ['targetLevel'] }]);
	assert.deepEqual(diffEditable(before, before), [], 'no edit, no diff');
});

test('limits are compared by content, so reordering is a change and reformatting is not', () => {
	const before = [{ clientId: 'a', targetLevel: 'L1', capabilities: [], limits: ['one', 'two'] }];
	assert.deepEqual(
		diffEditable(before, [{ ...before[0], limits: ['two', 'one'] }]),
		[{ clientId: 'a', fields: ['limits'] }],
	);
	assert.deepEqual(diffEditable(before, [{ ...before[0], limits: ['one', 'two'] }]), []);
});

test('a document that is not JSON says so instead of throwing a parser error', () => {
	assert.throws(
		() => parseDocument('{nope'),
		(error) => error instanceof ConfigError && /not valid JSON/.test(error.message),
	);
	assert.deepEqual(parseDocument('{"a":1}'), { a: 1 });
});
test('the axis vocabulary the write path validates against is the owner module, read through one entry', () => {
	// 保存时会拒掉不认识的轴名，所以「路由校验用的词表」必须等于 owner 的导出。
	// 这条断言的两端分别是：进程入口（路由 spawn 的那个）与 owner 模块本身。
	const root = path.resolve(import.meta.dirname, '..', '..', '..', '..', '..');
	const printed = execFileSync(process.execPath, [path.join(root, 'apps', 'shell', 'data', 'axes.mjs')], {
		encoding: 'utf8',
	});
	assert.deepEqual(JSON.parse(printed), [...CAPABILITY_AXES]);
});
