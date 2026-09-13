import assert from 'node:assert/strict';
import test from 'node:test';

import {
  HOST_PROBE_REGISTRY,
  listProbedHosts,
  probeHost,
} from '../../lib/harness/host-probes.mjs';

function fakeRun(script) {
  return (executable, args) => {
    const entry = script.find((candidate) => candidate.executable === executable);
    if (!entry) return { status: 127, stdout: '', stderr: '', error: new Error(`spawn ${executable} ENOENT`) };
    if (entry.throw) throw entry.throw;
    return { status: entry.status ?? 0, stdout: entry.stdout ?? '', stderr: entry.stderr ?? '', error: null };
  };
}

test('probe registry covers the hosts the harness actually drives', () => {
  assert.deepEqual(listProbedHosts(), ['codex', 'pi']);
  assert.equal(HOST_PROBE_REGISTRY.pi.mode, 'managed-runner');
});

test('probe passes against a real version contract and fails closed on garbage', () => {
  const good = probeHost({
    host: 'codex',
    run: fakeRun([{ executable: 'codex', stdout: 'codex-cli 0.114.2\n' }]),
  });
  assert.equal(good.ok, true);
  assert.equal(good.status, 'ok');
  assert.match(good.detail, /codex-cli 0\.114/u);

  const garbage = probeHost({
    host: 'codex',
    run: fakeRun([{ executable: 'codex', stdout: 'usage: codex [--help]' }]),
  });
  assert.equal(garbage.ok, false);
  assert.equal(garbage.status, 'unsupported');
  assert.match(garbage.detail, /host_unsupported/u);
});

test('probe treats a missing host binary as unsupported and unknown hosts as unprobed', () => {
  const missing = probeHost({
    host: 'pi',
    run: fakeRun([]),
  });
  assert.equal(missing.ok, false);
  assert.equal(missing.status, 'unsupported');

  const unprobed = probeHost({
    host: 'claude',
    run: fakeRun([]),
  });
  assert.equal(unprobed.registered, false);
  assert.equal(unprobed.ok, true);
  assert.equal(unprobed.status, 'unprobed');
});
