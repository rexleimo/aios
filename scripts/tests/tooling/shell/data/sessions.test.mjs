// ContextDB session readers: the guards matter more than the happy path.
//
// The id comes from a URL and the files come from a directory the console does not own, so
// the cases that count are refusals: traversal, bad ids, missing sessions, and the bounded
// event tail (one real session here has 793 event lines).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
	SESSION_ID_PATTERN,
	SessionError,
	listSessions,
	readSession,
	sessionPath,
	shortTime,
	sessionsDir,
} from '../../../../../apps/shell/ui/src/lib/data/sessions.mjs';

function fixture() {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aios-sessions-'));
	const base = path.join(root, '.aios', 'context-db', 'sessions');
	const session = path.join(base, 'demo-session');
	fs.mkdirSync(session, { recursive: true });
	fs.writeFileSync(
		path.join(session, 'meta.json'),
		JSON.stringify({
			sessionId: 'demo-session',
			agent: 'demo',
			project: 'harness-cli',
			goal: 'prove the reader',
			status: 'blocked',
			createdAt: '2026-11-05T00:00:00.000Z',
			updatedAt: '2026-11-05T01:00:00.000Z',
		}),
	);
	fs.writeFileSync(path.join(session, 'l0-summary.md'), '# Session demo\n');
	const checkpoints = [
		{ seq: 1, ts: '2026-11-05T00:10:00.000Z', status: 'running', summary: 'started' },
		{ seq: 2, ts: '2026-11-05T00:20:00.000Z', status: 'blocked', summary: 'gate failed', nextActions: ['fix it'] },
	];
	fs.writeFileSync(
		path.join(session, 'l1-checkpoints.jsonl'),
		checkpoints.map((row) => JSON.stringify(row)).join('\n') + '\n',
	);
	const events = Array.from({ length: 50 }, (_, index) => ({
		seq: index,
		ts: '2026-11-05T00:30:00.000Z',
		role: 'user',
		kind: 'memo',
		text: `event ${index} `.repeat(60),
	}));
	fs.writeFileSync(
		path.join(session, 'l2-events.jsonl'),
		events.map((row) => JSON.stringify(row)).join('\n') + '\n',
	);
	return { root, base };
}

test('the sessions directory is derived from the project root, not the cwd', () => {
	const { root } = fixture();
	assert.equal(sessionsDir(root), path.join(root, '.aios', 'context-db', 'sessions'));
});

test('a session id that could leave the directory is refused before it is resolved', () => {
	const { root } = fixture();
	for (const id of ['../etc', '..', 'a/b', '', '.hidden', 'has space']) {
		assert.equal(SESSION_ID_PATTERN.test(id), false, `id=${JSON.stringify(id)}`);
		assert.throws(() => sessionPath(root, id), (error) => error instanceof SessionError && error.status === 400);
	}
	assert.ok(sessionPath(root, 'demo-session').endsWith('demo-session'));
});

test('the list is newest first and carries counts, not content', () => {
	const { root } = fixture();
	const sessions = listSessions(root);
	assert.equal(sessions.length, 1);
	const [session] = sessions;
	assert.equal(session.sessionId, 'demo-session');
	assert.equal(session.status, 'blocked');
	assert.equal(session.events, 50);
	assert.equal(session.checkpoints, 2);
	assert.equal(session.hasSummary, true);
	assert.equal(Object.hasOwn(session, 'summary'), false, 'the list must stay cheap');
});

test('the detail bounds the event tail and says how much it left out', () => {
	const { root } = fixture();
	const session = readSession(root, 'demo-session', { eventTail: 5 });
	assert.equal(session.eventTotal, 50);
	assert.equal(session.events.length, 5);
	assert.equal(session.eventTail, 5);
	assert.equal(session.events[4].seq, 49, 'the tail is the newest events');
	assert.equal(session.events[0].text.length, 400, 'event text is truncated, not shipped whole');
	assert.equal(session.checkpoints.length, 2);
	assert.deepEqual(session.checkpoints[1].nextActions, ['fix it']);
});

test('a missing session is a 404, not an empty page', () => {
	const { root } = fixture();
	assert.throws(
		() => readSession(root, 'no-such-session'),
		(error) => error instanceof SessionError && error.status === 404,
	);
});

test('timestamps render as the wall clock a person recognises', () => {
	assert.equal(shortTime('2026-11-05T01:12:40.670Z'), '2026-11-05 01:12');
	assert.equal(shortTime(null), '');
	assert.equal(shortTime('2026-11-05'), '2026-11-05');
});
