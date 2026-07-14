import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { handlePlanAutoGate, handlePlanStart } from '../aios-mcp-server.mjs';
import { parsePlanArgs } from '../lib/cli/parse-args/plan.mjs';
import { runPlanCommand } from '../lib/planning/cli.mjs';

async function makeTemp(prefix) {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

function makeIo() {
  let stdoutText = '';
  let stderrText = '';
  return {
    stdout: { write(chunk) { stdoutText += String(chunk); } },
    stderr: { write(chunk) { stderrText += String(chunk); } },
    read() { return { stdoutText, stderrText }; },
  };
}

test('plan CLI parses policy mode, session, and dry-run separately from injection format', () => {
  const parsed = parsePlanArgs([
    'plan',
    'auto-gate',
    '--task',
    '/plan ship policy adapter',
    '--policy-mode',
    'strict',
    '--session',
    'cli-turn',
    '--dry-run',
    '--format',
    'json',
  ]);

  assert.equal(parsed.mode, 'command');
  assert.equal(parsed.options.policyMode, 'strict');
  assert.equal(parsed.options.sessionId, 'cli-turn');
  assert.equal(parsed.options.dryRun, true);
  assert.equal(parsed.options.format, 'json');
});

test('CLI auto-gate leaves a planned dry-run and pure injection without artifacts', async () => {
  const root = await makeTemp('aios-workflow-cli-');
  try {
    const io = makeIo();
    const result = await runPlanCommand({
      subcommand: 'auto-gate',
      task: '/plan ship policy adapter',
      client: 'codex',
      sessionId: 'cli-dry-run',
      policyMode: 'strict',
      dryRun: true,
      json: true,
    }, { rootDir: root, ...io });

    assert.equal(result.exitCode, 0);
    assert.equal(result.result.decision.disposition, 'planned');
    assert.equal(result.result.created, false);
    assert.equal(fs.existsSync(path.join(root, '.aios', 'planning', 'active.json')), false);
    assert.equal(fs.existsSync(path.join(root, 'docs', 'plans')), false);

    const injected = await runPlanCommand({ subcommand: 'inject' }, { rootDir: root, ...io });
    assert.equal(injected.exitCode, 0);
    assert.equal(fs.existsSync(path.join(root, '.aios', 'planning', 'active.json')), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('MCP auto-gate returns the structured decision without forcing a direct plan', async () => {
  const root = await makeTemp('aios-workflow-mcp-');
  try {
    const response = await handlePlanAutoGate({
      workspace: root,
      message: 'Explain the active workflow state.',
      client: 'codex',
      sessionId: 'mcp-direct',
      policyMode: 'strict',
    });
    const payload = JSON.parse(response.content[0].text);

    assert.equal(payload.ok, true);
    assert.equal(payload.decision.disposition, 'direct');
    assert.equal(payload.policy.mode, 'strict');
    assert.equal(fs.existsSync(path.join(root, '.aios', 'planning', 'active.json')), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('MCP auto-gate does not masquerade as Hermes when the caller omits a client', async () => {
  const root = await makeTemp('aios-workflow-mcp-client-');
  try {
    const response = await handlePlanAutoGate({
      workspace: root,
      message: '/plan persist one work item',
      sessionId: 'mcp-client-default',
    });
    const payload = JSON.parse(response.content[0].text);

    assert.equal(payload.plan.client, 'unknown');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('MCP plan start preserves the caller session for acknowledgement matching', async () => {
  const root = await makeTemp('aios-workflow-mcp-start-session-');
  try {
    const response = await handlePlanStart({
      workspace: root,
      title: 'Persist the caller session',
      client: 'codex',
      sessionId: 'mcp-start-session',
    });
    const plan = JSON.parse(response.content[0].text);

    assert.equal(plan.client, 'codex');
    assert.equal(plan.sessionId, 'mcp-start-session');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
