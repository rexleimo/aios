import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { parseArgs } from '../lib/cli/parse-args.mjs';
import { ALL_CLIENTS } from '../lib/clients/core/definitions.mjs';
import { buildClientCapabilityReport } from '../lib/clients/capability-report.mjs';

const CLI = 'scripts/aios.mjs';

function byId(report, clientId) {
  return report.clients.find((client) => client.clientId === clientId);
}

test('client capability report covers all registered clients and blocks pending-smoke live surfaces', async () => {
  const report = await buildClientCapabilityReport({ rootDir: process.cwd(), env: {} });
  assert.equal(report.schemaVersion, 1);
  assert.deepEqual(report.clients.map((client) => client.clientId), ALL_CLIENTS);

  assert.equal(byId(report, 'codex').status, 'supported-candidate');
  assert.equal(byId(report, 'claude').status, 'supported-candidate');
  assert.equal(byId(report, 'opencode').status, 'supported-candidate');
  assert.equal(byId(report, 'gemini').status, 'compatibility');

  for (const clientId of ['antigravity', 'crush']) {
    const client = byId(report, clientId);
    assert.equal(client.status, 'pending-smoke');
    assert.equal(client.staticProjectionAllowed, true);
    assert.equal(client.liveExecutionAllowed, false);
    assert.equal(client.skillTrainingAllowed, false);
    assert.equal(client.qualityGateRunnerAllowed, false);
    assert.equal(client.harnessLiveAllowed, false);
    assert.ok(client.reasons.some((reason) => /smoke|verified|one-shot/i.test(reason)), `${clientId} should explain pending smoke`);
  }
});

test('clients doctor command parses doctor subcommand and json flag', () => {
  const parsed = parseArgs(['clients', 'doctor', '--json']);
  assert.equal(parsed.command, 'clients');
  assert.equal(parsed.options.subcommand, 'doctor');
  assert.equal(parsed.options.json, true);
});

test('aios clients doctor --json emits strict rollout status for six clients', () => {
  const result = spawnSync(process.execPath, [CLI, 'clients', 'doctor', '--json'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { ...process.env, AIOS_NO_COLOR: '1' },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.deepEqual(report.clients.map((client) => client.clientId), ALL_CLIENTS);
  assert.equal(byId(report, 'antigravity').status, 'pending-smoke');
  assert.equal(byId(report, 'crush').liveExecutionAllowed, false);
});
