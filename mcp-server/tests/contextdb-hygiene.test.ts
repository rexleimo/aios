import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  appendEvent,
  createSession,
  writeCheckpoint,
} from '../src/contextdb/core.js';
import {
  compactContextDb,
  hygieneStatus,
  pruneNoise,
} from '../src/contextdb/hygiene.js';

async function makeWorkspace(): Promise<string> {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'ctxdb-hygiene-'));
  await fs.mkdir(path.join(workspace, 'config'), { recursive: true });
  await fs.writeFile(path.join(workspace, 'config', 'browser-profiles.json'), '{"profiles":{}}', 'utf8');
  return workspace;
}

function runContextDbCli(args: string[]) {
  const tsxCli = path.join(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const contextDbCli = path.join(process.cwd(), 'src', 'contextdb', 'cli.ts');
  return spawnSync(process.execPath, [tsxCli, contextDbCli, ...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
}

async function seedWorkspace(): Promise<{ workspace: string; sessionId: string; eventsPath: string }> {
  const workspace = await makeWorkspace();
  const session = await createSession({
    workspaceRoot: workspace,
    agent: 'codex-cli',
    project: 'rex-cli',
    goal: 'hygiene status tests',
  });
  await appendEvent({
    workspaceRoot: workspace,
    sessionId: session.sessionId,
    role: 'assistant',
    kind: 'response',
    text: 'Useful browser smoke evidence with report path temp/browser-smoke/report.html.',
  });
  await appendEvent({
    workspaceRoot: workspace,
    sessionId: session.sessionId,
    role: 'assistant',
    kind: 'response',
    text: 'TODO TODO TODO',
  });
  await writeCheckpoint({
    workspaceRoot: workspace,
    sessionId: session.sessionId,
    status: 'running',
    summary: 'Hygiene command planned.',
    nextActions: ['Run hygiene status'],
  });
  const exportsDir = path.join(workspace, '.aios', 'context-db', 'exports');
  await fs.mkdir(exportsDir, { recursive: true });
  await fs.writeFile(path.join(exportsDir, `${session.sessionId}-context.md`), '# context\n', 'utf8');
  await fs.writeFile(path.join(exportsDir, 'orphan-context.md'), '# stale\n', 'utf8');
  const eventsPath = path.join(workspace, '.aios', 'context-db', 'sessions', session.sessionId, 'l2-events.jsonl');
  return { workspace, sessionId: session.sessionId, eventsPath };
}

test('hygieneStatus counts sessions, rows, exports, stale exports, and suspected noise', async () => {
  const { workspace } = await seedWorkspace();

  const status = await hygieneStatus({ workspaceRoot: workspace });

  assert.equal(status.ok, true);
  assert.equal(status.sessions, 1);
  assert.equal(status.events, 2);
  assert.equal(status.checkpoints, 1);
  assert.equal(status.exports, 2);
  assert.equal(status.staleExports, 1);
  assert.equal(status.suspectedNoise, 1);
});

test('pruneNoise dry-run reports candidates without mutating event files', async () => {
  const { workspace, eventsPath } = await seedWorkspace();
  const before = await fs.readFile(eventsPath, 'utf8');

  const result = await pruneNoise({ workspaceRoot: workspace, dryRun: true });
  const after = await fs.readFile(eventsPath, 'utf8');

  assert.equal(result.ok, true);
  assert.equal(result.dryRun, true);
  assert.equal(result.candidates, 1);
  assert.equal(result.removed, 0);
  assert.deepEqual(result.candidateReasons, { low_signal_repetition: 1 });
  assert.equal(after, before);
});

test('compactContextDb dry-run reports planned actions without mutating files', async () => {
  const { workspace, eventsPath } = await seedWorkspace();
  const before = await fs.readFile(eventsPath, 'utf8');

  const result = await compactContextDb({ workspaceRoot: workspace, dryRun: true });
  const after = await fs.readFile(eventsPath, 'utf8');

  assert.equal(result.ok, true);
  assert.equal(result.dryRun, true);
  assert.equal(result.plannedActions.includes('prune_noise_candidates'), true);
  assert.equal(result.plannedActions.includes('remove_stale_exports'), true);
  assert.equal(result.wouldRemoveNoise, 1);
  assert.equal(result.wouldRemoveStaleExports, 1);
  assert.equal(after, before);
});

test('contextdb cli supports hygiene status and dry-run commands', async () => {
  const { workspace } = await seedWorkspace();

  const statusResult = runContextDbCli(['hygiene:status', '--workspace', workspace]);
  assert.equal(statusResult.status, 0, statusResult.stderr || statusResult.stdout);
  const statusPayload = JSON.parse((statusResult.stdout || '{}').trim()) as { suspectedNoise?: number };
  assert.equal(statusPayload.suspectedNoise, 1);

  const pruneResult = runContextDbCli(['hygiene:prune-noise', '--workspace', workspace, '--dry-run']);
  assert.equal(pruneResult.status, 0, pruneResult.stderr || pruneResult.stdout);
  const prunePayload = JSON.parse((pruneResult.stdout || '{}').trim()) as { dryRun?: boolean; candidates?: number };
  assert.equal(prunePayload.dryRun, true);
  assert.equal(prunePayload.candidates, 1);

  const compactResult = runContextDbCli(['hygiene:compact', '--workspace', workspace, '--dry-run']);
  assert.equal(compactResult.status, 0, compactResult.stderr || compactResult.stdout);
  const compactPayload = JSON.parse((compactResult.stdout || '{}').trim()) as { plannedActions?: string[] };
  assert.deepEqual(compactPayload.plannedActions, ['prune_noise_candidates', 'remove_stale_exports']);
});
