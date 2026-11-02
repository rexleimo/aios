// The vendor tree answers "is the motion material installed" with an exit
// code, so the tests here are about the failure modes an agent would otherwise
// paper over: a missing directory, a deleted reference, a local edit presented
// as upstream, and a manifest that quietly stops describing the tree.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../../..');
const SCRIPT = path.join(REPO, 'scripts', 'check-motion-kit.mjs');
const VENDOR = path.join(REPO, 'vendor', 'stageshow');

function run(args) {
  try {
    const stdout = execFileSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { code: 0, stdout, stderr: '' };
  } catch (error) {
    return { code: error.status ?? 1, stdout: error.stdout ?? '', stderr: error.stderr ?? '' };
  }
}

// A copy of the real tree so each case mutates a throwaway directory instead of
// the repository: a test that damages the subject it verifies proves nothing.
function sandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aios-vendor-'));
  fs.cpSync(path.join(REPO, 'vendor'), path.join(root, 'vendor'), { recursive: true });
  return root;
}

test('the vendored tree in this repository is verified', () => {
  const result = run(['--root', REPO]);
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /verified/);
});

test('the manifest records where the material came from and what stayed upstream', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(VENDOR, 'MANIFEST.json'), 'utf8'));
  assert.match(manifest.commit, /^[0-9a-f]{40}$/);
  assert.equal(manifest.license, 'MIT');
  assert.ok(Object.keys(manifest.files).length > 0);
  const parts = manifest.notVendored.map((entry) => entry.part);
  // These are the omissions an agent would otherwise assume were present.
  for (const part of ['kit/', 'examples/', 'assets/app-icons.ts']) {
    assert.ok(parts.includes(part), `${part} must be declared as not vendored`);
  }
});

test('a deleted reference file fails, naming the file', () => {
  const root = sandbox();
  fs.rmSync(path.join(root, 'vendor', 'stageshow', 'references', 'motion.md'));
  const result = run(['--root', root]);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /missing:\s+references\/motion\.md/);
});

test('a local edit presented as upstream fails, naming both hashes', () => {
  const root = sandbox();
  fs.appendFileSync(path.join(root, 'vendor', 'stageshow', 'scripts', 'jumps-core.mjs'), '\n// local patch\n');
  const result = run(['--root', root]);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /modified:\s+scripts\/jumps-core\.mjs/);
  assert.match(result.stderr, /expected [0-9a-f]{16}/);
});

test('an extra file fails: the manifest must describe the tree, not a subset of it', () => {
  const root = sandbox();
  fs.writeFileSync(path.join(root, 'vendor', 'stageshow', 'references', 'invented.md'), '# not upstream\n');
  const result = run(['--root', root]);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /extra:\s+references\/invented\.md/);
});

test('no vendored tree at all reports absent, not clean', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aios-vendor-empty-'));
  const result = run(['--root', root]);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /ABSENT/);
  // The distinction matters: "not installed" needs an install action, while
  // "damaged" needs a restore. Collapsing them sends the agent to the wrong fix.
  assert.match(result.stderr, /not installed/);
});

test('--json carries the omissions so a caller cannot infer the kit is usable', () => {
  const result = run(['--root', REPO, '--json']);
  assert.equal(result.code, 0);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.status, 'verified');
  const kit = payload.notVendored.find((entry) => entry.part === 'kit/');
  assert.ok(kit, 'kit/ must be reported as not vendored');
  assert.match(kit.reason, /react/);
});

test('an unknown argument is a usage error, not a silent pass', () => {
  const result = run(['--root', REPO, '--nonsense']);
  assert.equal(result.code, 2);
  assert.match(result.stderr, /unknown argument/);
});
