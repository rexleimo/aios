import assert from 'node:assert/strict';
import test from 'node:test';

import { buildCodexOneShotArgs, runOneShotAgent, ONE_SHOT_HANDLERS_FOR_TEST } from '../lib/ctx-agent-core/one-shot.mjs';
import { buildOneShotInvocation } from '../lib/harness/subagent-clients/one-shot.mjs';
import { runOneShot } from '../lib/harness/subagent-runtime/one-shot-runner.mjs';

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

test('harness one-shot invocation builds real crush args and leaves antigravity unimplemented', () => {
  const common = {
    systemText: 'system',
    promptText: 'prompt',
    routedExtraArgs: [],
    adapters: {
      buildClaudeUnattendedArgs: () => [],
      buildGeminiUnattendedArgs: () => [],
      buildCodexConfigArgs: () => [],
      buildCodexUnattendedArgs: () => [],
    },
  };

  const anti = buildOneShotInvocation({ clientId: 'antigravity-cli', ...common });
  assert.equal(anti, null);

  const crush = buildOneShotInvocation({ clientId: 'crush-cli', ...common });
  assert.equal(crush.runner, 'spawn');
  assert.deepEqual(crush.args, ['run', 'system\n\n## New User Request\nprompt']);
});

test('only crush keeps a registered handler while pending-smoke short-circuit wins', () => {
  assert.equal(typeof ONE_SHOT_HANDLERS_FOR_TEST['antigravity-cli'], 'undefined');
  assert.equal(typeof ONE_SHOT_HANDLERS_FOR_TEST['crush-cli'], 'function');
  const result = runOneShotAgent('antigravity-cli', 'ctx', 'do work', [], { injectContext: false });
  assert.notEqual(result.exitCode, 0);
  assert.match(result.output, /pending-smoke/i);
});

test('subagent runtime blocks pending-smoke clients before spawn', async () => {
  for (const clientId of ['antigravity-cli', 'crush-cli']) {
    const result = await runOneShot(clientId, {
      systemPrompt: '',
      userPrompt: 'do work',
      env: {},
    });
    assert.notEqual(result.exitCode, 0);
    assert.match(String(result.error || ''), /pending-smoke/i);
  }
});
