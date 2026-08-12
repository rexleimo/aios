import assert from 'node:assert/strict';
import test from 'node:test';

import { createRexCommandRunner } from '../lib/rex-harness/command.mjs';

test('aios rex forwards arguments to the managed rex-harness executable', async () => {
  const calls = [];
  const runRex = createRexCommandRunner({
    rootDir: '/runtime',
    run: async (executable, args, options) => {
      calls.push({ executable, args, options });
      return { status: 0, stdout: '{"status":"ready"}\n', stderr: '' };
    },
  });
  const output = [];

  const result = await runRex(['doctor'], { write: (value) => output.push(value) });

  assert.equal(result.exitCode, 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].executable, process.execPath);
  assert.equal(calls[0].args.at(-1), 'doctor');
  assert.match(calls[0].args[0], /rex-harness[\\/]bin[\\/]rex-harness\.mjs$/);
  assert.match(calls[0].options.cwd, /runtime$/);
  assert.equal(calls[0].options.encoding, 'utf8');
  assert.deepEqual(output, ['{"status":"ready"}\n']);
});
