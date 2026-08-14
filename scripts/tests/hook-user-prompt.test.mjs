import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { detectHookClient } from '../lib/planning/user-prompt-submit.mjs';

const HOOK = path.resolve('scripts/lib/planning/hook-user-prompt.mjs');
const AIOS = path.resolve('scripts/aios.mjs');

function runHook(payload, extraEnv = {}) {
  return spawnSync(process.execPath, [HOOK], {
    cwd: process.cwd(),
    encoding: 'utf8',
    input: JSON.stringify(payload),
    env: { ...process.env, ...extraEnv },
  });
}

test('Grok UserPromptSubmit hook returns additionalContext and stays fail-open', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-hook-grok-'));
  try {
    const result = runHook({
      hookEventName: 'UserPromptSubmit',
      sessionId: 'grok-session',
      cwd: rootDir,
      workspaceRoot: rootDir,
      prompt: '解释一下 workflow policy 为什么有 direct',
      client: 'grok',
    });
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.decision.disposition, 'direct');
    assert.ok(Object.hasOwn(output, 'additionalContext'));
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('XAI_API_KEY alone does not identify the hook client as grok', () => {
  assert.equal(detectHookClient({}, { XAI_API_KEY: 'xai-test' }), 'claude');
  assert.equal(detectHookClient({}, { GROK_HOME: 'E:\\tmp\\grok' }), 'grok');
  assert.equal(detectHookClient({ client: 'codex' }, { XAI_API_KEY: 'xai-test' }), 'codex');
});

test('Codex and Grok hook sources pass --client on the UserPromptSubmit command', () => {
  const codexHooks = JSON.parse(readFileSync('client-sources/native-base/codex/project/hooks.json', 'utf8'));
  const grokHooks = JSON.parse(readFileSync('client-sources/native-base/grok/project/hooks/aios-workflow.json', 'utf8'));
  assert.match(codexHooks.hooks.UserPromptSubmit[0].hooks[0].command, /--client\s+codex/u);
  assert.match(grokHooks.hooks.UserPromptSubmit[0].hooks[0].command, /--client\s+grok/u);
});

test('aios plan hook-user-prompt honors --client and attaches recall on planned turns', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-hook-cli-'));
  try {
    const result = spawnSync(process.execPath, [
      AIOS,
      'plan',
      'hook-user-prompt',
      '--client',
      'grok',
    ], {
      cwd: process.cwd(),
      encoding: 'utf8',
      input: JSON.stringify({
        hookEventName: 'UserPromptSubmit',
        cwd: rootDir,
        workspaceRoot: rootDir,
        prompt: '先澄清结账验收标准，再实现校验逻辑。',
      }),
      env: { ...process.env, XAI_API_KEY: 'xai-should-not-matter' },
    });
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.decision.disposition, 'planned');
    assert.match(output.additionalContext, /## AIOS RECALL/u);
    assert.match(output.additionalContext, /ccrg:/u);
    assert.doesNotMatch(output.additionalContext, /Call get_minimal_context/u);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('Codex planned hook attaches ContextDB/CCRG recall without inventing hits', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-hook-codex-'));
  try {
    const result = runHook({
      hookEventName: 'UserPromptSubmit',
      sessionId: 'codex-session',
      cwd: rootDir,
      workspaceRoot: rootDir,
      prompt: '先澄清结账验收标准，再实现校验逻辑。',
      client: 'codex',
    });
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.decision.disposition, 'planned');
    assert.match(output.additionalContext, /## AIOS RECALL/u);
    assert.match(output.additionalContext, /contextdb:/u);
    assert.match(output.additionalContext, /ccrg:/u);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
