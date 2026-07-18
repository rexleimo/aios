import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  REX_HARNESS_REQUIRED_FILES,
  doctorRexHarness,
  ensureRexHarness,
  inspectRexHarness,
  isAiosRuntimeRoot,
} from '../lib/rex-harness/runtime.mjs';

async function makeRoot(prefix = 'rex-runtime-') {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

async function seedRexHarness(rootDir) {
  await mkdir(path.join(rootDir, 'scripts'), { recursive: true });
  await mkdir(path.join(rootDir, 'rex-harness'), { recursive: true });
  await writeFile(path.join(rootDir, 'scripts', 'aios.mjs'), '#!/usr/bin/env node\n', 'utf8');
  await writeFile(path.join(rootDir, 'package.json'), '{}\n', 'utf8');
  await writeFile(path.join(rootDir, '.gitmodules'), '[submodule "rex-harness"]\n', 'utf8');
  await writeFile(path.join(rootDir, 'rex-harness', 'package.json'), JSON.stringify({ version: '0.4.2' }), 'utf8');
  for (const relativePath of REX_HARNESS_REQUIRED_FILES.filter((file) => file !== 'package.json')) {
    const filePath = path.join(rootDir, 'rex-harness', relativePath);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, '# fixture\n', 'utf8');
  }
}

test('inspectRexHarness requires the runtime entrypoint, CLI, package, and workflow skill', async () => {
  const rootDir = await makeRoot();
  await seedRexHarness(rootDir);

  const report = await inspectRexHarness({ rootDir });

  assert.equal(report.ready, true);
  assert.equal(report.version, '0.4.2');
  assert.deepEqual(report.missing, []);
  assert.equal(isAiosRuntimeRoot(rootDir), true);
});

test('ensureRexHarness reports a release install that omitted the bundled kernel', async () => {
  const rootDir = await makeRoot();
  await mkdir(path.join(rootDir, 'scripts'), { recursive: true });
  await writeFile(path.join(rootDir, 'scripts', 'aios.mjs'), '#!/usr/bin/env node\n', 'utf8');
  await writeFile(path.join(rootDir, 'package.json'), '{}\n', 'utf8');

  const report = await ensureRexHarness({ rootDir });

  assert.equal(report.ready, false);
  assert.ok(report.missing.includes('src/index.mjs'));
  assert.match(report.fixHint, /reinstall|submodule/i);
});

test('ensureRexHarness initializes a missing source submodule when fix is enabled', async () => {
  const rootDir = await makeRoot();
  await mkdir(path.join(rootDir, 'scripts'), { recursive: true });
  await writeFile(path.join(rootDir, 'scripts', 'aios.mjs'), '#!/usr/bin/env node\n', 'utf8');
  await writeFile(path.join(rootDir, 'package.json'), '{}\n', 'utf8');
  await writeFile(path.join(rootDir, '.gitmodules'), '[submodule "rex-harness"]\n', 'utf8');
  const calls = [];

  const report = await ensureRexHarness({
    rootDir,
    fix: true,
    commandAvailable: () => true,
    commandRunner: async (command, args, options) => {
      calls.push({ command, args, options });
      await seedRexHarness(rootDir);
      return { status: 0, stdout: 'Submodule path', stderr: '' };
    },
  });

  assert.equal(report.ready, true);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].args, ['submodule', 'update', '--init', '--recursive', '--', 'rex-harness']);
});

test('doctorRexHarness returns a hard error for a missing planning kernel', async () => {
  const rootDir = await makeRoot();
  await mkdir(path.join(rootDir, 'scripts'), { recursive: true });
  await writeFile(path.join(rootDir, 'scripts', 'aios.mjs'), '#!/usr/bin/env node\n', 'utf8');
  const logs = [];

  const result = await doctorRexHarness({ rootDir, io: { log: (line) => logs.push(String(line)) } });

  assert.equal(result.errors, 1);
  assert.equal(result.ready, false);
  assert.match(logs.join('\n'), /rex-harness/i);
  assert.match(logs.join('\n'), /missing|reinstall|submodule/i);
});

test('doctorRexHarness recognizes the bundled kernel after an install', async () => {
  const rootDir = await makeRoot();
  await seedRexHarness(rootDir);
  const logs = [];

  const result = await doctorRexHarness({ rootDir, io: { log: (line) => logs.push(String(line)) } });

  assert.equal(result.errors, 0);
  assert.equal(result.ready, true);
  assert.match(logs.join('\n'), /rex-harness ready/i);
  assert.match(await readFile(path.join(rootDir, 'rex-harness', 'package.json'), 'utf8'), /0\.4\.2/);
});
