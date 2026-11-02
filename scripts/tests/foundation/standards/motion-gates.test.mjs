// The two motion gates that measure, rather than declare.
//
// check-motion-kit answers "is the upstream material installed" with an exit
// code; check-motion-frame answers "does this page actually move as claimed" by
// measuring per-frame geometry in a real browser. They share a file because they
// answer one question - is the motion material present, and does it hold - and
// because the eight-entry directory budget forced a choice between merging them
// and inventing a directory for two files.
//
// Both are judged by whether they can refuse a real defect and accept a clean
// page. Asserting only one direction lets a gate pass by always failing or by
// always passing, and the declaration gate already showed what that costs: it
// exits 0 on a single-frame 4px snap.
//
// If no browser is reachable the frame run is a SKIP with a reason, never a
// pass. The reason names the action, so a broken environment cannot read as
// "the page is fine".
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../../..');
const KIT_SCRIPT = path.join(REPO, 'scripts', 'check-motion-kit.mjs');
const FRAME_SCRIPT = path.join(REPO, 'scripts', 'check-motion-frame.mjs');
const VENDOR = path.join(REPO, 'vendor', 'stageshow');
const FIXTURE_SNAP = 'scripts/lib/motion-contract/fixtures/frame-snap.html';
const REAL_SURFACE = 'packages/debug-hub/src/ui.html';

describe('vendor kit', () => {

function runKit(args) {
  try {
    const stdout = execFileSync(process.execPath, [KIT_SCRIPT, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
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
  const result = runKit(['--root', REPO]);
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
  const result = runKit(['--root', root]);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /missing:\s+references\/motion\.md/);
});

test('a local edit presented as upstream fails, naming both hashes', () => {
  const root = sandbox();
  fs.appendFileSync(path.join(root, 'vendor', 'stageshow', 'scripts', 'jumps-core.mjs'), '\n// local patch\n');
  const result = runKit(['--root', root]);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /modified:\s+scripts\/jumps-core\.mjs/);
  assert.match(result.stderr, /expected [0-9a-f]{16}/);
});

test('an extra file fails: the manifest must describe the tree, not a subset of it', () => {
  const root = sandbox();
  fs.writeFileSync(path.join(root, 'vendor', 'stageshow', 'references', 'invented.md'), '# not upstream\n');
  const result = runKit(['--root', root]);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /extra:\s+references\/invented\.md/);
});

test('no vendored tree at all reports absent, not clean', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aios-vendor-empty-'));
  const result = runKit(['--root', root]);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /ABSENT/);
  // The distinction matters: "not installed" needs an install action, while
  // "damaged" needs a restore. Collapsing them sends the agent to the wrong fix.
  assert.match(result.stderr, /not installed/);
});

test('--json carries the omissions so a caller cannot infer the kit is usable', () => {
  const result = runKit(['--root', REPO, '--json']);
  assert.equal(result.code, 0);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.status, 'verified');
  const kit = payload.notVendored.find((entry) => entry.part === 'kit/');
  assert.ok(kit, 'kit/ must be reported as not vendored');
  assert.match(kit.reason, /react/);
});

test('an unknown argument is a usage error, not a silent pass', () => {
  const result = runKit(['--root', REPO, '--nonsense']);
  assert.equal(result.code, 2);
  assert.match(result.stderr, /unknown argument/);
});

});

describe('frame gate', () => {

function runFrame(args) {
  try {
    const stdout = execFileSync(process.execPath, [FRAME_SCRIPT, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], cwd: REPO });
    return { code: 0, stdout, stderr: '' };
  } catch (error) {
    return { code: error.status ?? 1, stdout: error.stdout ?? '', stderr: error.stderr ?? '' };
  }
}

function skipped(result) {
  return result.code === 3 && /SKIP: no Playwright available/.test(result.stderr);
}

function cleanPage() {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'aios-clean-')), 'clean.html');
  fs.writeFileSync(
    file,
    `<!doctype html><meta charset=utf-8><style>
       body{margin:0;background:#111}
       #stage{position:relative;width:400px;height:200px}
       .card{position:absolute;left:20px;top:40px;width:160px;height:48px;background:#2f6fed;
             animation:rise 300ms cubic-bezier(0.25,0.8,0.25,1) both}
       @keyframes rise{from{transform:translateY(10px);opacity:0}to{transform:translateY(0);opacity:1}}
       @media (prefers-reduced-motion: reduce){.card{animation:none}}
     </style><div id="stage"><div class="card"></div></div>`,
  );
  return file;
}

test('a single-frame 4px step is refused, and the finding is named', () => {
  const result = runFrame(['--page', FIXTURE_SNAP, '--selector', '#stage', '--duration', '1200']);
  if (skipped(result)) {
    assert.match(result.stderr, /Install playwright-core|AIOS_FILM_BROWSER/);
    return;
  }
  assert.equal(result.code, 1, result.stdout + result.stderr);
  assert.match(result.stdout, /jump: card y -4\.0px in one frame/);
});

test('a page without a defect exits 0, and only after measuring elements', () => {
  const result = runFrame(['--page', cleanPage(), '--selector', '#stage', '--duration', '900']);
  if (skipped(result)) return;
  assert.equal(result.code, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /clean/);
  assert.match(result.stdout, /no snap/);
});

test('the real surface is measured, not assumed clean', () => {
  const result = runFrame(['--page', REAL_SURFACE, '--duration', '1000', '--json']);
  if (skipped(result)) return;
  const report = JSON.parse(result.stdout);
  // The whole point: "no findings" is only a result when elements were recorded.
  assert.ok(report.measured.maxItems > 0, 'the recorder saw no element, so a clean verdict would be meaningless');
  assert.equal(report.measured.emptyFrames, 0);
  assert.ok(report.frames > 30, `expected a usable recording window, got ${report.frames} frames`);
});

test('a selector that matches nothing fails instead of reporting clean', () => {
  const result = runFrame(['--page', REAL_SURFACE, '--selector', '.not-a-real-element', '--duration', '300']);
  if (skipped(result)) return;
  // A wrong selector is an operator error, not a clean page.
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /selector not found/);
});

test('--json carries the measured counts a caller needs to distrust a clean run', () => {
  const result = runFrame(['--page', FIXTURE_SNAP, '--selector', '#stage', '--duration', '1200', '--json']);
  if (skipped(result)) return;
  const report = JSON.parse(result.stdout);
  assert.ok(report.measured.maxItems > 0);
  assert.equal(report.findings.length, 1);
  assert.equal(report.disposition.snaps.length, 1);
});

test('a page that does not exist is a usage-level failure, not a clean run', () => {
  const result = runFrame(['--page', 'does/not/exist.html', '--duration', '200']);
  if (skipped(result)) return;
  assert.equal(result.code, 3);
  assert.match(result.stderr, /no such page/);
});

test('--page is required: one run names one surface', () => {
  const result = runFrame(['--duration', '200']);
  assert.equal(result.code, 2);
  assert.match(result.stderr, /--page is required/);
});

});
