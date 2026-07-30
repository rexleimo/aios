import assert from 'node:assert/strict';
import test from 'node:test';

import {
  mkdtemp,
  readFile,
  rm,
  os,
  path,
  normalizeSoloIterationOutcome,
  resolveSoloBackoffState,
  buildClientStructuredOutputOptions,
  cleanupClientStructuredOutputTempDir,
  createClientStructuredOutputTempDir,
  shouldUseClientStructuredOutput,
  buildOneShotInvocation,
  runOneShot,
  importHarnessInitHumanGate,
  writeFallbackCodexCommand,
} from './support.mjs';

test('harness init human gate warns but does not block background safety references', async () => {
  const { evaluateHumanGate } = await importHarnessInitHumanGate();

  const gate = evaluateHumanGate({
    taskText: [
      'User goal: explain why harness gates ask for confirmation.',
      '',
      '# AGENTS.md instructions',
      '- cap eventually runs git push after verification.',
      '- Never expose token, credential, or session cookie values.',
    ].join('\n'),
  });

  assert.equal(gate.allowed, true);
  assert.equal(gate.decision, 'warn');
  assert.deepEqual(gate.reasons, []);
  assert.equal(gate.warnings.some((item) => /background/i.test(item)), true);
});

test('harness init human gate requires confirmation for explicit sensitive actions', async () => {
  const { evaluateHumanGate } = await importHarnessInitHumanGate();

  const gate = evaluateHumanGate({
    taskText: 'Run git push to publish the current branch.',
  });

  assert.equal(gate.allowed, false);
  assert.equal(gate.decision, 'approval-required');
  assert.equal(gate.reasons.some((item) => /git push/i.test(item)), true);
  assert.match(gate.question, /confirm/i);
  assert.match(gate.resumeHint, /--allow-risk/);
});

test('harness init human gate does not block negated sensitive command examples', async () => {
  const { evaluateHumanGate } = await importHarnessInitHumanGate();

  const gate = evaluateHumanGate({
    taskText: 'Do not run git push; only explain when a push would require approval.',
  });

  assert.equal(gate.allowed, true);
  assert.equal(gate.decision, 'warn');
  assert.equal(gate.reasons.length, 0);
});

test('normalizeSoloIterationOutcome fills defaults for a success outcome', () => {
  const success = normalizeSoloIterationOutcome({
    sessionId: 's1',
    iteration: 1,
    outcome: 'success',
    summary: 'done',
    shouldStop: false,
  });

  assert.equal(success.failureClass, 'none');
  assert.equal(success.backoffAction, 'none');
  assert.equal(success.checkpointStatus, 'running');
  assert.equal(success.stage, 'development');
  assert.deepEqual(success.evidence, ['summary: done']);
});

test('normalizeSoloIterationOutcome preserves blocked no-progress decisions', () => {
  const blocked = normalizeSoloIterationOutcome({
    sessionId: 's1',
    iteration: 2,
    outcome: 'blocked',
    summary: 'No safe next mutation',
    stage: 'validation',
    evidence: ['npm test failed'],
    failureClass: 'no-progress',
    shouldStop: false,
  });

  assert.equal(blocked.failureClass, 'no-progress');
  assert.equal(blocked.outcome, 'blocked');
  assert.equal(blocked.stage, 'validation');
  assert.deepEqual(blocked.evidence, ['npm test failed']);
});

test('resolveSoloBackoffState doubles delay for infra failures', () => {
  const infra = resolveSoloBackoffState({
    previous: { consecutiveInfraFailures: 1, nextDelayMs: 60000, until: null },
    outcome: { outcome: 'infra-retry', failureClass: 'runtime-error' },
    nowIso: '2026-04-26T15:00:00.000Z',
  });

  assert.equal(infra.consecutiveInfraFailures, 2);
  assert.equal(infra.nextDelayMs, 120000);
});

test('structured subagent output is isolated to the codex runtime adapter', async () => {
  const tempDir = await createClientStructuredOutputTempDir('codex-cli');

  try {
    assert.equal(shouldUseClientStructuredOutput('codex-cli'), true);
    assert.equal(shouldUseClientStructuredOutput('opencode-cli'), false);
    assert.equal(await createClientStructuredOutputTempDir('opencode-cli'), null);

    const codexOutput = buildClientStructuredOutputOptions({
      clientId: 'codex-cli',
      tempDir,
      schemaPath: 'schema.json',
      lastMessagePath: 'last-message.json',
    });
    assert.deepEqual(codexOutput, {
      schemaPath: 'schema.json',
      lastMessagePath: 'last-message.json',
      color: 'never',
    });
    assert.equal(buildClientStructuredOutputOptions({ clientId: 'opencode-cli', tempDir }), null);
  } finally {
    await cleanupClientStructuredOutputTempDir(tempDir);
  }
});

test('one-shot subagent invocation strategies cover every harness client', () => {
  const adapters = {
    buildClaudeUnattendedArgs: () => ['--claude-unattended'],
    buildGeminiUnattendedArgs: () => ['--gemini-yolo'],
    buildCodexConfigArgs: () => ['-c', 'mcp_servers={}'],
    buildCodexUnattendedArgs: () => ['--codex-unattended'],
  };
  const common = {
    systemText: 'system',
    promptText: 'prompt',
    routedExtraArgs: ['-m', 'model-a'],
    codexOutput: {
      schemaPath: 'schema.json',
      lastMessagePath: 'last-message.json',
      color: 'never',
    },
    adapters,
  };

  assert.deepEqual(buildOneShotInvocation({ clientId: 'claude-code', ...common }), {
    runner: 'spawn',
    args: ['-m', 'model-a', '--claude-unattended', '--print', '--append-system-prompt', 'system', 'prompt'],
  });
  assert.deepEqual(buildOneShotInvocation({ clientId: 'gemini-cli', ...common }), {
    runner: 'spawn',
    args: ['-m', 'model-a', '--gemini-yolo', '-p', 'system\n\n## New User Request\nprompt'],
  });
  assert.deepEqual(buildOneShotInvocation({ clientId: 'opencode-cli', ...common }), {
    runner: 'spawn',
    args: ['run', '--agent', 'aios-build', '-m', 'model-a', 'system\n\n## New User Request\nprompt'],
  });
  assert.deepEqual(buildOneShotInvocation({ clientId: 'codex-cli', ...common }), {
    runner: 'codex-exec',
    fullPrompt: 'system\n\n## New User Request\nprompt',
    codexConfigArgs: ['-c', 'mcp_servers={}'],
    codexUnattendedArgs: ['--codex-unattended'],
    routedExtraArgs: ['-m', 'model-a'],
    structuredFlags: ['--output-schema', 'schema.json', '--output-last-message', 'last-message.json', '--color', 'never'],
    args: [
      'exec',
      '--codex-unattended',
      '-c',
      'mcp_servers={}',
      '-m',
      'model-a',
      '--output-schema',
      'schema.json',
      '--output-last-message',
      'last-message.json',
      '--color',
      'never',
      '-',
    ],
  });
});

test('runOneShot records the final Codex fallback argv for managed provenance', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'aios-codex-final-argv-'));
  const binDir = path.join(tempDir, 'bin');
  const argsLogPath = path.join(tempDir, 'argv.jsonl');

  try {
    await writeFallbackCodexCommand(binDir, argsLogPath);
    const result = await runOneShot('codex-cli', {
      systemPrompt: 'system instruction',
      userPrompt: 'user request',
      codexOutput: {
        schemaPath: path.join(tempDir, 'schema.json'),
        lastMessagePath: path.join(tempDir, 'last-message.json'),
        color: 'never',
      },
      env: {
        ...process.env,
        PATH: `${binDir}${path.delimiter}${process.env.PATH || ''}`,
      },
    });

    assert.equal(result.exitCode, 0, result.error || result.stderr);
    const attempts = (await readFile(argsLogPath, 'utf8'))
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    assert.equal(attempts.length, 2);
    assert.equal(attempts[0].includes('--output-schema'), true);
    assert.equal(attempts[1].includes('--output-schema'), false);
    assert.deepEqual(result.managedInvocation.args, attempts[1]);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('runOneShot records the successful primary Codex argv for managed provenance', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'aios-codex-primary-argv-'));
  const binDir = path.join(tempDir, 'bin');
  const argsLogPath = path.join(tempDir, 'argv.jsonl');

  try {
    await writeFallbackCodexCommand(binDir, argsLogPath);
    const result = await runOneShot('codex-cli', {
      systemPrompt: 'system instruction',
      userPrompt: 'user request',
      env: {
        ...process.env,
        PATH: `${binDir}${path.delimiter}${process.env.PATH || ''}`,
      },
    });

    assert.equal(result.exitCode, 0, result.error || result.stderr);
    const attempts = (await readFile(argsLogPath, 'utf8'))
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    assert.equal(attempts.length, 1);
    assert.deepEqual(result.managedInvocation.args, attempts[0]);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
