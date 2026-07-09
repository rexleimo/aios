import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmod, mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  classifyOneShotFailure,
  resolveRoutedSubagentClient,
  resolveTaskRouteDecision,
} from '../ctx-agent-core.mjs';
import { runContextDbCli } from '../lib/contextdb-cli.mjs';

const CTX_AGENT_CLI = path.resolve('scripts', 'ctx-agent.mjs');
const AIOS_CLI = path.resolve('scripts', 'aios.mjs');

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function formatPreviewArg(value = '') {
  const text = String(value ?? '');
  return /^[A-Za-z0-9_./:@=-]+$/u.test(text)
    ? text
    : `"${text.replace(/(["`$])/g, '\\$1')}"`;
}

async function createFakeCliCommand(commandName, marker) {
  const binDir = await mkdtemp(path.join(os.tmpdir(), 'aios-ctx-agent-bin-'));
  const markerLiteral = JSON.stringify(marker);

  if (process.platform === 'win32') {
    const script = path.join(binDir, `${commandName}-fake.mjs`);
    await writeFile(
      script,
      `process.stdout.write(JSON.stringify({ marker: ${markerLiteral}, argv: process.argv.slice(2) }) + "\\n");\n`,
      'utf8'
    );
    const shim = path.join(binDir, `${commandName}.cmd`);
    await writeFile(shim, `@echo off\r\nnode "${script}" %*\r\n`, 'utf8');
    return binDir;
  }

  const file = path.join(binDir, commandName);
  await writeFile(
    file,
    `#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify({ marker: ${markerLiteral}, argv: process.argv.slice(2) }) + "\\n");\n`,
    'utf8'
  );
  await chmod(file, 0o755);
  return binDir;
}

async function createFakeCodexCommand(marker = 'FAKE_CODEX_OK') {
  return createFakeCliCommand('codex', marker);
}

async function createFakeClaudeCommand(marker = 'FAKE_CLAUDE_OK') {
  return createFakeCliCommand('claude', marker);
}

async function createFakeGeminiCommand(marker = 'FAKE_GEMINI_OK') {
  return createFakeCliCommand('gemini', marker);
}

async function createFakeOpenCodeCommand(marker = 'FAKE_OPENCODE_OK') {
  return createFakeCliCommand('opencode', marker);
}

async function createFakeHermesCommand(marker = 'FAKE_HERMES_OK') {
  return createFakeCliCommand('hermes', marker);
}

async function createFakeUnresolvableWindowsOpenCodeCommand(marker = 'FAKE_OPENCODE_SHELL_FALLBACK') {
  const binDir = await mkdtemp(path.join(os.tmpdir(), 'aios-ctx-agent-opencode-shell-'));
  const markerLiteral = JSON.stringify(marker);
  const script = path.join(binDir, 'opencode-fake.mjs');
  await writeFile(
    script,
    `process.stdout.write(JSON.stringify({ marker: ${markerLiteral}, argv: process.argv.slice(2) }) + "\\n");\n`,
    'utf8'
  );
  await writeFile(
    path.join(binDir, 'opencode.cmd'),
    `@echo off\r\nnode ${script} %*\r\n`,
    'utf8'
  );
  return binDir;
}

function parseLastJsonPayload(stdout) {
  const line = String(stdout || '').trim().split(/\r?\n/).at(-1) || '{}';
  return JSON.parse(line);
}

async function pathExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') return false;
    throw error;
  }
}

test('classifyOneShotFailure recognizes timeout-like failures', () => {
  assert.equal(classifyOneShotFailure('Request timed out after 30s'), 'timeout');
});

test('classifyOneShotFailure falls back to tool for generic failures', () => {
  assert.equal(classifyOneShotFailure('Unhandled exit=1'), 'tool');
});

test('ctx-agent legacy Stop hook checkpoint-status writes checkpoint without launching claude', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'aios-ctx-agent-legacy-stop-hook-'));
  const fakeClaudeBin = await createFakeClaudeCommand('FAKE_CLAUDE_SHOULD_NOT_RUN');

  try {
    const result = spawnSync(
      process.execPath,
      [
        CTX_AGENT_CLI,
        '--agent', 'claude-code',
        '--workspace', workspaceRoot,
        '--project', 'legacy-stop-hook',
        '--checkpoint-status', 'completed',
        '--no-bootstrap',
      ],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${fakeClaudeBin}${path.delimiter}${process.env.PATH || ''}`,
        },
      }
    );

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /FAKE_CLAUDE_SHOULD_NOT_RUN/u);

    const latest = runContextDbCli(
      ['session:latest', '--workspace', workspaceRoot, '--agent', 'claude-code', '--project', 'legacy-stop-hook'],
      { cwd: workspaceRoot }
    );
    const sessionId = latest?.session?.sessionId;
    assert.ok(sessionId, 'expected save guard to create or reuse a session');

    const checkpointsPath = path.join(workspaceRoot, '.aios', 'context-db', 'sessions', sessionId, 'l1-checkpoints.jsonl');
    const checkpointLines = (await readFile(checkpointsPath, 'utf8')).trim().split(/\r?\n/u);
    const latestCheckpoint = JSON.parse(checkpointLines.at(-1));
    assert.equal(latestCheckpoint.status, 'done');
    assert.match(latestCheckpoint.summary, /Stop hook completed/u);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
    await rm(fakeClaudeBin, { recursive: true, force: true });
  }
});

test('resolveTaskRouteDecision honors explicit prompt route triggers', () => {
  const team = resolveTaskRouteDecision({
    prompt: '/team 同时改 CLI、测试和文档',
    routeMode: 'auto',
  });
  assert.equal(team.routeMode, 'team');
  assert.equal(team.taskPrompt, '同时改 CLI、测试和文档');
  assert.equal(team.explicitTrigger, true);

  const subagent = resolveTaskRouteDecision({
    prompt: '/subagent 修复回归并走预检',
    routeMode: 'single',
  });
  assert.equal(subagent.routeMode, 'subagent');
  assert.equal(subagent.taskPrompt, '修复回归并走预检');
  assert.equal(subagent.explicitTrigger, true);

  const harness = resolveTaskRouteDecision({
    prompt: '/harness 过夜整理明早交接清单',
    routeMode: 'auto',
  });
  assert.equal(harness.routeMode, 'harness');
  assert.equal(harness.taskPrompt, '过夜整理明早交接清单');
  assert.equal(harness.explicitTrigger, true);
});

test('resolveTaskRouteDecision auto-routes complex prompts to team', () => {
  const decision = resolveTaskRouteDecision({
    routeMode: 'auto',
    prompt: [
      '我们要并行推进一个多模块交付：',
      '1. frontend 页面改版并补测试',
      '2. backend API 改造和数据库迁移',
      '3. 文档与发布清单同步',
    ].join('\n'),
  });
  assert.equal(decision.routeMode, 'team');
  assert.equal(decision.explicitTrigger, false);
});

test('resolveTaskRouteDecision auto-routes medium complexity prompts to subagent', () => {
  const decision = resolveTaskRouteDecision({
    routeMode: 'auto',
    prompt: [
      '请完成以下任务：',
      '1. 修复登录重试逻辑',
      '2. 增加测试并更新文档',
    ].join('\n'),
  });
  assert.equal(decision.routeMode, 'subagent');
  assert.equal(decision.explicitTrigger, false);
});

test('resolveTaskRouteDecision auto-routes long-running resumable prompts to harness', () => {
  const decision = resolveTaskRouteDecision({
    routeMode: 'auto',
    prompt: '请过夜持续推进这个长任务，保留 checkpoint 和明早交接 journal',
  });
  assert.equal(decision.routeMode, 'harness');
  assert.equal(decision.explicitTrigger, false);
  assert.match(decision.reason, /harness keyword signal/u);
});

test('resolveRoutedSubagentClient falls back to provider-supported runtimes', () => {
  assert.equal(
    resolveRoutedSubagentClient({ agent: 'codex-cli', teamProvider: 'auto', env: {} }),
    'codex-cli'
  );
  assert.equal(
    resolveRoutedSubagentClient({ agent: 'claude-code', teamProvider: 'auto', env: {} }),
    'claude-code'
  );
  assert.equal(
    resolveRoutedSubagentClient({ agent: 'gemini-cli', teamProvider: 'auto', env: {} }),
    'gemini-cli'
  );
  assert.equal(
    resolveRoutedSubagentClient({ agent: 'opencode-cli', teamProvider: 'auto', env: {} }),
    'opencode-cli'
  );
  assert.equal(
    resolveRoutedSubagentClient({ agent: 'opencode-cli', teamProvider: 'claude', env: {} }),
    'opencode-cli'
  );
  assert.equal(
    resolveRoutedSubagentClient({
      agent: 'opencode-cli',
      teamProvider: 'auto',
      env: { CTXDB_ROUTE_SUBAGENT_CLIENT: 'gemini-cli' },
    }),
    'gemini-cli'
  );
});

test('ctx-agent one-shot does not inject persona or user profile overlays', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'aios-ctx-agent-persona-overlay-'));
  const sessionId = 'ctx-persona-overlay';
  const identityHome = path.join(workspaceRoot, '.identity');

  try {
    runContextDbCli([
      'session:new',
      '--workspace',
      workspaceRoot,
      '--agent',
      'codex-cli',
      '--project',
      'tmp-project',
      '--goal',
      'Verify persona overlay injection',
      '--session-id',
      sessionId,
    ]);

    await mkdir(identityHome, { recursive: true });
    await writeFile(path.join(identityHome, 'SOUL.md'), '# persona\nAlways show audit evidence.\n', 'utf8');
    await writeFile(path.join(identityHome, 'USER.md'), '# user\nPrefers concise Chinese output.\n', 'utf8');

    const result = spawnSync(
      process.execPath,
      [
        'scripts/ctx-agent.mjs',
        '--agent',
        'codex-cli',
        '--workspace',
        workspaceRoot,
        '--project',
        'tmp-project',
        '--session',
        sessionId,
        '--prompt',
        'summarize',
        '--dry-run',
        '--no-bootstrap',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: {
          ...process.env,
          AIOS_IDENTITY_HOME: identityHome,
        },
      }
    );

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stderr, /Context: none \(no prompt injection\)/);
    assert.doesNotMatch(result.stdout, /Always show audit evidence\./);
    assert.doesNotMatch(result.stdout, /Prefers concise Chinese output\./);
    assert.equal(await pathExists(path.join(workspaceRoot, '.aios', 'context-db', 'exports', 'latest-codex-cli-context.md')), false);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test('ctx-agent one-shot does not initialize workspace memory layers', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'aios-ctx-agent-workspace-memory-init-'));
  const sessionId = 'ctx-workspace-memory-init';

  try {
    runContextDbCli([
      'session:new',
      '--workspace',
      workspaceRoot,
      '--agent',
      'codex-cli',
      '--project',
      'tmp-project',
      '--goal',
      'Verify workspace memory init',
      '--session-id',
      sessionId,
    ]);

    const result = spawnSync(
      process.execPath,
      [
        'scripts/ctx-agent.mjs',
        '--agent',
        'codex-cli',
        '--workspace',
        workspaceRoot,
        '--project',
        'tmp-project',
        '--session',
        sessionId,
        '--prompt',
        'summarize',
        '--dry-run',
        '--no-bootstrap',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: process.env,
      }
    );

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(await pathExists(path.join(workspaceRoot, '.aios', 'context-db', 'sessions', 'workspace-memory--default', 'meta.json')), false);
    assert.equal(await pathExists(path.join(workspaceRoot, '.aios', 'context-db', 'sessions', 'workspace-memory--[object-object]', 'meta.json')), false);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test('ctx-agent one-shot does not run context:pack or write context packet exports', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'aios-ctx-agent-pack-fail-'));
  const sessionId = 'ctx-pack-failure';

  try {
    runContextDbCli([
      'session:new',
      '--workspace',
      workspaceRoot,
      '--agent',
      'codex-cli',
      '--project',
      'tmp-project',
      '--goal',
      'Verify ctx-agent pack fail-open',
      '--session-id',
      sessionId,
    ]);

    // Remove the L0 summary so context:pack fails on the first attempt.
    await rm(
      path.join(workspaceRoot, '.aios', 'context-db', 'sessions', sessionId, 'l0-summary.md'),
      { force: true }
    );

    const result = spawnSync(
      process.execPath,
      [
        'scripts/ctx-agent.mjs',
        '--agent',
        'codex-cli',
        '--workspace',
        workspaceRoot,
        '--project',
        'tmp-project',
        '--session',
        sessionId,
        '--prompt',
        'smoke',
        '--dry-run',
        '--no-bootstrap',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: {
          ...process.env,
        },
      }
    );

    assert.equal(result.status, 0);
    assert.match(result.stdout, /\[dry-run\]/);
    assert.doesNotMatch(result.stderr, /contextdb context:pack failed/i);
    assert.equal(await pathExists(path.join(workspaceRoot, '.aios', 'context-db', 'sessions', sessionId, 'l0-summary.md')), true);
    assert.equal(await pathExists(path.join(workspaceRoot, '.aios', 'context-db', 'exports', `${sessionId}-context.md`)), false);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test('ctx-agent one-shot writes turn envelope metadata for prompt/response events', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'aios-ctx-agent-turn-envelope-'));
  const sessionId = 'ctx-turn-envelope';

  try {
    runContextDbCli([
      'session:new',
      '--workspace',
      workspaceRoot,
      '--agent',
      'codex-cli',
      '--project',
      'tmp-project',
      '--goal',
      'Verify one-shot turn envelope logging',
      '--session-id',
      sessionId,
    ]);

    const result = spawnSync(
      process.execPath,
      [
        'scripts/ctx-agent.mjs',
        '--agent',
        'codex-cli',
        '--workspace',
        workspaceRoot,
        '--project',
        'tmp-project',
        '--session',
        sessionId,
        '--prompt',
        'turn envelope smoke',
        '--dry-run',
        '--no-bootstrap',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      }
    );

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const eventsPath = path.join(workspaceRoot, '.aios', 'context-db', 'sessions', sessionId, 'l2-events.jsonl');
    const rows = (await stat(eventsPath)).isFile()
      ? (await readFile(eventsPath, 'utf8'))
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => JSON.parse(line))
      : [];

    assert.equal(rows.length >= 2, true);
    const promptEvent = rows[rows.length - 2];
    const responseEvent = rows[rows.length - 1];

    assert.equal(promptEvent.role, 'user');
    assert.equal(promptEvent.kind, 'prompt');
    assert.equal(promptEvent.turn?.turnType, 'main');
    assert.equal(promptEvent.turn?.environment, 'cli');
    assert.equal(promptEvent.turn?.hindsightStatus, 'pending');
    assert.match(String(promptEvent.turn?.turnId || ''), /:prompt$/);

    assert.equal(responseEvent.role, 'assistant');
    assert.equal(responseEvent.kind, 'response');
    assert.equal(responseEvent.turn?.turnType, 'main');
    assert.equal(responseEvent.turn?.environment, 'cli');
    assert.equal(responseEvent.turn?.hindsightStatus, 'evaluated');
    assert.equal(responseEvent.turn?.outcome, 'success');
    assert.equal(responseEvent.turn?.parentTurnId, promptEvent.turn?.turnId);
    assert.match(String(responseEvent.turn?.turnId || ''), /:response$/);

    const continuityPath = path.join(workspaceRoot, '.aios', 'context-db', 'sessions', sessionId, 'continuity.json');
    const continuitySummaryPath = path.join(workspaceRoot, '.aios', 'context-db', 'sessions', sessionId, 'continuity-summary.md');
    const continuity = JSON.parse(await readFile(continuityPath, 'utf8'));
    const continuitySummary = await readFile(continuitySummaryPath, 'utf8');
    assert.equal(continuity.schemaVersion, 1);
    assert.equal(continuity.sessionId, sessionId);
    assert.match(continuity.intent, /turn envelope smoke/);
    assert.match(continuity.summary, /one-shot run completed/);
    assert.deepEqual(continuity.nextActions, ['Review response', 'Continue with next prompt']);
    assert.match(continuitySummary, /# Continuity Summary/);
    assert.match(continuitySummary, /turn envelope smoke/);
    assert.equal(await pathExists(path.join(workspaceRoot, '.aios', 'context-db', 'exports', `${sessionId}-context.md`)), false);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});



test('ctx-agent one-shot compresses prompt before client stdin and compacts received output', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'aios-ctx-agent-turn-compress-'));
  const binDir = await mkdtemp(path.join(os.tmpdir(), 'aios-ctx-agent-turn-bin-'));
  const sessionId = 'ctx-turn-compress';
  const capturePath = path.join(workspaceRoot, 'captured-stdin.txt');
  const PRE_SENTINEL = 'CTX_AGENT_PRE_SEND_SENTINEL';
  const POST_SENTINEL = 'CTX_AGENT_POST_RECEIVE_SENTINEL';

  try {
    const fakeCodex = path.join(binDir, process.platform === 'win32' ? 'codex-fake.mjs' : 'codex');
    await writeFile(fakeCodex, `#!/usr/bin/env node\nimport { readFileSync, writeFileSync } from 'node:fs';\nconst input = readFileSync(0, 'utf8');\nwriteFileSync(process.env.AIOS_TEST_CAPTURE_PATH, input);\nprocess.stdout.write('${POST_SENTINEL}'.repeat(160) + '\\nscripts/lib/ctx-agent-core/run.mjs:211\\n');\n`, 'utf8');
    await chmod(fakeCodex, 0o755);
    if (process.platform === 'win32') {
      await writeFile(path.join(binDir, 'codex.cmd'), `@echo off\r\nnode "${fakeCodex}" %*\r\n`, 'utf8');
    }

    runContextDbCli([
      'session:new',
      '--workspace', workspaceRoot,
      '--agent', 'codex-cli',
      '--project', 'tmp-project',
      '--goal', 'Verify ctx-agent turn compression',
      '--session-id', sessionId,
    ]);

    const result = spawnSync(
      process.execPath,
      [
        'scripts/ctx-agent.mjs',
        '--agent', 'codex-cli',
        '--workspace', workspaceRoot,
        '--project', 'tmp-project',
        '--session', sessionId,
        '--prompt', `${PRE_SENTINEL.repeat(160)}\nscripts/lib/ctx-agent-core/run.mjs:189`,
        '--no-bootstrap',
        '--no-auto-checkpoint',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${binDir}${path.delimiter}${process.env.PATH || ''}`,
          AIOS_TEST_CAPTURE_PATH: capturePath,
        },
      }
    );

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const captured = await readFile(capturePath, 'utf8');
    assert.equal(captured.includes(PRE_SENTINEL), false);
    assert.equal(result.stdout.includes(POST_SENTINEL), false);
    assert.match(result.stdout, /aios\.compact_packet/);
    assert.match(result.stderr, /\[aios\]\[turn-compression\] pre_send client=codex-cli/u);
    assert.match(result.stderr, /\[aios\]\[turn-compression\] post_receive client=codex-cli/u);

    const metricsPath = path.join(workspaceRoot, '.aios', 'interception', 'metrics', `${sessionId}.jsonl`);
    const records = (await readFile(metricsPath, 'utf8')).trim().split(/\r?\n/).map((line) => JSON.parse(line));
    assert.equal(records.some((record) => record.event_kind === 'pre_send' && record.client_id === 'codex-cli'), true);
    assert.equal(records.some((record) => record.event_kind === 'post_receive' && record.client_id === 'codex-cli'), true);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
    await rm(binDir, { recursive: true, force: true });
  }
});

test('ctx-agent one-shot dry-run route harness prints trigger command', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'aios-ctx-agent-route-harness-'));

  try {
    const result = spawnSync(
      process.execPath,
      [
        'scripts/ctx-agent.mjs',
        '--agent',
        'codex-cli',
        '--workspace',
        workspaceRoot,
        '--project',
        'tmp-project',
        '--route',
        'harness',
        '--route-execute',
        'dry-run',
        '--harness-max-iterations',
        '5',
        '--prompt',
        '过夜整理明早交接清单',
        '--dry-run',
        '--no-bootstrap',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      }
    );

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /\[route\] mode=harness/);
    assert.match(result.stdout, /Command: node /u);
    assert.match(
      result.stdout,
      new RegExp(
        `node ${escapeRegExp(formatPreviewArg(AIOS_CLI))} harness run --objective \".+?\" --session codex-cli-[^\\s]+ --provider codex --max-iterations 5 --worktree --workspace ${escapeRegExp(formatPreviewArg(workspaceRoot))}`,
        'u'
      )
    );
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test('ctx-agent one-shot dry-run route team prints trigger command', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'aios-ctx-agent-route-team-'));

  try {
    const result = spawnSync(
      process.execPath,
      [
        'scripts/ctx-agent.mjs',
        '--agent',
        'codex-cli',
        '--workspace',
        workspaceRoot,
        '--project',
        'tmp-project',
        '--route',
        'team',
        '--route-execute',
        'dry-run',
        '--prompt',
        '并行改造 UI、API 和测试',
        '--dry-run',
        '--no-bootstrap',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      }
    );

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /\[route\] mode=team/);
    assert.match(
      result.stdout,
      new RegExp(
        `Command: node ${escapeRegExp(formatPreviewArg(CTX_AGENT_CLI))} --agent codex-cli --workspace ${escapeRegExp(formatPreviewArg(workspaceRoot))} --project tmp-project --session codex-cli-[^\\s]+ --route team --route-execute dry-run --team-provider codex --team-workers 3 --prompt \".+?\" --no-bootstrap`,
        'u'
      )
    );
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test('ctx-agent executes routed team dry-run from a non-AIOS workspace', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'aios-ctx-agent-route-team-live-'));

  try {
    const result = spawnSync(
      process.execPath,
      [
        'scripts/ctx-agent.mjs',
        '--agent',
        'codex-cli',
        '--workspace',
        workspaceRoot,
        '--project',
        'tmp-project',
        '--route',
        'team',
        '--route-execute',
        'dry-run',
        '--prompt',
        '/team smoke',
        '--no-bootstrap',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      }
    );

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /\[ctx-agent route\] mode=team execute=dry-run/u);
    assert.match(result.stdout, /"dispatchRun"/u);
    assert.doesNotMatch(result.stdout, /MODULE_NOT_FOUND/u);
    assert.doesNotMatch(result.stdout, /--preflight requires --session/u);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test('ctx-agent executes routed subagent dry-run from a non-AIOS workspace', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'aios-ctx-agent-route-subagent-live-'));

  try {
    const result = spawnSync(
      process.execPath,
      [
        'scripts/ctx-agent.mjs',
        '--agent',
        'codex-cli',
        '--workspace',
        workspaceRoot,
        '--project',
        'tmp-project',
        '--route',
        'subagent',
        '--route-execute',
        'dry-run',
        '--prompt',
        '/subagent smoke',
        '--no-bootstrap',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      }
    );

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /\[ctx-agent route\] mode=subagent execute=dry-run/u);
    assert.match(result.stdout, /"dispatchRun"/u);
    assert.doesNotMatch(result.stdout, /MODULE_NOT_FOUND/u);
    assert.doesNotMatch(result.stdout, /--preflight requires --session/u);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test('ctx-agent interactive startup does not context:pack before invoking the CLI', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'aios-ctx-agent-pack-interactive-'));
  const sessionId = 'ctx-pack-failure-interactive';
  const fakeBin = await createFakeCodexCommand();

  try {
    runContextDbCli([
      'session:new',
      '--workspace',
      workspaceRoot,
      '--agent',
      'codex-cli',
      '--project',
      'tmp-project',
      '--goal',
      'Verify ctx-agent interactive pack fail-open',
      '--session-id',
      sessionId,
    ]);

    // Remove the L0 summary so context:pack fails on the first attempt.
    await rm(
      path.join(workspaceRoot, '.aios', 'context-db', 'sessions', sessionId, 'l0-summary.md'),
      { force: true }
    );

    const result = spawnSync(
      process.execPath,
      [
        'scripts/ctx-agent.mjs',
        '--agent',
        'codex-cli',
        '--workspace',
        workspaceRoot,
        '--project',
        'tmp-project',
        '--session',
        sessionId,
        '--no-bootstrap',
        '--',
        '--version',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${fakeBin}${path.delimiter}${process.env.PATH || ''}`,
        },
      }
    );

    assert.equal(result.status, 0);
    assert.match(result.stdout, /FAKE_CODEX_OK/);
    assert.doesNotMatch(result.stderr, /contextdb context:pack failed/i);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test('ctx-agent interactive Codex startup passes no implicit prompt', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'aios-ctx-agent-codex-auto-prompt-'));
  const sessionId = 'ctx-codex-auto-prompt';
  const fakeBin = await createFakeCodexCommand();

  try {
    runContextDbCli([
      'session:new',
      '--workspace',
      workspaceRoot,
      '--agent',
      'codex-cli',
      '--project',
      'tmp-project',
      '--goal',
      'Verify codex startup has no implicit prompt',
      '--session-id',
      sessionId,
    ]);

    const result = spawnSync(
      process.execPath,
      [
        'scripts/ctx-agent.mjs',
        '--agent',
        'codex-cli',
        '--workspace',
        workspaceRoot,
        '--project',
        'tmp-project',
        '--session',
        sessionId,
        '--no-bootstrap',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${fakeBin}${path.delimiter}${process.env.PATH || ''}`,
        },
      }
    );

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.doesNotMatch(result.stdout, /Auto prompt: enabled/u);
    const payload = parseLastJsonPayload(result.stdout);
    assert.equal(payload.marker, 'FAKE_CODEX_OK');
    const argv = Array.isArray(payload.argv) ? payload.argv : [];
    assert.equal(argv.includes('--prompt'), false);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test('ctx-agent interactive Codex mode can disable MCP startup via env override', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'aios-ctx-agent-codex-disable-mcp-'));
  const sessionId = 'ctx-codex-disable-mcp';
  const fakeBin = await createFakeCodexCommand();

  try {
    runContextDbCli([
      'session:new',
      '--workspace',
      workspaceRoot,
      '--agent',
      'codex-cli',
      '--project',
      'tmp-project',
      '--goal',
      'Verify codex mcp disable args',
      '--session-id',
      sessionId,
    ]);

    const result = spawnSync(
      process.execPath,
      [
        'scripts/ctx-agent.mjs',
        '--agent',
        'codex-cli',
        '--workspace',
        workspaceRoot,
        '--project',
        'tmp-project',
        '--session',
        sessionId,
        '--no-bootstrap',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: {
          ...process.env,
          CTXDB_CODEX_DISABLE_MCP: '1',
          PATH: `${fakeBin}${path.delimiter}${process.env.PATH || ''}`,
        },
      }
    );

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const payload = parseLastJsonPayload(result.stdout);
    assert.equal(payload.marker, 'FAKE_CODEX_OK');
    const argv = Array.isArray(payload.argv) ? payload.argv : [];
    assert.equal(argv.includes('mcp_servers={}'), true);
    assert.equal(argv.includes('features.rmcp_client=false'), true);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test('ctx-agent interactive Gemini startup passes no implicit prompt', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'aios-ctx-agent-gemini-auto-prompt-'));
  const sessionId = 'ctx-gemini-auto-prompt';
  const fakeBin = await createFakeGeminiCommand();

  try {
    runContextDbCli([
      'session:new',
      '--workspace',
      workspaceRoot,
      '--agent',
      'gemini-cli',
      '--project',
      'tmp-project',
      '--goal',
      'Verify gemini startup has no implicit prompt',
      '--session-id',
      sessionId,
    ]);

    const result = spawnSync(
      process.execPath,
      [
        'scripts/ctx-agent.mjs',
        '--agent',
        'gemini-cli',
        '--workspace',
        workspaceRoot,
        '--project',
        'tmp-project',
        '--session',
        sessionId,
        '--no-bootstrap',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${fakeBin}${path.delimiter}${process.env.PATH || ''}`,
        },
      }
    );

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.doesNotMatch(result.stdout, /Auto prompt: enabled/u);
    const payload = parseLastJsonPayload(result.stdout);
    assert.equal(payload.marker, 'FAKE_GEMINI_OK');
    const argv = Array.isArray(payload.argv) ? payload.argv : [];
    assert.equal(argv.includes('--prompt'), false);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test('ctx-agent interactive Claude mode does not inject context packet as system prompt', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'aios-ctx-agent-claude-interactive-'));
  const sessionId = 'ctx-claude-interactive';
  const fakeBin = await createFakeClaudeCommand();

  try {
    runContextDbCli([
      'session:new',
      '--workspace',
      workspaceRoot,
      '--agent',
      'claude-code',
      '--project',
      'tmp-project',
      '--goal',
      'Verify claude interactive avoids context injection',
      '--session-id',
      sessionId,
    ]);

    const result = spawnSync(
      process.execPath,
      [
        'scripts/ctx-agent.mjs',
        '--agent',
        'claude-code',
        '--workspace',
        workspaceRoot,
        '--project',
        'tmp-project',
        '--session',
        sessionId,
        '--no-bootstrap',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${fakeBin}${path.delimiter}${process.env.PATH || ''}`,
        },
      }
    );

    assert.equal(result.status, 0);
    const lines = result.stdout.trim().split('\n');
    const payload = JSON.parse(lines.at(-1) || '{}');
    assert.equal(payload.marker, 'FAKE_CLAUDE_OK');
    assert.equal(payload.argv.includes('--append-system-prompt'), false);
    assert.equal(payload.argv.some((arg) => String(arg).includes('Continue from this state')), false);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test('ctx-agent interactive Claude startup passes no implicit prompt', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'aios-ctx-agent-claude-auto-prompt-'));
  const sessionId = 'ctx-claude-auto-prompt';
  const fakeBin = await createFakeClaudeCommand();

  try {
    runContextDbCli([
      'session:new',
      '--workspace',
      workspaceRoot,
      '--agent',
      'claude-code',
      '--project',
      'tmp-project',
      '--goal',
      'Verify claude startup has no implicit prompt',
      '--session-id',
      sessionId,
    ]);

    const result = spawnSync(
      process.execPath,
      [
        'scripts/ctx-agent.mjs',
        '--agent',
        'claude-code',
        '--workspace',
        workspaceRoot,
        '--project',
        'tmp-project',
        '--session',
        sessionId,
        '--no-bootstrap',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${fakeBin}${path.delimiter}${process.env.PATH || ''}`,
        },
      }
    );

    assert.equal(result.status, 0);
    const lines = result.stdout.trim().split('\n');
    const payload = JSON.parse(lines.at(-1) || '{}');
    assert.equal(payload.marker, 'FAKE_CLAUDE_OK');
    assert.equal(payload.argv.includes('--append-system-prompt'), false);
    assert.equal(payload.argv.some((arg) => String(arg).includes('--prompt')), false);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test('ctx-agent one-shot OpenCode mode sends only the explicit request', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'aios-ctx-agent-opencode-one-shot-'));
  const sessionId = 'ctx-opencode-one-shot';
  const fakeBin = await createFakeOpenCodeCommand();

  try {
    runContextDbCli([
      'session:new',
      '--workspace',
      workspaceRoot,
      '--agent',
      'opencode-cli',
      '--project',
      'tmp-project',
      '--goal',
      'Verify opencode one-shot explicit request',
      '--session-id',
      sessionId,
    ]);

    const result = spawnSync(
      process.execPath,
      [
        'scripts/ctx-agent.mjs',
        '--agent',
        'opencode-cli',
        '--workspace',
        workspaceRoot,
        '--project',
        'tmp-project',
        '--session',
        sessionId,
        '--prompt',
        'Summarize the current status.',
        '--no-bootstrap',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${fakeBin}${path.delimiter}${process.env.PATH || ''}`,
        },
      }
    );

    assert.equal(result.status, 0);
    const payload = parseLastJsonPayload(result.stdout);
    assert.equal(payload.marker, 'FAKE_OPENCODE_OK');
    assert.equal(payload.argv[0], 'run');
    assert.deepEqual(payload.argv.slice(1, 3), ['--agent', 'aios-build']);
    // single-route always-on planning prepends a lean plan directive, then the user request
    assert.match(payload.argv[3], /AIOS PLAN v2 \(always-on\)/u);
    assert.match(payload.argv[3], /## User request/u);
    assert.match(payload.argv[3], /Summarize the current status\./u);
    assert.doesNotMatch(payload.argv[3], /Read the context packet at/u);
    assert.doesNotMatch(payload.argv[3], /# Context Packet/u);
    assert.equal(await pathExists(path.join(workspaceRoot, '.aios', 'context-db', 'exports', `${sessionId}-context.md`)), false);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test('ctx-agent interactive OpenCode mode does not send context handoff prompt', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'aios-ctx-agent-opencode-interactive-'));
  const sessionId = 'ctx-opencode-interactive';
  const fakeBin = await createFakeOpenCodeCommand();

  try {
    runContextDbCli([
      'session:new',
      '--workspace',
      workspaceRoot,
      '--agent',
      'opencode-cli',
      '--project',
      'tmp-project',
      '--goal',
      'Verify opencode interactive avoids context prompt',
      '--session-id',
      sessionId,
    ]);

    const result = spawnSync(
      process.execPath,
      [
        'scripts/ctx-agent.mjs',
        '--agent',
        'opencode-cli',
        '--workspace',
        workspaceRoot,
        '--project',
        'tmp-project',
        '--session',
        sessionId,
        '--no-bootstrap',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${fakeBin}${path.delimiter}${process.env.PATH || ''}`,
        },
      }
    );

    assert.equal(result.status, 0);
    assert.doesNotMatch(result.stdout, /Auto prompt: enabled/u);
    const payload = parseLastJsonPayload(result.stdout);
    assert.equal(payload.marker, 'FAKE_OPENCODE_OK');
    const argv = Array.isArray(payload.argv) ? payload.argv : [];
    assert.equal(argv.includes('--prompt'), false);
    assert.equal(argv.some((arg) => String(arg).includes('Read the context packet at')), false);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test('ctx-agent interactive Hermes startup invokes hermes instead of OpenCode fallback', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'aios-ctx-agent-hermes-interactive-'));
  const sessionId = 'ctx-hermes-interactive';
  const fakeHermesBin = await createFakeHermesCommand();
  const fakeOpenCodeBin = await createFakeOpenCodeCommand('FAKE_OPENCODE_SHOULD_NOT_RUN');

  try {
    runContextDbCli([
      'session:new',
      '--workspace',
      workspaceRoot,
      '--agent',
      'hermes-agent',
      '--project',
      'tmp-project',
      '--goal',
      'Verify hermes interactive uses hermes command',
      '--session-id',
      sessionId,
    ]);

    const result = spawnSync(
      process.execPath,
      [
        'scripts/ctx-agent.mjs',
        '--agent',
        'hermes-agent',
        '--workspace',
        workspaceRoot,
        '--project',
        'tmp-project',
        '--session',
        sessionId,
        '--no-bootstrap',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${fakeHermesBin}${path.delimiter}${fakeOpenCodeBin}${path.delimiter}${process.env.PATH || ''}`,
        },
      }
    );

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const payload = parseLastJsonPayload(result.stdout);
    assert.equal(payload.marker, 'FAKE_HERMES_OK');
    const argv = Array.isArray(payload.argv) ? payload.argv : [];
    assert.equal(argv.includes('--prompt'), false);
    assert.equal(argv.includes('--agent'), false);
    assert.doesNotMatch(result.stdout, /FAKE_OPENCODE_SHOULD_NOT_RUN/u);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
    await rm(fakeHermesBin, { recursive: true, force: true });
    await rm(fakeOpenCodeBin, { recursive: true, force: true });
  }
});

test('ctx-agent interactive OpenCode Windows shell fallback does not pass injected context as prompt args', async (t) => {
  if (process.platform !== 'win32') {
    t.skip('Windows shell fallback behavior is only meaningful on win32');
    return;
  }

  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'aios-ctx-agent-opencode-shell-workspace-'));
  const fakeBin = await createFakeUnresolvableWindowsOpenCodeCommand();

  try {
    const result = spawnSync(
      process.execPath,
      [
        'scripts/ctx-agent.mjs',
        '--agent',
        'opencode-cli',
        '--workspace',
        workspaceRoot,
        '--project',
        'tmp-project',
        '--no-bootstrap',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${fakeBin}${path.delimiter}${process.env.PATH || ''}`,
        },
      }
    );

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const payload = parseLastJsonPayload(result.stdout);
    assert.equal(payload.marker, 'FAKE_OPENCODE_SHELL_FALLBACK');
    const agentIndex = payload.argv.indexOf('--agent');
    assert.equal(payload.argv[agentIndex + 1], 'aios-build');
    assert.equal(payload.argv.includes('--prompt'), false);
    assert.equal(payload.argv.includes('Status:'), false);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
    await rm(fakeBin, { recursive: true, force: true });
  }
});
