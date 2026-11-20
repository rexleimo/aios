// The desktop release version has exactly one source: the `desktop-v*` git tag.
// These tests pin the parser and the stamping of the three files the Tauri
// bundler reads, and — critically — that stamping an isolated copy never
// touches the real worktree (a footgun hit while authoring this script).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, mkdirSync, cpSync } from 'node:fs';
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

test('stamp handles a CRLF lockfile (Windows core.autocrlf checkout)', () => {
  // Regression guard: a literal "\n" match worked on macOS/Linux but silently
  // failed on Windows, where an unpinned Cargo.lock arrives as CRLF — leaving
  // Windows installers stamped with the previous version.
  const { dir, tauri } = isolatedTree();
  try {
    for (const f of ['tauri.conf.json', 'Cargo.toml', 'Cargo.lock']) {
      const p = path.join(tauri, f);
      const crlf = readFileSync(p, 'utf8').replace(/\n/g, '\r\n');
      writeFileSync(p, crlf);
    }
    stamp('5.5.5', dir);
    const lock = readFileSync(path.join(tauri, 'Cargo.lock'), 'utf8');
    assert.match(lock, /name = "aios-shell"\r\nversion = "5\.5\.5"/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('stamp refuses a non-string root instead of mis-resolving to the worktree', () => {
  for (const bad of [null, 42, {}]) {
    assert.throws(() => stamp('2.0.0', bad), /non-empty path/);
  }
});

test('the CLI entry actually runs when invoked (cross-platform main detection)', () => {
  // Regression guard: the original `file://${process.argv[1]}` check silently
  // no-ops on Windows (backslash paths), so the Windows 0.0.2 installers kept
  // the 0.0.1 version. Invoke the CLI with an invalid tag: a running entry
  // rejects it (writing nothing); a broken entry detection exits silently.
  const script = path.join(ROOT, 'scripts', 'desktop-release-version.mjs');
  const probe = spawnSync(process.execPath, [script, 'not-a-desktop-tag'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  assert.notEqual(probe.status, 0, 'CLI entry must run and reject a bad tag');
  assert.match(probe.stderr + probe.stdout, /desktop-v\*|does not encode a semver|expected a desktop-v/);
});

test('the real worktree has one version across all three bundler files', () => {
  // Regression guard: an earlier bug made an isolated-copy test write to the
  // real worktree because `undefined` triggered the default root; another left
  // the Windows installers stamped at the previous version. Assert agreement,
  // not a literal, so the test keeps working across releases.
  const conf = JSON.parse(readFileSync(path.join(SRC_TAURI, 'tauri.conf.json'), 'utf8'));
  const cargo = readFileSync(path.join(SRC_TAURI, 'Cargo.toml'), 'utf8');
  const lock = readFileSync(path.join(SRC_TAURI, 'Cargo.lock'), 'utf8');
  const cargoVersion = cargo.match(/^version = "([^"]+)"$/m)?.[1];
  const lockVersion = lock.match(/name = "aios-shell"\nversion = "([^"]+)"/)?.[1];
  assert.ok(cargoVersion && lockVersion, 'versions must be readable');
  assert.equal(conf.version, cargoVersion);
  assert.equal(conf.version, lockVersion);
});
