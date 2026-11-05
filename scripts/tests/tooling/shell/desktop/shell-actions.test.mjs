// The action allowlist is the panel's whole executable surface, so it gets the same
// treatment as the trust gate: a table of cases, not a reading of the source.
//
// The assertions are about safety properties that must survive future edits, not about
// today's copy: every id is known, mutating things must be marked as such and carry a
// preview, argv never contains a shell metacharacter, and a missing input refuses
// instead of falling back to some default command.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
	ACTIONS,
	buildActionArgv,
	clientActionIds,
	listActionIds,
	requiresConfirmation,
	sseFrame,
} from '../../../../../apps/shell/ui/src/lib/actions.mjs';

const CLI = '/repo/scripts/aios.mjs';

test('the action ids are a closed set', () => {
	// A new id is a new capability; it should not be able to appear by accident.
	assert.deepEqual(listActionIds(), [
		'status.refresh',
		'skill.health',
		'doctor.run',
		'client.setup.preview',
		'client.setup.apply',
	]);
});

test('mutating actions are marked, confirmed, and paired with a preview', () => {
	for (const id of listActionIds()) {
		const spec = ACTIONS[id];
		assert.ok(['read-only', 'mutating'].includes(spec.kind), `${id} kind`);
		assert.equal(typeof spec.label, 'string');
		assert.ok(spec.label.length > 0, `${id} needs a label a button can show`);
		assert.equal(typeof spec.detail, 'string');

		if (spec.kind === 'mutating') {
			assert.equal(requiresConfirmation(id), true, `${id} writes and must be confirmed`);
			assert.ok(
				listActionIds().includes(`${id.split('.').slice(0, -1).join('.')}.preview`) ||
					listActionIds().some((other) => other.endsWith('.preview') && ACTIONS[other].needsClient === spec.needsClient),
				`${id} must have a dry-run counterpart`,
			);
		} else {
			assert.equal(requiresConfirmation(id), false, `${id} writes nothing`);
		}
	}
});

test('an argv is always the CLI plus fixed words, never a shell fragment', () => {
	for (const id of listActionIds()) {
		const argv = buildActionArgv(id, { cli: CLI, client: 'codex' });
		assert.ok(Array.isArray(argv), `${id} must build an argv`);
		assert.equal(argv[0], CLI, `${id} must start from the CLI path`);
		for (const part of argv) {
			assert.equal(typeof part, 'string');
			assert.ok(part.length > 0);
			assert.equal(
				/[;&|`$<>(){}[\]*?!~]/.test(part),
				false,
				`${id} contains a shell metacharacter: ${part}`,
			);
		}
	}
});

test('a client-scoped action refuses without a client, and never invents one', () => {
	for (const id of clientActionIds()) {
		assert.equal(buildActionArgv(id, { cli: CLI }), null, `${id} without a client must refuse`);
		assert.equal(buildActionArgv(id, { cli: CLI, client: '' }), null, `${id} blank client`);
		const argv = buildActionArgv(id, { cli: CLI, client: 'codex' });
		assert.ok(argv.includes('codex'), `${id} must pass the client through`);
	}
	assert.deepEqual(clientActionIds(), ['client.setup.preview', 'client.setup.apply']);
});

test('an unknown id or a missing CLI builds nothing', () => {
	assert.equal(buildActionArgv('status.nuke', { cli: CLI }), null);
	assert.equal(buildActionArgv('status.refresh', {}), null);
	assert.equal(buildActionArgv('status.refresh', { cli: '' }), null);
});

test('a preview writes nothing and the apply writes', () => {
	const preview = buildActionArgv('client.setup.preview', { cli: CLI, client: 'gemini' });
	const apply = buildActionArgv('client.setup.apply', { cli: CLI, client: 'gemini' });
	assert.ok(preview.includes('--dry-run'), 'the preview must be a dry run by construction');
	assert.equal(apply.includes('--dry-run'), false);
	assert.ok(apply.includes('--yes'), 'the apply cannot wait for a prompt no one can answer');
});

test('sse frames are one event with one JSON payload', () => {
	const frame = sseFrame('stdout', { chunk: 'line with "quotes" and \\ backslash' });
	assert.ok(frame.startsWith('event: stdout\n'));
	assert.ok(frame.endsWith('\n\n'));
	const data = frame.slice(frame.indexOf('data: ') + 'data: '.length).trim();
	assert.deepEqual(JSON.parse(data), { chunk: 'line with "quotes" and \\ backslash' });
});
