import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { isBundledRoot, stateDir, stateEnv } from '../../../../../apps/shell/ui/src/lib/data/state-root.mjs';

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aios-state-root-'));
  const home = path.join(root, 'home');
  const bundled = path.join(root, 'installed');
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(bundled, { recursive: true });
  fs.writeFileSync(path.join(bundled, 'bundle-manifest.json'), '{}\n');
  return { root, home, bundled };
}

test('a source checkout keeps state inside its own root', () => {
  const { root, home, bundled } = fixture();
  const env = { USERPROFILE: home };
  assert.equal(isBundledRoot(root), false);
  assert.equal(isBundledRoot(bundled), true);
  assert.equal(stateDir(root, env), path.join(root, '.aios'));
  assert.deepEqual(stateEnv(root, env), {});
  fs.rmSync(root, { recursive: true, force: true });
});

test('a packaged install reads state from the user home, not Program Files', () => {
  const { root, home, bundled } = fixture();
  const env = { USERPROFILE: home };
  assert.equal(stateDir(bundled, env), path.join(home, '.aios'));
  assert.deepEqual(stateEnv(bundled, env), { AIOS_PROJECT_STATE_DIR: path.join(home, '.aios') });
  fs.rmSync(root, { recursive: true, force: true });
});

test('an explicit state dir always wins, including for a bundled install', () => {
  const { root, home, bundled } = fixture();
  assert.equal(
    stateDir(bundled, { USERPROFILE: home, AIOS_PROJECT_STATE_DIR: path.join(root, 'custom') }),
    path.join(root, 'custom'),
  );
  assert.deepEqual(stateEnv(bundled, { AIOS_PROJECT_STATE_DIR: 'C:\\state' }), {});
  fs.rmSync(root, { recursive: true, force: true });
});
