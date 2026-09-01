/* End-to-end regression for the automatic memory loop that an agent should not
 * have to invoke manually. Verifies both session shapes (one-shot direct exit
 * and interactive client exit) plus the observable skipped-path receipt. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { readFile, rm, mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';
import { spawnSync } from 'node:child_process';

import { runContextDbCli } from '../lib/contextdb-cli.mjs';

const REPO = path.resolve(process.cwd());
const TSX = path.join(REPO, 'mcp-server/node_modules/tsx/dist/cli.mjs');
const CTXDB = path.join(REPO, 'mcp-server/src/contextdb/cli.ts');

function makeFakeClient() {
  return {
    spawn(command, args) {
      return spawnSync(process.execPath, args, { stdio: ['pipe', 'pipe', 'pipe'], encoding: 'utf8' });
    },
    async destroy() {},
  };
}

function readLines(file, fallback) {
  fallback = fallback || '';
  return (file ? file.split(/\r?\n/).map((l) => l.trim()).filter(Boolean) : fallback).map((l) => JSON.parse(l));
}
async function readMemoEvents(workspaceRoot) {
  const data = await readFile(path.join(workspaceRoot, '.aios/memo/file/events.jsonl'), 'utf8').catch(() => '');
  if (!data) return [];
  return readLines(data);
}
async function readReceipts(workspaceRoot) {
  const tryRoot = (root) => readFile(path.join(root, 'telemetry/memory-events.jsonl'), 'utf8').catch(() => '');
  const pair = await Promise.all([tryRoot(path.join(workspaceRoot, '.aios/context-db')), tryRoot(path.join(workspaceRoot, '.aios/context-db-legacy'))]);
  return readLines(pair.find((v) => v.trim()) || '');
}

async function seedSession(workspaceRoot, sessionId, goal) {
  await runContextDbCli(['session:new', '--workspace', workspaceRoot, '--agent', 'codex-cli', '--project', 'tmp-project', '--goal', goal, '--session-id', sessionId]);
}
function mkdirSyncSession(workspaceRoot, sessionId) {
  const sessionDir = path.join(workspaceRoot, '.aios/context-db/sessions', sessionId);
  mkdirSync(sessionDir, { recursive: true });
  writeFileSync(path.join(sessionDir, 'meta.json'), JSON.stringify({ sessionId, goal: 'goal' }));
  writeFileSync(path.join(sessionDir, 'continuity.json'), JSON.stringify({ summary: 'continue with the goal' }));
}

async function fakeBin(dir, script) {
  const { writeFile } = await import('node:fs/promises');
  await writeFile(path.join(dir, 'codex-fake.mjs'), `import { readFileSync } from 'node:fs';\nreadFileSync(0, 'utf8');\nprocess.stdout.write(${JSON.stringify(script)});\n`);
  await writeFile(path.join(dir, 'codex.cmd'), `@echo off\r\nnode "${path.join(dir, 'codex-fake.mjs')}" %*\r\n`);
  return `${dir}${path.delimiter}${process.env.PATH || ''}`;
}

async function cleanup(all) { for (const item of all) await rm(item, { recursive: true, force: true }); }

describe('automatic memory loop end-to-end', () => {
  test('one-shot direct exit writes a verified project-shared memo when output claims success', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'aios-automem-oneshot-'));
    const bin = await mkdtemp(path.join(os.tmpdir(), 'aios-automem-oneshot-bin-'));
    try {
      await seedSession(tmp, 'e2e-automem-oneshot', 'Summarize checkout validation status');
      const PATH = await fakeBin(bin, 'Checkout validation is green: all tests passed and build succeeded.\n<!--memory: verified=yes, conclusion=Checkout validation is green across all tests and the build. -->');
      const result = spawnSync(process.execPath, [path.join(REPO, 'scripts/ctx-agent.mjs'), '--agent', 'codex-cli', '--workspace', tmp, '--project', 'tmp-project', '--session', 'e2e-automem-oneshot', '--prompt', 'Summarize checkout validation test status.', '--no-bootstrap', '--no-auto-checkpoint'], { env: { ...process.env, PATH }, encoding: 'utf8' });
      const events = await readMemoEvents(tmp);
      const receipts = await readReceipts(tmp);
      const turn = events.find((e) => (e.refs || []).some((r) => String(r).startsWith('contextdb:')));
      if (!turn) throw new Error('no automatic memo event');
      if (turn.scope !== 'project_shared') throw new Error(`unexpected scope ${turn.scope}`);
      if (turn.claimStatus !== 'verified') throw new Error(`unexpected claimStatus ${turn.claimStatus}`);
      if (turn.turn?.verified !== true) throw new Error('verified event missing turn.verified=true');
      if (!receipts.some((r) => r.operation === 'write' && r.status === 'saved' && r.scope === 'project_shared')) throw new Error('missing saved receipt');
    } finally { await cleanup([tmp, bin]); }
  });

  test('one-shot without a verified declaration is NOT auto-persisted', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'aios-automem-oneshot-private-'));
    const bin = await mkdtemp(path.join(os.tmpdir(), 'aios-automem-oneshot-bin-'));
    try {
      await seedSession(tmp, 'e2e-automem-private', 'Investigate flaky retry test');
      const PATH = await fakeBin(bin, 'The retry test appears flaky under load; no fix applied yet.');
      spawnSync(process.execPath, [path.join(REPO, 'scripts/ctx-agent.mjs'), '--agent', 'codex-cli', '--workspace', tmp, '--project', 'tmp-project', '--session', 'e2e-automem-private', '--prompt', 'Investigate why the retry test is flaky.', '--no-bootstrap', '--no-auto-checkpoint'], { env: { ...process.env, PATH }, encoding: 'utf8' });
      const events = await readMemoEvents(tmp);
      // No declaration block => the harness does not decide to persist. The
      // model must declare verified=yes to record a turn; a bare output with
      // no declaration is skipped, not auto-written as agent_private.
      const turn = events.find((e) => (e.refs || []).some((r) => String(r).startsWith('contextdb:')));
      if (turn) throw new Error(`unverified output must not auto-persist, got event ${turn.eventId}`);
    } finally { await cleanup([tmp, bin]); }
  });

  test('trivial greeting exchange is skipped (no declaration)', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'aios-automem-oneshot-skip-'));
    const bin = await mkdtemp(path.join(os.tmpdir(), 'aios-automem-oneshot-bin-'));
    try {
      await seedSession(tmp, 'e2e-automem-skip', 'Say hi');
      const PATH = await fakeBin(bin, 'Hello!');
      const result = spawnSync(process.execPath, [path.join(REPO, 'scripts/ctx-agent.mjs'), '--agent', 'codex-cli', '--workspace', tmp, '--project', 'tmp-project', '--session', 'e2e-automem-skip', '--prompt', 'hi', '--no-bootstrap', '--no-auto-checkpoint'], { env: { ...process.env, PATH }, encoding: 'utf8' });
      const events = await readMemoEvents(tmp);
      if (events.length !== 0) throw new Error('trivial exchange produced a memo');
      if (!String(result.stderr || '').includes('memory.write status=skipped')) throw new Error('skipped status not visible');
    } finally { await cleanup([tmp, bin]); }
  });

  test('interactive session end keeps the governed candidate path without auto-writing a private memo', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'aios-automem-interactive-'));
    try {
      await runContextDbCli(['session:new', '--workspace', tmp, '--agent', 'codex-cli', '--project', 'tmp-project', '--goal', 'Investigate the flaky retry test', '--session-id', 'e2e-automem-interactive']);
      const sessionDir = path.join(tmp, '.aios/context-db/sessions/e2e-automem-interactive');
      mkdirSync(sessionDir, { recursive: true });
      writeFileSync(path.join(sessionDir, 'meta.json'), JSON.stringify({ sessionId: 'e2e-automem-interactive', goal: 'Investigate the flaky retry test' }));
      writeFileSync(path.join(sessionDir, 'continuity.json'), JSON.stringify({ summary: 'Explored retry behavior under load; awaiting verification.' }));
      // finalizeSession must still produce the governed session-close candidate
      // (review/promotion required) WITHOUT a parallel agent-private auto memo.
      const { finalizeSession } = await import('../lib/lifecycle/session-hooks/finalize.mjs');
      const candidate = await finalizeSession({
        rootDir: tmp,
        sessionId: 'e2e-automem-interactive',
        reason: 'interactive-exit',
        status: 'done',
        logger: { log: () => {}, error: () => {} },
      });
      if (!candidate?.candidateId) throw new Error(`expected a governed session candidate, got ${JSON.stringify(candidate)}`);
      const events = await readMemoEvents(tmp);
      // No auto-session: private auto memo (the governed candidate is a
      // separate candidate record, not an appended memo event).
      const autoSession = events.find((e) => (e.refs || []).some((r) => String(r).startsWith('auto-session:')));
      if (autoSession) throw new Error(`auto session memo must not be written, got ${autoSession.eventId}`);
    } finally { await cleanup([tmp]); }
  });
}, { timeout: 120_000 });
