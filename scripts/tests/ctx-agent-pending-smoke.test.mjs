import assert from 'node:assert/strict';
import test from 'node:test';

import { buildCodexOneShotArgs, runOneShotAgent } from '../lib/ctx-agent-core/one-shot.mjs';
import { buildOneShotInvocation } from '../lib/harness/subagent-clients/one-shot.mjs';

test('ctx-agent one-shot blocks Antigravity and Crush instead of falling back to OpenCode', () => {
  for (const agent of ['antigravity-cli', 'crush-cli']) {
    const result = runOneShotAgent(agent, 'context', 'prompt', [], { injectContext: false });
    assert.notEqual(result.exitCode, 0);
    assert.match(result.output, new RegExp(`${agent}.*pending-smoke|pending-smoke.*${agent}`, 'i'));
    assert.doesNotMatch(result.output, /opencode/i);
  }
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

test('harness one-shot invocation marks pending-smoke clients unsupported', () => {
  const common = {
    systemText: 'system',
    promptText: 'prompt',
    adapters: {
      buildClaudeUnattendedArgs: () => [],
      buildGeminiUnattendedArgs: () => [],
      buildCodexConfigArgs: () => [],
      buildCodexUnattendedArgs: () => [],
    },
  };

  for (const clientId of ['antigravity-cli', 'crush-cli']) {
    const invocation = buildOneShotInvocation({ clientId, ...common });
    assert.equal(invocation, null);
  }
});
