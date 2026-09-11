import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  ensurePiExtensionRegistered,
  resolveBundledPiExtensionPath,
  resolvePiSettingsPath,
} from '../lib/components/pi/extension-settings.mjs';

async function makeTemp(prefix) {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

test('pi extension registration creates settings with the entry', async () => {
  const home = await makeTemp('aios-pi-ext-home-');
  try {
    const settingsPath = resolvePiSettingsPath(home);
    assert.equal(settingsPath, path.join(home, 'settings.json'));
    const result = ensurePiExtensionRegistered({ settingsPath, extensionPath: '/aios/packages/aios-pi/extensions/aios.ts' });
    assert.equal(result.action, 'added');
    const saved = JSON.parse(await readFile(settingsPath, 'utf8'));
    assert.deepEqual(saved.extensions, ['/aios/packages/aios-pi/extensions/aios.ts']);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test('pi extension registration is idempotent and preserves other keys', async () => {
  const home = await makeTemp('aios-pi-ext-idem-');
  try {
    const settingsPath = resolvePiSettingsPath(home);
    const first = ensurePiExtensionRegistered({
      settingsPath,
      extensionPath: '/aios/packages/aios-pi/extensions/aios.ts',
    });
    assert.equal(first.action, 'added');
    // Simulate a user key written by Pi itself.
    const { writeFile } = await import('node:fs/promises');
    const saved = JSON.parse(await readFile(settingsPath, 'utf8'));
    await writeFile(settingsPath, JSON.stringify({ ...saved, theme: 'dark' }, null, 2), 'utf8');
    const second = ensurePiExtensionRegistered({ settingsPath, extensionPath: '/aios/packages/aios-pi/extensions/aios.ts' });
    assert.equal(second.action, 'present');
    const kept = JSON.parse(await readFile(settingsPath, 'utf8'));
    assert.equal(kept.theme, 'dark');
    assert.deepEqual(kept.extensions, ['/aios/packages/aios-pi/extensions/aios.ts']);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test('pi extension registration dry-run previews without writing', async () => {
  const home = await makeTemp('aios-pi-ext-dry-');
  try {
    const settingsPath = resolvePiSettingsPath(home);
    const logs = [];
    const result = ensurePiExtensionRegistered({
      settingsPath,
      extensionPath: '/aios/packages/aios-pi/extensions/aios.ts',
      dryRun: true,
      io: { log: (line) => logs.push(String(line)) },
    });
    assert.equal(result.action, 'would-add');
    assert.ok(logs.some((line) => line.includes('would register Pi extension')));
    await assert.rejects(readFile(settingsPath, 'utf8'), /ENOENT/iu);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test('pi extension registration fails closed on invalid JSON', async () => {
  const home = await makeTemp('aios-pi-ext-bad-');
  try {
    const settingsPath = resolvePiSettingsPath(home);
    const { mkdir, writeFile } = await import('node:fs/promises');
    await mkdir(path.dirname(settingsPath), { recursive: true });
    await writeFile(settingsPath, '{not json', 'utf8');
    assert.throws(
      () => ensurePiExtensionRegistered({ settingsPath, extensionPath: '/x/aios.ts' }),
      /refusing to clobber/iu,
    );
    assert.throws(
      () => ensurePiExtensionRegistered({ settingsPath: '', extensionPath: '' }),
      /requires settingsPath and extensionPath/iu,
    );
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test('bundled pi extension path resolves under the AIOS root', () => {
  const entry = resolveBundledPiExtensionPath('/aios');
  assert.equal(entry, path.join('/aios', 'packages', 'aios-pi', 'extensions', 'aios.ts'));
});
