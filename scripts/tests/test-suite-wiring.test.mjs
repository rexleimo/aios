/**
 * Test scope contract — test-suite wiring integrity
 *
 * Recorded before the tests, under rex-test-design (activation 4ee0bb63-9e09-4a50-8341-8529a644a545,
 * stage design-tests).
 *
 * Why this exists: on 2026-09-18 a newly written test file was absent from
 * `scripts/test-suites.json`, and the full regression run reported green without ever
 * executing it. 255 `.test.mjs` files exist; 144 are in no suite and 82 are reachable
 * from no test entry at all. Nothing failed, nothing warned. This guard turns that
 * silence into a gate.
 *
 * User goal:
 *   A test file can never silently stop running because nobody wired it into an entry
 *   point, and the suite manifest can never point at a file that no longer exists.
 *
 * Explicit non-goals:
 *   - not auto-wiring files into suites;
 *   - not fixing the unwired files' own failures (23 of them today) -- separate work item;
 *   - no runner or suite-semantics change;
 *   - out of scope: rex-harness/tests, mcp-server/tests.
 *
 * In-scope behavior:
 *   W1 Every file referenced by scripts/test-suites.json exists on disk (no dangling ref).
 *   W2 Every scripts/tests/*.test.mjs is reachable from a test entry, or is listed in
 *      scripts/test-wiring-snapshot.json.knownUnwired. A new unwired file fails.
 *   W3 The snapshot may not contain a name that is already wired or already gone, so the
 *      snapshot cannot rot into a blanket excuse.
 *   W4 The failure names the file and both ways out.
 *   W5 Every test file is executed by a CI-reachable entry point, not merely reachable from
 *      some package.json script. Added 2026-09-21: the five `test:rl-*` suites (41 files)
 *      satisfied W2 through globs in scripts no workflow invoked, so nothing ran them in CI
 *      and they were silently red for weeks (see docs/outstanding-work.md A7). A file that
 *      no CI job executes must be recorded in `knownNotInCi` with a reason.
 *
 * Explicitly considered and rejected (2026-09-21): a static "this test reads a gitignored
 * generated root" lint. Measured over scripts/tests, a raw literal scan hits 64/259 files
 * (nearly all legitimate temp-root fixture writes and client-root mappings) and a
 * read-call-scoped scan hits 0 real cases (2 false positives), because the historical bugs
 * built their paths through helpers and variables. W5 is the sound mechanism instead: a test
 * that depends on a developer-only artifact now fails in CI, where the artifact does not
 * exist. Do not add a literal lint that cannot see the real cases.
 *
 * Allowed test seams: scripts/test-suites.json, the package.json test scripts,
 *   the scripts/tests listing, and scripts/test-wiring-snapshot.json -- all public
 *   configuration and data. No internal function is asserted.
 *
 * Completion criteria: W1/W2/W3 each fail independently under mutation, and the
 *   regression suite stays green. Refresh the snapshot with
 *   AIOS_UPDATE_TEST_WIRING=1 node --test scripts/tests/test-suite-wiring.test.mjs
 *
 * Forbidden fake passes: no "the suite is not empty" style assertion, no self-comparison
 *   of the snapshot with itself, no skipped case.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TESTS_DIR = path.join(ROOT, 'scripts', 'tests');
const SUITES_PATH = path.join(ROOT, 'scripts', 'test-suites.json');
const SNAPSHOT_PATH = path.join(ROOT, 'scripts', 'test-wiring-snapshot.json');

const RELATIVE = (absolute) => path.relative(ROOT, absolute).split(path.sep).join('/');

/** Glob patterns from the package.json test entries (the non-suite entry points). */
function entryPatterns() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const patterns = [];
  for (const [name, value] of Object.entries(pkg.scripts || {})) {
    if (!(name === 'pretest:scripts' || name.startsWith('test:'))) continue;
    for (const match of String(value).matchAll(/scripts\/tests\/[^\s&|]+/g)) {
      patterns.push(match[0]);
    }
  }
  return patterns;
}

function matchesPattern(file, pattern) {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '.*');
  return new RegExp(`^${escaped}$`).test(file);
}

/** Every behaviour below reads this one computation. */
function wiring() {
  const suites = JSON.parse(fs.readFileSync(SUITES_PATH, 'utf8'));
  const registered = new Set();
  for (const suite of Object.values(suites)) {
    for (const file of suite.files || []) registered.add(file);
  }
  const patterns = entryPatterns();
  const onDisk = fs
    .readdirSync(TESTS_DIR)
    .filter((name) => name.endsWith('.test.mjs'))
    .map((name) => `scripts/tests/${name}`)
    .sort();
  const wired = new Set(
    onDisk.filter(
      (file) => registered.has(file) || patterns.some((pattern) => matchesPattern(file, pattern)),
    ),
  );
  return {
    registered,
    onDisk,
    wired,
    unwired: onDisk.filter((file) => !wired.has(file)),
    dangling: [...registered].filter((file) => !fs.existsSync(path.join(ROOT, file))).sort(),
  };
}

function readSnapshot() {
  return JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8'));
}

function writeSnapshot(unwired) {
  const previous = fs.existsSync(SNAPSHOT_PATH) ? readSnapshot() : {};
  fs.writeFileSync(
    SNAPSHOT_PATH,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        note:
          'Test files reachable from no suite and no package.json test entry. This list is a '
          + 'baseline for scripts/tests/test-suite-wiring.test.mjs, not an approval: wiring a file '
          + 'shrinks it, and a new unwired file fails the guard instead of being appended silently.',
        knownUnwired: unwired,
        knownNotInCi: previous.knownNotInCi || [],
      },
      null,
      2,
    )}\n`,
  );
}

if (process.env.AIOS_UPDATE_TEST_WIRING === '1') {
  writeSnapshot(wiring().unwired);
}

test('W1: the suite manifest references only files that exist', () => {
  const { dangling } = wiring();
  assert.deepEqual(dangling, [], `dangling suite references: ${dangling.join(', ')}`);
});

test('W2: no test file is silently unreachable', () => {
  const { unwired } = wiring();
  const known = new Set(readSnapshot().knownUnwired);
  const fresh = unwired.filter((file) => !known.has(file));
  assert.deepEqual(
    fresh,
    [],
    `unreachable test file(s) - wire them into a suite/entry, or refresh the baseline with `
      + `AIOS_UPDATE_TEST_WIRING=1: ${fresh.join(', ')}`,
  );
});

test('W3: the unwired baseline holds only genuinely unwired files', () => {
  const { wired, onDisk, unwired } = wiring();
  const known = readSnapshot().knownUnwired;
  const alreadyWired = known.filter((file) => wired.has(file));
  const missing = known.filter((file) => !onDisk.includes(file));
  assert.deepEqual(alreadyWired, [], `baseline lists files that are now wired: ${alreadyWired.join(', ')}`);
  assert.deepEqual(missing, [], `baseline lists files that no longer exist: ${missing.join(', ')}`);
  // 相等断言把 W2 的方向也包住了（基线漂移必然不相等）；W2 存在的理由是给出可操作的出路提示。
  assert.deepEqual(
    [...known].sort(),
    [...unwired].sort(),
    'baseline drifted from the actual unwired set',
  );
});

const WORKFLOWS_DIR = path.join(ROOT, '.github', 'workflows');

/**
 * Scripts CI actually invokes, following `npm run` chains and npm's implicit
 * `pre<name>` hook. A file wired only to a `test:*` script that no workflow runs is
 * reachable but never executed — the A7 failure mode.
 */
function ciReachableScripts() {
  const scripts = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).scripts || {};
  const workflowText = fs
    .readdirSync(WORKFLOWS_DIR)
    .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
    .map((name) => fs.readFileSync(path.join(WORKFLOWS_DIR, name), 'utf8'))
    .join('\n');

  const reachable = new Set();
  const visit = (name) => {
    if (!name || reachable.has(name) || scripts[name] === undefined) return;
    reachable.add(name);
    // npm runs pre<name> automatically for `npm run <name>`.
    visit(`pre${name}`);
    for (const nested of String(scripts[name]).matchAll(/npm\s+run\s+([A-Za-z0-9:_-]+)/g)) visit(nested[1]);
  };
  for (const match of workflowText.matchAll(/npm\s+(?:--prefix\s+\S+\s+)?run\s+([A-Za-z0-9:_-]+)/g)) {
    visit(match[1]);
  }
  return { reachable, scripts };
}

/** Test files that a CI-reachable script executes (globs from scripts + suite manifests). */
function ciExecutedFiles() {
  const { reachable, scripts } = ciReachableScripts();
  const suites = JSON.parse(fs.readFileSync(SUITES_PATH, 'utf8'));
  const { onDisk } = wiring();
  const files = new Set();
  for (const name of reachable) {
    const body = String(scripts[name]);
    for (const match of body.matchAll(/scripts\/tests\/[^\s&|]+/g)) {
      for (const file of onDisk) if (matchesPattern(file, match[0])) files.add(file);
    }
    for (const match of body.matchAll(/run-test-suite\.mjs\s+([A-Za-z0-9:_-]+)/g)) {
      for (const file of suites[match[1]]?.files || []) files.add(file);
    }
  }
  return files;
}

test('W5: every test file is executed by a CI-reachable entry point', () => {
  const executed = ciExecutedFiles();
  const known = new Set(readSnapshot().knownNotInCi || []);
  const fresh = wiring().onDisk.filter((file) => !executed.has(file) && !known.has(file));
  assert.deepEqual(
    fresh,
    [],
    'test file(s) that no CI workflow executes - run them from a workflow step, or record why '
      + `they cannot in scripts/test-wiring-snapshot.json.knownNotInCi: ${fresh.join(', ')}`,
  );
});

test('W5 drift: the not-in-CI baseline holds only genuinely unexecuted files', () => {
  const executed = ciExecutedFiles();
  const known = readSnapshot().knownNotInCi || [];
  const stale = known.filter((file) => executed.has(file) || !wiring().onDisk.includes(file));
  assert.deepEqual(stale, [], `baseline lists files that CI executes or that no longer exist: ${stale.join(', ')}`);
});
