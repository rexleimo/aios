import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { doctorPiBridge } from '../lib/components/pi/doctor.mjs';
import { buildAiosPiMcpServers, resolvePiMcpJsonPath } from '../lib/components/pi/mcp-adapter.mjs';

async function withPiHome(prefix, fn) {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  try {
    await fn(home);
  } finally {
    await fs.rm(home, { recursive: true, force: true });
  }
}

function doctorEnv(piHome) {
  return { ...process.env, PI_CODING_AGENT_DIR: piHome };
}

const piOnPath = { commandExistsImpl: () => true };
const noPi = { commandExistsImpl: () => false };
const adapterInstalled = { captureImpl: () => ({ stdout: 'pi-mcp-adapter 2.33.0' }) };
const adapterMissing = { captureImpl: () => ({ stdout: 'something-else 1.0.0' }) };

test('pi bridge doctor skips when neither pi CLI nor mcp.json exists', async () => {
  await withPiHome('aios-pi-doctor-skip-', async (piHome) => {
    const logs = [];
    const result = await doctorPiBridge({
      aiosRoot: '/aios',
      env: doctorEnv(piHome),
      io: { log: (line) => logs.push(line) },
      ...noPi,
    });
    assert.equal(result.skipped, true);
    assert.equal(result.effectiveWarnings, 0);
    assert.equal(result.errors, 0);
  });
});

test('pi bridge doctor reports a healthy bridge with zero warnings', async () => {
  await withPiHome('aios-pi-doctor-ok-', async (piHome) => {
    const mcpJsonPath = resolvePiMcpJsonPath(piHome);
    await fs.mkdir(path.dirname(mcpJsonPath), { recursive: true });
    await fs.writeFile(mcpJsonPath, JSON.stringify({
      mcpServers: buildAiosPiMcpServers({ aiosRoot: '/aios' }),
    }, null, 2), 'utf8');
    const logs = [];
    const result = await doctorPiBridge({
      aiosRoot: '/aios',
      env: doctorEnv(piHome),
      io: { log: (line) => logs.push(line) },
      ...piOnPath,
      ...adapterInstalled,
    });
    assert.equal(result.skipped, false);
    assert.equal(result.errors, 0);
    assert.equal(result.effectiveWarnings, 0);
    assert.equal(result.adapter, 'installed');
    assert.deepEqual(result.managedMissing, []);
  });
});

test('pi bridge doctor flags missing managed servers with a global-CLI repair hint', async () => {
  await withPiHome('aios-pi-doctor-missing-', async (piHome) => {
    const mcpJsonPath = resolvePiMcpJsonPath(piHome);
    await fs.mkdir(path.dirname(mcpJsonPath), { recursive: true });
    await fs.writeFile(mcpJsonPath, JSON.stringify({
      mcpServers: { 'code-review-graph': { command: 'uvx', args: ['code-review-graph', 'serve'], lifecycle: 'lazy' } },
    }, null, 2), 'utf8');
    const logs = [];
    const result = await doctorPiBridge({
      aiosRoot: '/aios',
      env: doctorEnv(piHome),
      io: { log: (line) => logs.push(line) },
      ...piOnPath,
      ...adapterInstalled,
    });
    assert.deepEqual(result.managedMissing.sort(), ['aios-bridge', 'aios-memory']);
    assert.equal(result.effectiveWarnings, 2);
    const hint = logs.join('\n');
    assert.match(hint, /Run: aios init --agent pi/u);
    assert.doesNotMatch(hint, /node scripts/u);
  });
});

test('pi bridge doctor errors on invalid JSON and warns on missing adapter', async () => {
  await withPiHome('aios-pi-doctor-bad-', async (piHome) => {
    const mcpJsonPath = resolvePiMcpJsonPath(piHome);
    await fs.mkdir(path.dirname(mcpJsonPath), { recursive: true });
    await fs.writeFile(mcpJsonPath, '{not json', 'utf8');
    const logs = [];
    const result = await doctorPiBridge({
      aiosRoot: '/aios',
      env: doctorEnv(piHome),
      io: { log: (line) => logs.push(line) },
      ...piOnPath,
      ...adapterInstalled,
    });
    assert.equal(result.errors, 1);
    // All managed servers count as missing on top of the parse error.
    assert.equal(result.effectiveWarnings, 3);
  });
});

test('pi bridge doctor warns when the adapter package is absent', async () => {
  await withPiHome('aios-pi-doctor-adapter-', async (piHome) => {
    const mcpJsonPath = resolvePiMcpJsonPath(piHome);
    await fs.mkdir(path.dirname(mcpJsonPath), { recursive: true });
    await fs.writeFile(mcpJsonPath, JSON.stringify({
      mcpServers: buildAiosPiMcpServers({ aiosRoot: '/aios' }),
    }, null, 2), 'utf8');
    const result = await doctorPiBridge({
      aiosRoot: '/aios',
      env: doctorEnv(piHome),
      io: { log: () => {} },
      ...piOnPath,
      ...adapterMissing,
    });
    assert.equal(result.adapter, 'missing');
    assert.equal(result.effectiveWarnings, 1);
    assert.equal(result.errors, 0);
  });
});
