/* 中文注释：Interception 回归测试覆盖压缩、召回、指标和客户端配置，防止链路退化成 prompt-only。 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { chmod, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { compressPreSendTurn } from '../lib/interception/index.mjs';
import { buildClaudePreToolUseRewriteResponse, rewriteShellCommand } from '../lib/interception/index.mjs';
import { decodeEnvelope } from '../lib/interception/core/envelope.mjs';

const cli = path.join(process.cwd(), 'scripts', 'aios.mjs');

function shellArg(value = '') {
  const text = String(value ?? '');
  if (/^[A-Za-z0-9_./:@=-]+$/u.test(text)) return text;
  return `'${text.replace(/'/g, "'\\''")}'`;
}

function interceptPrefix(rootDir = process.cwd()) {
  return `node ${shellArg(path.join(rootDir, 'scripts', 'aios-intercept.mjs'))} shell`;
}

function decodeEnvelopeFromWrappedCommand(command) {
  const match = String(command || '').match(/\s--envelope\s+([A-Za-z0-9_-]+)/u);
  assert.ok(match, `expected wrapped command to use --envelope: ${command}`);
  return decodeEnvelope(match[1]);
}

function runAios(args, env = {}) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

test('interception proof command emits savings and capability matrix', async () => {
  const sessionId = `proof-cli-${Date.now()}`;
  const result = runAios(['interception', 'proof', '--session', sessionId, '--json']);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.metrics.records, 2);
  assert.equal(parsed.metrics.total_saved_bytes > 0, true);
  assert.equal(parsed.metrics.raw_contains_sentinel, false);
  assert.equal(parsed.capability_matrix.some((item) => item.client === 'aios-harness' && item.targetLevel === 'L3'), true);
  assert.equal(parsed.turn_compression_matrix.ok, true);
  assert.equal(parsed.turn_compression_matrix.clients.length, parsed.capability_matrix.length);
  for (const client of parsed.turn_compression_matrix.clients) {
    assert.equal(client.compliance_status, 'compliant');
    assert.equal(client.direct_host_bypass_allowed, false);
    assert.equal(client.pre_send.saved_bytes > 0, true, `${client.client_id} pre_send metric missing`);
    assert.equal(client.post_receive.saved_bytes > 0, true, `${client.client_id} post_receive metric missing`);
  }
});

test('interception doctor and mcp migration keep browser MCP proxied', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'aios-interception-doctor-'));
  await mkdir(path.join(workspaceRoot, 'config'), { recursive: true });
  await copyFile(
    path.join(process.cwd(), 'config', 'host-capabilities.json'),
    path.join(workspaceRoot, 'config', 'host-capabilities.json')
  );
  await writeFile(
    path.join(workspaceRoot, '.mcp.json'),
    `${JSON.stringify({
      mcpServers: {
        'mcp-browser-use': {
          type: 'stdio',
          command: process.execPath,
          args: [
            path.join(process.cwd(), 'scripts', 'aios-mcp-proxy.mjs'),
            '--workspace', workspaceRoot,
            '--host', 'mcp-browser-use',
            '--', process.execPath, 'browser-use.mjs',
          ],
        },
      },
    }, null, 2)}\n`,
    'utf8'
  );
  const env = { AIOS_HOME: path.join(workspaceRoot, 'home') };
  const result = runAios(['interception', 'doctor', '--fix', '--workspace', workspaceRoot, '--json'], env);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.mcp_proxy.ok, true);
  assert.equal(parsed.proof.metrics.records, 2);
  assert.equal(parsed.proof.turn_compression_matrix.ok, true);
  assert.equal(parsed.proof.turn_compression_matrix.clients.length, parsed.capability_matrix.length);
  assert.equal(parsed.targets_after.some((item) => item.client === 'project' && item.proxied), true);

  const mcpRaw = await readFile(path.join(workspaceRoot, '.mcp.json'), 'utf8');
  assert.match(mcpRaw, /aios-mcp-proxy\.mjs/);
});

test('interception tail --latest returns the newest proof session with recent pre/post metrics', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'aios-interception-tail-'));
  const sessionId = `tail-cli-${Date.now()}`;

  try {
    await mkdir(path.join(workspaceRoot, 'config'), { recursive: true });
    await copyFile(
      path.join(process.cwd(), 'config', 'host-capabilities.json'),
      path.join(workspaceRoot, 'config', 'host-capabilities.json')
    );

    const proof = runAios(['interception', 'proof', '--session', sessionId, '--workspace', workspaceRoot, '--json']);
    assert.equal(proof.status, 0, proof.stderr || proof.stdout);

    const tail = runAios(['interception', 'tail', '--latest', '--workspace', workspaceRoot, '--json']);
    assert.equal(tail.status, 0, tail.stderr || tail.stdout);
    const parsed = JSON.parse(tail.stdout);

    assert.equal(parsed.ok, true);
    assert.equal(parsed.session_id, sessionId);
    assert.equal(parsed.total_records > 0, true);
    assert.equal(parsed.recent.some((record) => record.event_kind === 'pre_send'), true);
    assert.equal(parsed.recent.some((record) => record.event_kind === 'post_receive'), true);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test('interception doctor --enforce-turns fails when selected metrics lack post_receive', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'aios-interception-enforce-turns-'));
  const sessionId = `missing-post-${Date.now()}`;

  try {
    await mkdir(path.join(workspaceRoot, 'config'), { recursive: true });
    await copyFile(
      path.join(process.cwd(), 'config', 'host-capabilities.json'),
      path.join(workspaceRoot, 'config', 'host-capabilities.json')
    );

    await compressPreSendTurn({
      workspaceRoot,
      cwd: workspaceRoot,
      sessionId,
      clientId: 'codex-cli',
      hostLevel: 'L2',
      prompt: 'PRE_SEND_ONLY_SENTINEL'.repeat(120),
      mode: 'tight',
      thresholds: { minRawBytes: 64 },
      metrics: { enabled: true },
    });

    const result = runAios(['interception', 'doctor', '--workspace', workspaceRoot, '--session', sessionId, '--enforce-turns', '--json']);
    assert.notEqual(result.status, 0, result.stderr || result.stdout);
    const parsed = JSON.parse(result.stdout);

    assert.equal(parsed.ok, false);
    assert.equal(parsed.turn_compliance.enforced, true);
    assert.equal(parsed.turn_compliance.session_id, sessionId);
    assert.equal(parsed.turn_compliance.pre_send, 1);
    assert.equal(parsed.turn_compliance.post_receive, 0);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test('rewriteShellCommand rewrites common noisy commands and compound commands', () => {
  const gitStatus = rewriteShellCommand('git status --short');
  assert.equal(gitStatus.action, 'rewrite');
  assert.equal(gitStatus.rewrittenCommand, 'node scripts/aios-intercept.mjs shell -- git status --short');
  assert.equal(gitStatus.strategy, 'aios-shell-command-wrapper');

  const compound = rewriteShellCommand('git status && npm test');
  assert.equal(compound.action, 'rewrite');
  assert.equal(compound.rewrittenCommand, 'node scripts/aios-intercept.mjs shell -- git status && node scripts/aios-intercept.mjs shell -- npm test');

  const fallback = rewriteShellCommand('git status || npm test');
  assert.equal(fallback.action, 'rewrite');
  assert.equal(fallback.rewrittenCommand, 'node scripts/aios-intercept.mjs shell -- git status || node scripts/aios-intercept.mjs shell -- npm test');

  const partialWrapped = rewriteShellCommand('git status && node scripts/aios-intercept.mjs shell -- npm test');
  assert.equal(partialWrapped.action, 'rewrite');
  assert.equal(partialWrapped.rewrittenCommand, 'node scripts/aios-intercept.mjs shell -- git status && node scripts/aios-intercept.mjs shell -- npm test');

  const wrappedFirst = rewriteShellCommand('node scripts/aios-intercept.mjs shell -- git status && npm test');
  assert.equal(wrappedFirst.action, 'rewrite');
  assert.equal(wrappedFirst.rewrittenCommand, 'node scripts/aios-intercept.mjs shell -- git status && node scripts/aios-intercept.mjs shell -- npm test');

  const quotedSeparator = rewriteShellCommand('git commit -m "fix && test"');
  assert.equal(quotedSeparator.action, 'rewrite');
  assert.equal(quotedSeparator.rewrittenCommand, 'node scripts/aios-intercept.mjs shell -- git commit -m "fix && test"');

  const quotedCommandLikeSeparator = rewriteShellCommand('git commit -m "fix && npm test"');
  assert.equal(quotedCommandLikeSeparator.action, 'rewrite');
  assert.equal(quotedCommandLikeSeparator.rewrittenCommand, 'node scripts/aios-intercept.mjs shell -- git commit -m "fix && npm test"');

  const singleQuotedSeparator = rewriteShellCommand("git commit -m 'fix || rg docs'");
  assert.equal(singleQuotedSeparator.action, 'rewrite');
  assert.equal(singleQuotedSeparator.rewrittenCommand, "node scripts/aios-intercept.mjs shell -- git commit -m 'fix || rg docs'");

  const semicolonInQuotes = rewriteShellCommand('git commit -m "fix; npm test"');
  assert.equal(semicolonInQuotes.action, 'rewrite');
  assert.equal(semicolonInQuotes.rewrittenCommand, 'node scripts/aios-intercept.mjs shell -- git commit -m "fix; npm test"');

  const passthroughWithQuotedSeparator = rewriteShellCommand('echo "x && git status"');
  assert.equal(passthroughWithQuotedSeparator.action, 'passthrough');
  assert.equal(passthroughWithQuotedSeparator.reason, 'no command rewrite rule matched');

  const alreadyWrapped = rewriteShellCommand('node scripts/aios-intercept.mjs shell -- git status');
  assert.equal(alreadyWrapped.action, 'passthrough');
  assert.equal(alreadyWrapped.reason, 'already routed through AIOS interception');
});

test('rewriteShellCommand avoids shell constructs where compact JSON would change semantics', () => {
  for (const command of [
    'git diff > patch.diff',
    'git status | head',
    'git log $(git rev-parse --abbrev-ref HEAD)',
    'git show "$(git rev-parse HEAD)"',
    'git show `git rev-parse HEAD`',
    'git status\nnpm test',
    'git status & npm test',
  ]) {
    const decision = rewriteShellCommand(command);
    assert.equal(decision.action, 'passthrough', command);
    assert.equal(decision.reason, 'unsupported shell construct');
  }
});

test('rewriteShellCommand leaves sensitive outbound package commands to host permissions', () => {
  for (const command of ['git push origin main', 'npm publish']) {
    const decision = rewriteShellCommand(command);
    assert.equal(decision.action, 'passthrough', command);
    assert.equal(decision.reason, 'sensitive command requires host permission review');
  }
});

test('Claude PreToolUse hook response updates Bash command without forcing host allow', () => {
  const response = buildClaudePreToolUseRewriteResponse({
    tool_name: 'Bash',
    tool_input: { command: 'git diff' },
  });

  assert.equal(response.ok, true);
  assert.equal(response.response.hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.equal(response.response.hookSpecificOutput.permissionDecision, undefined);
  assert.equal(response.response.hookSpecificOutput.permissionDecisionReason, undefined);
  const envelope = decodeEnvelopeFromWrappedCommand(response.response.hookSpecificOutput.updatedInput.command);
  assert.equal(envelope.command, 'git diff');
  assert.deepEqual(envelope.args || [], []);

  const noMatch = buildClaudePreToolUseRewriteResponse({
    tool_name: 'Read',
    tool_input: { file_path: 'README.md' },
  });
  assert.equal(noMatch.ok, true);
  assert.deepEqual(noMatch.response, {});
  assert.equal(noMatch.decision.action, 'passthrough');
});

test('Claude PreToolUse hook preserves shell command string semantics in envelopes', () => {
  for (const command of ['NODE_ENV=test npm test', "cat 'a b.txt'"]) {
    const response = buildClaudePreToolUseRewriteResponse({
      tool_name: 'Bash',
      tool_input: { command },
    });

    assert.equal(response.ok, true);
    const envelope = decodeEnvelopeFromWrappedCommand(response.response.hookSpecificOutput.updatedInput.command);
    assert.equal(envelope.command, command);
    assert.deepEqual(envelope.args || [], []);
  }
});

test('interception rewrite CLI prints text and Claude hook JSON', () => {
  const text = runAios(['interception', 'rewrite', '--command', 'git status --short']);
  assert.equal(text.status, 0, text.stderr || text.stdout);
  assert.equal(text.stdout.trim(), `${interceptPrefix()} -- git status --short`);

  const hookInput = JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'npm test' } });
  const hook = runAios(['interception', 'rewrite', '--hook', 'claude', '--input', hookInput, '--json']);
  assert.equal(hook.status, 0, hook.stderr || hook.stdout);
  const parsed = JSON.parse(hook.stdout);
  const envelope = decodeEnvelopeFromWrappedCommand(parsed.hookSpecificOutput.updatedInput.command);
  assert.equal(parsed.hookSpecificOutput.permissionDecision, undefined);
  assert.equal(envelope.command, 'npm test');
});

test('Claude hook script emits host protocol JSON directly', () => {
  if (process.platform === 'win32') {
    test.skip('POSIX shell hook script is validated through an explicit bash launcher on Windows');
    return;
  }
  const result = spawnSync('scripts/hooks/claude/aios-rewrite.sh', {
    cwd: process.cwd(),
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git status --short' } }),
    encoding: 'utf8',
    env: { ...process.env, AIOS_ROOT_DIR: process.cwd() },
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const parsed = JSON.parse(result.stdout);
  const envelope = decodeEnvelopeFromWrappedCommand(parsed.hookSpecificOutput.updatedInput.command);
  assert.equal(parsed.hookSpecificOutput.permissionDecision, undefined);
  assert.equal(envelope.command, 'git status --short');
});

test('Claude hook script emits host protocol JSON through bash on Windows-compatible shells', async () => {
  const bashProbe = spawnSync('bash', ['--version'], { encoding: 'utf8' });
  if (bashProbe.status !== 0) {
    test.skip('bash is not available in this environment');
    return;
  }
  const hookPath = path.join(process.cwd(), 'scripts', 'hooks', 'claude', 'aios-rewrite.sh');
  await chmod(hookPath, 0o755).catch(() => {});
  const result = spawnSync('bash', [hookPath], {
    cwd: process.cwd(),
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git status --short' } }),
    encoding: 'utf8',
    env: { ...process.env, AIOS_ROOT_DIR: process.cwd() },
  });

  if (result.error?.code === 'ENOENT') {
    test.skip('bash is not available in this environment');
    return;
  }

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const parsed = JSON.parse(result.stdout);
  const envelope = decodeEnvelopeFromWrappedCommand(parsed.hookSpecificOutput.updatedInput.command);
  assert.equal(parsed.hookSpecificOutput.permissionDecision, undefined);
  assert.equal(envelope.command, 'git status --short');
});

test('aios-intercept shell shorthand preserves failing command exit status', () => {
  const result = spawnSync(process.execPath, ['scripts/aios-intercept.mjs', 'shell', '--', 'node', '-e', 'process.exit(7)'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });

  assert.equal(result.status, 7, result.stderr || result.stdout);
  const packet = JSON.parse(result.stdout);
  assert.equal(packet.source, 'shell');
  assert.equal(packet.safety.requires_human, true);
});
