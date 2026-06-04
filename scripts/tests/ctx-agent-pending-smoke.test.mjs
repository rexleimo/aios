import assert from 'node:assert/strict';
import test from 'node:test';

import { runOneShotAgent } from '../lib/ctx-agent-core/one-shot.mjs';
import { buildOneShotInvocation } from '../lib/harness/subagent-clients/one-shot.mjs';

test('ctx-agent one-shot blocks Antigravity and Crush instead of falling back to OpenCode', () => {
  for (const agent of ['antigravity-cli', 'crush-cli']) {
    const result = runOneShotAgent(agent, 'context', 'prompt', [], { injectContext: false });
    assert.notEqual(result.exitCode, 0);
    assert.match(result.output, new RegExp(`${agent}.*pending-smoke|pending-smoke.*${agent}`, 'i'));
    assert.doesNotMatch(result.output, /opencode/i);
  }
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
