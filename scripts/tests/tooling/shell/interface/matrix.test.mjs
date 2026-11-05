import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  EVIDENCE_FLAG_PRIORITY,
  evidenceFor,
  buildMatrix,
  buildRow,
  MATRIX_SCHEMA_VERSION,
} from '../../../../../apps/shell/data/matrix.mjs';
import { CAPABILITY_AXES } from '../../../../client-capability-scorecard.mjs';

const configPath = new URL('../../../../../config/host-capabilities.json', import.meta.url);
const capabilities = JSON.parse(readFileSync(configPath, 'utf8'));
const declaredClients = Object.keys(capabilities.clients);

test('matrix rows mirror the capability config, with no client list hardcoded', () => {
  const matrix = buildMatrix({ capabilities });
  assert.equal(matrix.rows.length, declaredClients.length);
  assert.deepEqual(matrix.rows.map((row) => row.clientId), declaredClients);
  assert.equal(matrix.schemaVersion, MATRIX_SCHEMA_VERSION);
});

test('axis vocabulary comes from the scorecard owner, not from a second copy', () => {
  const matrix = buildMatrix({ capabilities });
  assert.deepEqual(matrix.axes, [...CAPABILITY_AXES]);
  for (const row of matrix.rows) {
    assert.equal(row.axisTotal, CAPABILITY_AXES.length);
    assert.deepEqual(row.axes.map((cell) => cell.axis), [...CAPABILITY_AXES]);
  }
});

test('declaredCount is the intersection of config capabilities and the axis vocabulary', () => {
  for (const clientId of declaredClients) {
    const declared = capabilities.clients[clientId].capabilities ?? [];
    const expected = declared.filter((axis) => CAPABILITY_AXES.includes(axis)).length;
    const row = buildRow(clientId, capabilities.clients[clientId], {});
    assert.equal(row.declaredCount, expected, clientId);
  }
});

test('row level, limits and evidenceRef are copied verbatim from the config', () => {
  const withEvidence = declaredClients.find(
    (clientId) => capabilities.clients[clientId]?.subagents?.evidenceRef,
  );
  assert.ok(withEvidence, 'fixture must contain at least one client with evidenceRef');
  const entry = capabilities.clients[withEvidence];
  const row = buildRow(withEvidence, entry, {});
  assert.equal(row.level, entry.targetLevel);
  assert.deepEqual(row.limits, entry.limits ?? []);
  assert.equal(row.evidenceRef, entry.subagents.evidenceRef);
});

test('a client absent from the status summary is not-covered, never ok', () => {
  const status = { clientCapabilities: { totalClients: 0, pendingSmokeClientIds: [], evidenceBlockedClientIds: [], compatibilityClientIds: [] } };
  for (const clientId of declaredClients) {
    const evidence = evidenceFor(clientId, status);
    assert.equal(evidence.covered, false);
    assert.equal(evidence.label, 'not-covered');
  }
});

test('evidence flags keep their specificity order when a client matches several lists', () => {
  const clientId = declaredClients[0];
  const status = {
    clientCapabilities: {
      pendingSmokeClientIds: [clientId],
      compatibilityClientIds: [clientId],
      evidenceBlockedClientIds: [clientId],
    },
  };
  const evidence = evidenceFor(clientId, status);
  assert.equal(evidence.covered, true);
  assert.equal(evidence.flags.length, 3);
  assert.equal(evidence.label, EVIDENCE_FLAG_PRIORITY[0]);
});

test('coverage is set algebra: declared = evidenceCovered + declaredOnly', () => {
  const status = {
    clientCapabilities: {
      pendingSmokeClientIds: [],
      compatibilityClientIds: [declaredClients[0]],
      evidenceBlockedClientIds: [declaredClients[0], declaredClients[1]],
    },
  };
  const matrix = buildMatrix({ capabilities, status });
  assert.equal(
    matrix.coverage.declared,
    matrix.coverage.evidenceCovered + matrix.coverage.declaredOnly.length,
  );
  assert.deepEqual(matrix.coverage.declaredOnly, declaredClients.slice(2));
});

test('blockers are passed through verbatim', () => {
  const blockers = ['first blocker statement', 'second blocker statement'];
  const matrix = buildMatrix({ capabilities, status: { blockers } });
  assert.deepEqual(matrix.blockers, blockers);
});