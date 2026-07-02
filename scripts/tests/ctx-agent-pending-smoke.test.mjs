import assert from 'node:assert/strict';
import test from 'node:test';

import { buildCodexOneShotArgs, runOneShotAgent } from '../lib/ctx-agent-core/one-shot.mjs';

test('ctx-agent one-shot API no longer accepts injected context arguments', () => {
  assert.equal(runOneShotAgent.length, 3);
});

test('codex one-shot puts flags before stdin prompt placeholder', () => {
  assert.deepEqual(
    buildCodexOneShotArgs({
      configArgs: ['--config', 'mcp_servers={}', '--config', 'model_provider=null'],
      extraArgs: ['--dangerously-bypass-approvals-and-sandbox', '-m', 'gpt-5.5'],
    }),
    [
      'exec',
      '--config',
      'mcp_servers={}',
      '--config',
      'model_provider=null',
      '--dangerously-bypass-approvals-and-sandbox',
      '-m',
      'gpt-5.5',
      '-',
    ]
  );
});
