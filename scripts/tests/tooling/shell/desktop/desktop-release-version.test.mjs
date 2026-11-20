// The desktop release version has exactly one source: the `desktop-v*` git tag.
// These tests pin the parser and the stamping of the three files the Tauri
// bundler reads, and — critically — that stamping an isolated copy never
// touches the real worktree (a footgun hit while authoring this script).
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { versionFromTag, stamp } from '../../../../../scripts/desktop-release-version.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..', '..', '..', '..');
const SRC_TAURI = path.join(ROOT, 'apps', 'shell', 'src-tauri');

test('versionFromTag parses valid desktop tags', () => {
  assert.equal(versionFromTag('desktop-v0.0.1'), '0.0.1');
  assert.equal(versionFromTag('desktop-v1.2.3-beta.1'), '1.2.3-beta.1');
});

test('versionFromTag rejects malformed or foreign tags', () => {
  for (const bad of ['v0.0.1', 'desktop-v', 'desktop-vx.y.z', 'desktop-v1.2', '', null, undefined]) {
    assert.throws(() => versionFromTag(bad), undefined, `should reject ${JSON.stringify(bad)}`);
  }
});

function isolatedTree() {
  const dir = mkdtempSync(path.join(tmpdir(), 'aios-desktop-ver-'));
  const tauri = path.join(dir, 'apps', 'shell', 'src-tauri');
  mkdirSync(tauri, { recursive: true });
  for (const f of ['tauri.conf.json', 'Cargo.toml', 'Cargo.lock']) {
    cpSync(path.join(SRC_TAURI, f), path.join(tauri, f));
  }
  return { dir, tauri };
}

test('stamp writes the version into all three bundler-facing files', () => {
  const { dir, tauri } = isolatedTree();
  try {
    stamp('9.8.7', dir);
    const conf = JSON.parse(readFileSync(path.join(tauri, 'tauri.conf.json'), 'utf8'));
    const cargo = readFileSync(path.join(tauri, 'Cargo.toml'), 'utf8');
    const lock = readFileSync(path.join(tauri, 'Cargo.lock'), 'utf8');
    assert.equal(conf.version, '9.8.7');
    assert.match(cargo, /^version = "9\.8\.7"$/m);
    assert.match(lock, /name = "aios-shell"\nversion = "9\.8\.7"/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('stamp refuses a non-string root instead of mis-resolving to the worktree', () => {
  for (const bad of [null, 42, {}]) {
    assert.throws(() => stamp('2.0.0', bad), /non-empty path/);
  }
});

test('the real worktree stays pinned at the declared 0.0.1', () => {
  // Regression guard: an earlier bug made an isolated-copy test write to the
  // real worktree because `undefined` triggered the default root.
  const conf = JSON.parse(readFileSync(path.join(SRC_TAURI, 'tauri.conf.json'), 'utf8'));
  assert.equal(conf.version, '0.0.1');
});
