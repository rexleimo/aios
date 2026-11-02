// The frame gate is judged by whether it can refuse a real defect and accept a
// clean page. Asserting only one direction would let it pass by always failing
// or by always passing, and the declaration gate already showed what a
// one-directional check costs: it exits 0 on a single-frame 4px snap.
//
// If no browser is reachable the run is a SKIP with a reason, never a pass. The
// reason is required to name the action, so a broken environment cannot read as
// "the page is fine".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../../..');
const SCRIPT = path.join(REPO, 'scripts', 'check-motion-frame.mjs');
const FIXTURE_SNAP = 'scripts/lib/motion-contract/fixtures/frame-snap.html';
const REAL_SURFACE = 'packages/debug-hub/src/ui.html';

function run(args) {
  try {
    const stdout = execFileSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], cwd: REPO });
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
  const result = run(['--page', FIXTURE_SNAP, '--selector', '#stage', '--duration', '1200']);
  if (skipped(result)) {
    assert.match(result.stderr, /Install playwright-core|AIOS_FILM_BROWSER/);
    return;
  }
  assert.equal(result.code, 1, result.stdout + result.stderr);
  assert.match(result.stdout, /jump: card y -4\.0px in one frame/);
});

test('a page without a defect exits 0, and only after measuring elements', () => {
  const result = run(['--page', cleanPage(), '--selector', '#stage', '--duration', '900']);
  if (skipped(result)) return;
  assert.equal(result.code, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /clean/);
  assert.match(result.stdout, /no snap/);
});

test('the real surface is measured, not assumed clean', () => {
  const result = run(['--page', REAL_SURFACE, '--duration', '1000', '--json']);
  if (skipped(result)) return;
  const report = JSON.parse(result.stdout);
  // The whole point: "no findings" is only a result when elements were recorded.
  assert.ok(report.measured.maxItems > 0, 'the recorder saw no element, so a clean verdict would be meaningless');
  assert.equal(report.measured.emptyFrames, 0);
  assert.ok(report.frames > 30, `expected a usable recording window, got ${report.frames} frames`);
});

test('a selector that matches nothing fails instead of reporting clean', () => {
  const result = run(['--page', REAL_SURFACE, '--selector', '.not-a-real-element', '--duration', '300']);
  if (skipped(result)) return;
  // A wrong selector is an operator error, not a clean page.
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /selector not found/);
});

test('--json carries the measured counts a caller needs to distrust a clean run', () => {
  const result = run(['--page', FIXTURE_SNAP, '--selector', '#stage', '--duration', '1200', '--json']);
  if (skipped(result)) return;
  const report = JSON.parse(result.stdout);
  assert.ok(report.measured.maxItems > 0);
  assert.equal(report.findings.length, 1);
  assert.equal(report.disposition.snaps.length, 1);
});

test('a page that does not exist is a usage-level failure, not a clean run', () => {
  const result = run(['--page', 'does/not/exist.html', '--duration', '200']);
  if (skipped(result)) return;
  assert.equal(result.code, 3);
  assert.match(result.stderr, /no such page/);
});

test('--page is required: one run names one surface', () => {
  const result = run(['--duration', '200']);
  assert.equal(result.code, 2);
  assert.match(result.stderr, /--page is required/);
});
