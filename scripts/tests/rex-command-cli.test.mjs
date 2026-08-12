import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('aios rex doctor invokes bundled rex-harness through public CLI', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-rex-command-'));
  await mkdir(path.join(rootDir, 'rex-harness', 'bin'), { recursive: true });
  await writeFile(path.join(rootDir, 'rex-harness', 'bin', 'rex-harness.mjs'), [
    "console.log(JSON.stringify({ status: 'ready' }));",
    'process.exitCode = 0;',
  ].join('\n'), 'utf8');

  const result = spawnSync(process.execPath, ['scripts/aios.mjs', 'rex', 'doctor'], {
    cwd: path.resolve('.'),
    env: { ...process.env, AIOS_REX_ROOT: rootDir },
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /"status":"ready"/);
});
