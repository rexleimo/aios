// The release-contents gate exists because the same allowlist shipped two
// defects in a row, and both were found by hand. Its first version had a blind
// spot that reproduced the original defect exactly: a reference whose *whole*
// top-level tree was absent got skipped, so removing `vendor/` from the archive
// made `vendor/stageshow/MANIFEST.json` vanish from the report instead of
// failing it. A gate that skips what is missing is worse than no gate, because
// it prints a green line.
//
// Both directions are pinned here, including the false positives the strict rule
// produced on its first run — a domain is a citation, and prose shorthand is
// ambiguous rather than missing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../../..');
const SCRIPT = path.join(REPO, 'scripts', 'check-release-contents.mjs');

/**
 * A minimal archive-shaped tree: the contracts plus whatever directories the
 * test wants to exist. `config/` always exists because the declaration lives
 * there in a real archive.
 */
function archive({ motion, design, declaration, dirs = [] }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aios-contents-'));
  fs.mkdirSync(path.join(root, 'config'), { recursive: true });
  fs.writeFileSync(path.join(root, 'MOTION.md'), motion ?? '');
  // Both contracts are checked, so the fixture has to carry both: a missing
  // contract is itself a failure, and leaving it out would make every assertion
  // here about the wrong thing.
  fs.writeFileSync(path.join(root, 'DESIGN.md'), design ?? '');
  for (const dir of ['scripts', 'vendor', ...dirs]) {
    fs.mkdirSync(path.join(root, dir), { recursive: true });
  }
  if (declaration !== undefined) {
    const text = typeof declaration === 'string' ? declaration : JSON.stringify(declaration);
    fs.writeFileSync(path.join(root, 'config', 'release-contents.json'), text);
  }
  return root;
}

function run(root) {
  const result = spawnSync(process.execPath, [SCRIPT, '--archive-dir', root], { encoding: 'utf8' });
  return { code: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

test('a reference into a shipped tree that is absent fails and names the tree', () => {
  const root = archive({ motion: 'Run `vendor/stageshow/MANIFEST.json` first.\n' });
  fs.rmSync(path.join(root, 'vendor'), { recursive: true, force: true });
  const result = run(root);
  // This is the 7.0.1 defect: the archive lost the tree, the contract still
  // named it, and the report used to say everything resolved.
  assert.equal(result.code, 1);
  assert.match(result.stderr, /tree absent/);
  assert.match(result.stderr, /vendor\/stageshow\/MANIFEST\.json/);
});

test('a reference into a declared not-shipped tree passes and is reported', () => {
  const root = archive({
    motion: 'See `docs-site/assets/x.css`.\n',
    declaration: { notShipped: [{ prefix: 'docs-site/', why: 'the published site has its own sources' }] },
  });
  const result = run(root);
  assert.equal(result.code, 0, result.stderr);
  // Passing is not the same as ignoring: the count has to say it was skipped on
  // purpose, or the next reader cannot tell this from a file that was missing.
  assert.match(result.stdout, /1 declared not-shipped/);
});

test('an exclusion without a reason fails instead of quietly applying', () => {
  const root = archive({ motion: 'See `docs-site/assets/x.css`.\n', declaration: { notShipped: [{ prefix: 'docs-site/' }] } });
  const result = run(root);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /exclusion without a reason: docs-site\//);
});

test('an upstream path is a different declaration from a not-shipped tree', () => {
  const root = archive({
    motion: 'Not vendored: `kit/` (upstream).\n',
    declaration: { upstream: [{ prefix: 'kit/', why: 'it lives in the upstream repository' }] },
  });
  assert.equal(run(root).code, 0);
  // The two need different fixes when they are wrong: one tree is ours and was
  // left out, the other was never ours to ship.
  const onlyNotShipped = archive({ motion: 'Not vendored: `kit/` (upstream).\n', declaration: { notShipped: [] } });
  assert.equal(run(onlyNotShipped).code, 1);
});

test('a domain is a citation, not a path claim', () => {
  const root = archive({ motion: 'Source: `github.com/benjitaylor/skills` (MIT).\n' });
  const result = run(root);
  assert.equal(result.code, 0, result.stderr);
});

test('this repository declares every tree its contracts name but does not ship', () => {
  // Run against the real repository: a contract that starts naming a new tree
  // has to be accompanied by a declaration with a reason, and this is the test
  // that notices when only the contract changed.
  const result = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8', cwd: REPO });
  assert.equal(result.status, 0, result.stderr);
});
