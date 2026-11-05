import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
	CAPABILITIES_REL_PATH,
	STATUS_KIND,
	collectMatrixInput,
	createStatusCollector,
	parseStatusPayload,
	readCapabilities,
} from '../../../../../apps/shell/data/sources.mjs';
import { loadMatrix } from '../../../../../apps/shell/data/load.mjs';

const rootDir = new URL('../../../../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

test('a status payload of another kind is rejected, not treated as empty evidence', () => {
	assert.equal(parseStatusPayload(''), null);
	assert.equal(parseStatusPayload('not json'), null);
	assert.equal(parseStatusPayload(JSON.stringify({ kind: 'aios.status.v2' })), null);
	const ok = { kind: STATUS_KIND, clientCapabilities: {} };
	assert.deepEqual(parseStatusPayload(JSON.stringify(ok)), ok);
});

test('collectMatrixInput records the origin of every number it hands to the view', () => {
	const status = {
		data: { kind: STATUS_KIND, generatedAt: 'x', blockers: [], clientCapabilities: {} },
		command: 'node scripts/aios.mjs status --json',
		error: null,
	};
	const input = collectMatrixInput({ rootDir, statusCollector: () => status });
	assert.equal(input.sources.length >= 2, true);
	assert.ok(input.sources.some((entry) => entry.origin.includes(CAPABILITIES_REL_PATH)));
	assert.ok(input.sources.some((entry) => entry.origin.includes('status --json')));
	// 来源记录只含出处，不含数值本身：数值由 buildMatrix 现算，两者不可能各自漂移。
	for (const entry of input.sources) {
		assert.equal(typeof entry.field, 'string');
		assert.equal(typeof entry.origin, 'string');
	}
});

test('a failed status collection is recorded as a source, never silently omitted', () => {
	const status = { data: null, command: 'node scripts/aios.mjs status --json', error: 'timeout' };
	const input = collectMatrixInput({ rootDir, statusCollector: () => status });
	const failure = input.sources.find((entry) => entry.origin.includes('timeout'));
	assert.ok(failure, 'the failure itself must be visible as a source');
	assert.match(failure.field, /not-covered/);
});

test('createStatusCollector spawns the real CLI entry and honours the v1 contract', () => {
	const calls = [];
	const spawnImpl = (execPath, args) => {
		calls.push([execPath, args]);
		return { stdout: JSON.stringify({ kind: STATUS_KIND, clientCapabilities: {} }), error: null };
	};
	const collect = createStatusCollector({ rootDir, spawnImpl });
	const result = collect();
	assert.deepEqual(result.data, { kind: STATUS_KIND, clientCapabilities: {} });
	assert.equal(result.error, null);
	assert.match(calls[0][1][0].replace(/\\/g, '/'), /scripts\/aios\.mjs$/u);
	assert.deepEqual(calls[0][1].slice(1), ['status', '--json']);
});

test('readCapabilities returns the live config plus the path it came from', () => {
	const loaded = readCapabilities(rootDir);
	assert.match(loaded.file, /host-capabilities\.json$/);
	assert.equal(typeof loaded.data.clients, 'object');
});

test('loadMatrix wires capabilities and status into a view model with sources attached', () => {
	const status = {
		data: {
			kind: STATUS_KIND,
			generatedAt: '2026-11-04T00:00:00.000Z',
			overallStatus: 'blocked',
			blockers: ['one blocker'],
			clientCapabilities: {
				pendingSmokeClientIds: [],
				compatibilityClientIds: [],
				evidenceBlockedClientIds: [],
			},
		},
		command: 'status',
		error: null,
	};
	const matrix = loadMatrix({ rootDir, statusCollector: () => status });
	assert.equal(matrix.generatedAt, '2026-11-04T00:00:00.000Z');
	assert.deepEqual(matrix.blockers, ['one blocker']);
	assert.ok(matrix.rows.length > 0);
	assert.equal(matrix.coverage.evidenceCovered, 0);
	assert.equal(matrix.sources.length >= 2, true);
});

test('the shipped page contains no hand-written numbers', () => {
	const page = readFileSync(new URL('../../../../../apps/shell/ui/src/components/sections/matrix.tsx', import.meta.url), 'utf8');
	const stripped = page
		.replace(/\/\*[\s\S]*?\*\//g, '')
		.replace(/^\s*\/\/.*$/gm, '')
		.replace(/'(?:[^'\\]|\\.)*'/g, "''")
		.replace(/"(?:[^"\\]|\\.)*"/g, "''")
		.replace(/`(?:[^`\\]|\\.)*`/g, '``')
		// JSX 标签名（<h1>、<h2>）里的数字是元素名，不是渲染值。
		.replace(/<\/?[a-zA-Z][a-zA-Z0-9]*/g, (match) => match.replace(/\d+/g, ''));
	const digits = stripped.match(/\d+(?:\.\d+)?/g) ?? [];
	assert.deepEqual(digits, [], `page.tsx must render only values that come from loadMatrix: ${digits.join(',')}`);
});