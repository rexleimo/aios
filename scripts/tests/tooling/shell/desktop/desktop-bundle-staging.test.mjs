// The self-contained installer is only as good as the tree it stages. These tests
// pin the three things a downloaded DMG/exe must carry and the two failures that
// silently produce an unusable installer: a missing required path and a missing
// Node runtime. Staging helpers accept injected fs/paths so no real build is needed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { stageTree, stageNode, stageBuiltUi } from '../../../../../scripts/prepare-desktop-bundle.mjs';

function fixtureRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aios-stage-fixture-'));
  // Only the paths stageTree actually reads; the fixture is a shape, not a checkout.
  for (const rel of [
    'AGENTS.md', 'CHANGELOG.md', 'VERSION', '.nvmrc', '.node-version', '.npmrc',
    'MOTION.md', 'DESIGN.md', 'package.json', 'package-lock.json',
    'README.md', 'README-zh.md', 'skills-lock.json',
    'vendor', 'client-sources', 'agent-sources', 'skill-sources', 'rex-harness',
    'config', 'scripts', 'mcp-server', 'src', 'packages/debug-hub',
    'apps/shell/README.md', 'apps/shell/ui',
  ]) {
    const target = path.join(root, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (rel.includes('.')) fs.writeFileSync(target, `${rel}\n`);
    else fs.mkdirSync(target, { recursive: true });
  }
  // Simulate generated output the stager must exclude.
  fs.mkdirSync(path.join(root, 'apps/shell/ui/.next'), { recursive: true });
  fs.writeFileSync(path.join(root, 'apps/shell/ui/.next/BUILD_ID'), 'fixture');
  return root;
}

test('staging copies the whole capability tree and drops generated output', () => {
  const root = fixtureRoot();
  const dest = path.join(root, 'staged');
  const entries = stageTree(root, dest);

  assert.ok(entries >= 25, 'every declared release path is staged');
  assert.ok(fs.existsSync(path.join(dest, 'scripts')));
  assert.ok(fs.existsSync(path.join(dest, 'config')));
  assert.ok(fs.existsSync(path.join(dest, 'apps', 'shell', 'ui')));
  assert.equal(fs.existsSync(path.join(dest, 'apps', 'shell', 'ui', '.next')), false,
    '.next is rebuilt in CI and must not be copied from the source tree');
  fs.rmSync(root, { recursive: true, force: true });
});

test('staging fails loudly on a missing required path', () => {
  const root = fixtureRoot();
  fs.rmSync(path.join(root, 'rex-harness'), { recursive: true, force: true });
  assert.throws(() => stageTree(root, path.join(root, 'staged')), /required path missing: rex-harness/);
  fs.rmSync(root, { recursive: true, force: true });
});

test('the freshly built UI is copied in, and a missing build fails loudly', () => {
  const root = fixtureRoot();
  const dest = path.join(root, 'staged');
  const ui = path.join(root, 'apps', 'shell', 'ui');
  fs.writeFileSync(path.join(ui, '.next', 'BUILD_ID'), 'fresh-build');
  fs.mkdirSync(path.join(ui, 'node_modules', 'next', 'dist', 'bin'), { recursive: true });
  fs.writeFileSync(path.join(ui, 'node_modules', 'next', 'dist', 'bin', 'next'), '// next\n');
  stageTree(root, dest);

  const buildRel = stageBuiltUi(root, dest);
  assert.ok(buildRel.endsWith(path.join('.next', 'BUILD_ID')));
  assert.equal(fs.readFileSync(path.join(dest, 'apps', 'shell', 'ui', '.next', 'BUILD_ID'), 'utf8'), 'fresh-build');
  assert.ok(fs.existsSync(path.join(dest, 'apps', 'shell', 'ui', 'node_modules', 'next', 'dist', 'bin', 'next')));

  const empty = fixtureRoot();
  fs.rmSync(path.join(empty, 'apps', 'shell', 'ui', '.next'), { recursive: true, force: true });
  fs.mkdirSync(path.join(empty, 'staged'), { recursive: true });
  assert.throws(() => stageBuiltUi(empty, path.join(empty, 'staged')), /UI build did not produce/);
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(empty, { recursive: true, force: true });
});

test('the bundled node is placed at bin/node and refuses a missing runtime', () => {
  const root = fixtureRoot();
  const dest = path.join(root, 'staged');
  const fakeNode = path.join(root, 'node-runtime');
  fs.writeFileSync(fakeNode, '#!/bin/sh\n');

  const rel = stageNode(dest, fakeNode, { platform: 'linux' });
  assert.equal(rel, path.join('bin', 'node'));
  assert.ok(fs.existsSync(path.join(dest, 'bin', 'node')));
  assert.throws(() => stageNode(dest, path.join(root, 'nope'), { platform: 'linux' }), /node runtime missing/);
  fs.rmSync(root, { recursive: true, force: true });
});
