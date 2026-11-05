// 记忆页的写路径：解析、id 校验、以及拒绝。
//
// 页面上每个按钮只能提交「动作 id + 事件 id (+ 文本)」，这层把它翻成固定 argv。
// 关键断言是拒绝：非法 id、空文本、未确认的请求都不能变成一次写。
import assert from 'node:assert/strict';
import test from 'node:test';

import {
	MEMORY_ACTIONS,
	buildMemoryArgv,
	isEventId,
	parseMemoEntries,
} from '../../../../../apps/shell/ui/src/lib/data/memory-actions.mjs';

const CLI = '/repo/scripts/aios.mjs';
const ID = 'memo:default:20261105045221184-131ef75c';

test('search output lines are parsed into addressable entries', () => {
	const output = [
		`- [2026-11-05T04:52:21.184Z] (${ID}): 一条事实，带冒号: 还有中文。`,
		'- [2026-11-05T04:53:00.000Z] (not-an-id): 这一行不是事件，应被跳过',
		'pack: 1 entries',
		'',
	].join('\n');
	const entries = parseMemoEntries(output);
	assert.equal(entries.length, 1);
	assert.equal(entries[0].id, ID);
	assert.equal(entries[0].at, '2026-11-05T04:52:21.184Z');
	assert.match(entries[0].text, /一条事实，带冒号/u);
});

test('an event id must look like one before it can address a write', () => {
	assert.equal(isEventId(ID), true);
	for (const bad of ['', 'memo', '../../etc', `${ID}x`, 'memo:default:123-zzzzzzzz']) {
		assert.equal(isEventId(bad), false, bad);
	}
});

test('useful maps to a fixed argv and refuses anything else', () => {
	assert.deepEqual(buildMemoryArgv('memo.useful', { cli: CLI, id: ID }), [
		CLI,
		'memo',
		'useful',
		ID,
	]);
	assert.equal(buildMemoryArgv('memo.useful', { cli: CLI, id: 'nope' }), null);
	assert.equal(buildMemoryArgv('memo.useful', { id: ID }), null, 'no cli, no run');
	assert.equal(buildMemoryArgv('memo.delete', { cli: CLI, id: ID }), null, 'not on the list');
});

test('supersede needs a real replacement fact, and never invents one', () => {
	const argv = buildMemoryArgv('memo.supersede', { cli: CLI, id: ID, text: '  新的结论：这条已经过时了  ' });
	assert.deepEqual(argv, [CLI, 'memo', 'add', '新的结论：这条已经过时了', '--supersedes', ID]);
	assert.equal(buildMemoryArgv('memo.supersede', { cli: CLI, id: ID, text: '太短' }), null);
	assert.equal(buildMemoryArgv('memo.supersede', { cli: CLI, id: ID }), null);
	assert.equal(
		buildMemoryArgv('memo.supersede', { cli: CLI, id: ID, text: 'x'.repeat(2001) }),
		null,
		'an essay is not a replacement fact',
	);
});

test('every listed action is a write, so the route always requires confirmation', () => {
	for (const [id, spec] of Object.entries(MEMORY_ACTIONS)) {
		assert.equal(spec.kind, 'write', id);
		assert.ok(spec.label.length > 0 && spec.detail.length > 0, id);
	}
});
