import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

import {
  appendEvent,
  buildTimeline,
  buildContextPacket,
  createSession,
  ensureContextDb,
  findLatestSession,
  getEventById,
  recallSessions,
  searchCheckpoints,
  searchMemory,
  searchEvents,
  writeCheckpoint,
} from '../src/contextdb/core.js';
import { buildMemoryGenealogyGraph } from '../src/contextdb/genealogy.js';
import { timelineCheckpointRows } from '../src/contextdb/sqlite.js';

async function makeWorkspace(): Promise<string> {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'ctxdb-'));
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

async function startContextDbServer(args: string[]): Promise<{
  url: string;
  stop: () => Promise<void>;
}> {
  const tsxCli = path.join(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const contextDbCli = path.join(process.cwd(), 'src', 'contextdb', 'cli.ts');
  const child = spawn(process.execPath, [tsxCli, contextDbCli, ...args], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  const ready = new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`contextdb server did not start\nstdout=${stdout}\nstderr=${stderr}`));
    }, 10_000);
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
      const match = stdout.match(/Memory Galaxy GUI → (http:\/\/localhost:\d+)/);
      if (match) {
        clearTimeout(timeout);
        resolve(match[1]);
      }
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once('exit', (code, signal) => {
      if (!stdout.match(/Memory Galaxy GUI →/)) {
        clearTimeout(timeout);
        reject(new Error(`contextdb server exited early code=${code} signal=${signal}\nstdout=${stdout}\nstderr=${stderr}`));
      }
    });
  });

  return {
    url: await ready,
    stop: async () => {
      if (child.exitCode !== null || child.killed) return;
      child.kill('SIGTERM');
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(resolve, 2000);
        child.once('close', () => {
          clearTimeout(timeout);
          resolve();
        });
      });
    },
  };
}

test('ensureContextDb initializes expected directory structure', async () => {
  const workspace = await makeWorkspace();
  const dbRoot = await ensureContextDb(workspace);

  assert.equal(dbRoot, path.join(workspace, '.aios', 'context-db'));
  await assert.rejects(
    fs.stat(path.join(workspace, 'memory', 'context-db')),
    (error: unknown) => (error as NodeJS.ErrnoException).code === 'ENOENT'
  );

  const manifestPath = path.join(dbRoot, 'manifest.json');
  const sessionsPath = path.join(dbRoot, 'sessions');
  const indexPath = path.join(dbRoot, 'index', 'sessions.jsonl');
  const sqlitePath = path.join(dbRoot, 'index', 'context.db');

  const [manifestRaw, sessionsStat, indexStat, sqliteStat] = await Promise.all([
    fs.readFile(manifestPath, 'utf8'),
    fs.stat(sessionsPath),
    fs.stat(indexPath),
    fs.stat(sqlitePath),
  ]);

  const manifest = JSON.parse(manifestRaw) as { version: number; layout: string };
  assert.equal(manifest.version, 1);
  assert.equal(manifest.layout, 'l0-l1-l2');
  assert.equal(sessionsStat.isDirectory(), true);
  assert.equal(indexStat.isFile(), true);
  assert.equal(sqliteStat.isFile(), true);
});

test('buildMemoryGenealogyGraph maps sessions, checkpoints, refs, continuity, and hidden raw events', async () => {
  const workspace = await makeWorkspace();
  const session = await createSession({
    workspaceRoot: workspace,
    agent: 'codex-cli',
    project: 'aios',
    goal: 'design memory genealogy map',
  });

  await appendEvent({
    workspaceRoot: workspace,
    sessionId: session.sessionId,
    role: 'user',
    kind: 'prompt',
    text: 'raw secret-like event should stay hidden by default',
    refs: ['docs/superpowers/specs/2026-05-13-contextdb-memory-genealogy-design.md'],
  });
  await writeCheckpoint({
    workspaceRoot: workspace,
    sessionId: session.sessionId,
    status: 'running',
    summary: 'Memory genealogy checkpoint summarizes the approved galaxy design.',
    nextActions: ['build graph command'],
    artifacts: ['docs/superpowers/specs/2026-05-13-contextdb-memory-genealogy-design.md'],
    telemetry: {
      verification: { result: 'partial' },
      failureCategory: 'contextdb-quality',
    },
  });

  const sessionDir = path.join(workspace, '.aios', 'context-db', 'sessions', session.sessionId);
  await fs.writeFile(path.join(sessionDir, 'continuity.json'), `${JSON.stringify({
    schemaVersion: 1,
    sessionId: session.sessionId,
    intent: 'continue memory genealogy',
    summary: 'Continue from the galaxy graph design.',
    touchedFiles: ['mcp-server/src/contextdb/genealogy.ts'],
    nextActions: ['wire CLI'],
    updatedAt: new Date().toISOString(),
  }, null, 2)}\n`, 'utf8');
  await fs.writeFile(path.join(sessionDir, 'handoff.json'), `${JSON.stringify({
    schemaVersion: 2,
    intent: 'handoff genealogy implementation',
    progress: 'graph builder planned',
    nextActions: ['implement CLI'],
  }, null, 2)}\n`, 'utf8');

  const graph = await buildMemoryGenealogyGraph({
    workspaceRoot: workspace,
    project: 'aios',
    limit: 40,
  });

  assert.equal(graph.schemaVersion, 1);
  assert.equal(graph.project, 'aios');
  assert.equal(graph.root, 'project:aios');
  assert.equal(graph.nodes.some((node) => node.type === 'session' && node.id === `session:${session.sessionId}`), true);
  assert.equal(graph.nodes.some((node) => node.type === 'checkpoint' && node.id === `checkpoint:${session.sessionId}#C1`), true);
  assert.equal(graph.nodes.some((node) => node.type === 'continuity'), true);
  assert.equal(graph.nodes.some((node) => node.type === 'handoff'), true);
  assert.equal(graph.nodes.some((node) => node.type === 'ref' && node.id.includes('contextdb-memory-genealogy-design.md')), true);
  assert.equal(graph.nodes.some((node) => node.type === 'event'), false);
  assert.equal(graph.edges.some((edge) => edge.type === 'contains' && edge.source === 'project:aios' && edge.target === `session:${session.sessionId}`), true);
  assert.equal(graph.edges.some((edge) => edge.type === 'summarizes' && edge.source === `checkpoint:${session.sessionId}#C1`), true);
  assert.equal(graph.edges.some((edge) => edge.type === 'references' && edge.source === `checkpoint:${session.sessionId}#C1`), true);
});

test('contextdb cli genealogy outputs memory graph json', async () => {
  const workspace = await makeWorkspace();
  const session = await createSession({
    workspaceRoot: workspace,
    agent: 'codex-cli',
    project: 'aios',
    goal: 'cli genealogy smoke test',
  });
  await writeCheckpoint({
    workspaceRoot: workspace,
    sessionId: session.sessionId,
    status: 'done',
    summary: 'CLI genealogy checkpoint',
    artifacts: ['docs-site/contextdb.md'],
  });

  const result = runContextDbCli([
    'genealogy',
    '--workspace', workspace,
    '--project', 'aios',
    '--limit', '20',
    '--json',
  ]);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse((result.stdout || '{}').trim()) as {
    root?: string;
    nodes?: Array<{ id: string; type: string }>;
    edges?: Array<{ source: string; target: string; type: string }>;
  };
  assert.equal(payload.root, 'project:aios');
  assert.equal(payload.nodes?.some((node) => node.id === `session:${session.sessionId}`), true);
  assert.equal(payload.edges?.some((edge) => edge.type === 'contains'), true);
});

test('contextdb cli genealogy:serve can use AIOS asset root for project workspace data', async () => {
  const workspace = await makeWorkspace();
  const assetRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ctxdb-gui-assets-'));
  const guiDir = path.join(assetRoot, 'scripts', 'lib', 'genealogy-gui');
  await fs.mkdir(guiDir, { recursive: true });
  await fs.writeFile(path.join(guiDir, 'index.html'), '<!doctype html><title>test gui</title>', 'utf8');

  const session = await createSession({
    workspaceRoot: workspace,
    agent: 'codex-cli',
    project: 'demo',
    goal: 'serve project workspace graph',
  });
  await writeCheckpoint({
    workspaceRoot: workspace,
    sessionId: session.sessionId,
    status: 'done',
    summary: 'served graph checkpoint',
  });

  const result = runContextDbCli([
    'genealogy:serve',
    '--workspace', workspace,
    '--assets-root', assetRoot,
    '--project', 'demo',
    '--port', '0',
    '--smoke',
  ]);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse((result.stdout || '{}').trim()) as {
    ok?: boolean;
    workspaceRoot?: string;
    assetsRoot?: string;
    project?: string;
    graph?: { root?: string; nodes?: Array<{ id: string; type: string }> };
    htmlBytes?: number;
  };
  assert.equal(payload.ok, true);
  assert.equal(payload.workspaceRoot, workspace);
  assert.equal(payload.assetsRoot, assetRoot);
  assert.equal(payload.project, 'demo');
  assert.equal(payload.graph?.root, 'project:demo');
  assert.equal(payload.graph?.nodes?.some((node) => node.id === `session:${session.sessionId}`), true);
  assert.equal(payload.htmlBytes, '<!doctype html><title>test gui</title>'.length);
});

test('contextdb cli genealogy:serve keeps browser API scoped to launch workspace and graph files', async () => {
  const workspace = await makeWorkspace();
  const otherWorkspace = await makeWorkspace();
  const assetRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ctxdb-gui-assets-'));
  const guiDir = path.join(assetRoot, 'scripts', 'lib', 'genealogy-gui');
  await fs.mkdir(guiDir, { recursive: true });
  await fs.writeFile(path.join(guiDir, 'index.html'), '<!doctype html><title>test gui</title>', 'utf8');
  await fs.mkdir(path.join(workspace, 'docs'), { recursive: true });
  await fs.writeFile(path.join(workspace, 'docs', 'allowed.md'), 'allowed evidence', 'utf8');
  await fs.writeFile(path.join(workspace, 'secret.txt'), 'not graph evidence', 'utf8');

  const session = await createSession({
    workspaceRoot: workspace,
    agent: 'codex-cli',
    project: 'demo',
    goal: 'serve scoped project graph',
  });
  await writeCheckpoint({
    workspaceRoot: workspace,
    sessionId: session.sessionId,
    status: 'done',
    summary: 'served scoped graph checkpoint',
    artifacts: ['docs/allowed.md'],
  });

  const server = await startContextDbServer([
    'genealogy:serve',
    '--workspace', workspace,
    '--assets-root', assetRoot,
    '--project', 'demo',
    '--port', '0',
    '--no-open',
  ]);

  try {
    const allowedFile = await fetch(`${server.url}/api/file?workspace=${encodeURIComponent(workspace)}&project=demo&file=docs%2Fallowed.md`);
    assert.equal(allowedFile.status, 200);
    assert.equal(await allowedFile.text(), 'allowed evidence');

    const unreferencedFile = await fetch(`${server.url}/api/file?workspace=${encodeURIComponent(workspace)}&project=demo&file=secret.txt`);
    assert.equal(unreferencedFile.status, 403);

    const otherWorkspaceGraph = await fetch(`${server.url}/api/genealogy?workspace=${encodeURIComponent(otherWorkspace)}&project=demo`);
    assert.equal(otherWorkspaceGraph.status, 403);

    const fallbackGraph = await fetch(`${server.url}/api/genealogy?workspace=${encodeURIComponent(workspace)}&project=missing`);
    assert.equal(fallbackGraph.status, 200);
    const fallbackFile = await fetch(`${server.url}/api/file?workspace=${encodeURIComponent(workspace)}&project=missing&file=docs%2Fallowed.md`);
    assert.equal(fallbackFile.status, 200);

    const crossOrigin = await fetch(`${server.url}/api/genealogy?project=demo`, {
      headers: { Origin: 'https://example.invalid' },
    });
    assert.equal(crossOrigin.status, 403);
    assert.notEqual(crossOrigin.headers.get('access-control-allow-origin'), '*');

    const localCrossOrigin = await fetch(`${server.url}/api/genealogy?project=demo`, {
      headers: { Origin: 'http://localhost:1' },
    });
    assert.equal(localCrossOrigin.status, 403);
  } finally {
    await server.stop();
  }
});

test('buildMemoryGenealogyGraph includes hidden event nodes only when requested', async () => {
  const workspace = await makeWorkspace();
  const session = await createSession({
    workspaceRoot: workspace,
    agent: 'codex-cli',
    project: 'aios',
    goal: 'event expansion privacy test',
  });
  await appendEvent({
    workspaceRoot: workspace,
    sessionId: session.sessionId,
    role: 'assistant',
    kind: 'response',
    text: 'Detailed raw event text should require explicit expansion.',
    refs: ['mcp-server/src/contextdb/genealogy.ts'],
  });

  const hidden = await buildMemoryGenealogyGraph({ workspaceRoot: workspace, project: 'aios' });
  const expanded = await buildMemoryGenealogyGraph({
    workspaceRoot: workspace,
    project: 'aios',
    includeEvents: true,
    eventsPerSession: 5,
  });

  assert.equal(hidden.nodes.some((node) => node.type === 'event'), false);
  assert.equal(hidden.summary.hiddenEvents, 1);
  const eventNode = expanded.nodes.find((node) => node.type === 'event');
  assert.equal(Boolean(eventNode), true);
  assert.equal(eventNode?.hiddenRaw, true);
  assert.equal(expanded.edges.some((edge) => edge.type === 'references' && edge.source === eventNode?.id), true);
});

test('contextdb cli supports index:rebuild', async () => {
  const workspace = await makeWorkspace();
  const session = await createSession({
    workspaceRoot: workspace,
    agent: 'codex-cli',
    project: 'rex-cli',
    goal: 'rebuild index smoke test',
  });

  await appendEvent({
    workspaceRoot: workspace,
    sessionId: session.sessionId,
    role: 'user',
    kind: 'prompt',
    text: 'Need index rebuild command',
  });

  const result = runContextDbCli(['index:rebuild', '--workspace', workspace]);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse((result.stdout || '{}').trim()) as { ok?: boolean };
  assert.equal(payload.ok, true);
});

test('contextdb cli supports index:sync --stats with incremental counters', async () => {
  const workspace = await makeWorkspace();
  const session = await createSession({
    workspaceRoot: workspace,
    agent: 'codex-cli',
    project: 'rex-cli',
    goal: 'index sync stats smoke test',
  });

  await appendEvent({
    workspaceRoot: workspace,
    sessionId: session.sessionId,
    role: 'assistant',
    kind: 'response',
    text: 'indexed event baseline',
  });

  const sessionDir = path.join(workspace, '.aios', 'context-db', 'sessions', session.sessionId);
  const eventsPath = path.join(sessionDir, 'l2-events.jsonl');
  const statePath = path.join(sessionDir, 'state.json');
  const ts = new Date().toISOString();
  await fs.appendFile(eventsPath, `${JSON.stringify({
    seq: 2,
    ts,
    role: 'assistant',
    kind: 'response',
    text: 'pending event for incremental sync stats',
    refs: ['docs/incremental.md'],
  })}\n`, 'utf8');
  const state = JSON.parse(await fs.readFile(statePath, 'utf8')) as { lastEventSeq?: number; lastEventAt?: string };
  state.lastEventSeq = 2;
  state.lastEventAt = ts;
  await fs.writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');

  const result = runContextDbCli(['index:sync', '--workspace', workspace, '--force', '--stats']);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse((result.stdout || '{}').trim()) as {
    ok?: boolean;
    mode?: string;
    forced?: boolean;
    skippedByThrottle?: boolean;
    scannedSessions?: number;
    upsertedEvents?: number;
  };
  assert.equal(payload.ok, true);
  assert.equal(payload.mode, 'incremental');
  assert.equal(payload.forced, true);
  assert.equal(payload.skippedByThrottle, false);
  assert.equal((payload.scannedSessions ?? 0) >= 1, true);
  assert.equal((payload.upsertedEvents ?? 0) >= 1, true);
});

test('contextdb cli index:sync writes jsonl records with --jsonl-out', async () => {
  const workspace = await makeWorkspace();
  const session = await createSession({
    workspaceRoot: workspace,
    agent: 'codex-cli',
    project: 'rex-cli',
    goal: 'index sync jsonl output',
  });
  await appendEvent({
    workspaceRoot: workspace,
    sessionId: session.sessionId,
    role: 'assistant',
    kind: 'response',
    text: 'jsonl record seed event',
  });

  const outputPath = path.join('.aios', 'context-db', 'exports', 'index-sync-stats.jsonl');
  const result = runContextDbCli([
    'index:sync',
    '--workspace',
    workspace,
    '--force',
    '--stats',
    '--jsonl-out',
    outputPath,
  ]);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const absoluteOut = path.join(workspace, outputPath);
  const raw = await fs.readFile(absoluteOut, 'utf8');
  const lines = raw.trim().split('\n').filter(Boolean);
  assert.equal(lines.length >= 1, true);
  const record = JSON.parse(lines[lines.length - 1]) as { command?: string; mode?: string; ok?: boolean; syncedAt?: string };
  assert.equal(record.command, 'index:sync');
  assert.equal(record.mode, 'incremental');
  assert.equal(record.ok, true);
  assert.equal(typeof record.syncedAt, 'string');
});

test('contextdb cli checkpoint accepts telemetry flags', async () => {
  const workspace = await makeWorkspace();
  const session = await createSession({
    workspaceRoot: workspace,
    agent: 'codex-cli',
    project: 'rex-cli',
    goal: 'checkpoint cli telemetry',
  });

  const result = runContextDbCli([
    'checkpoint',
    '--workspace',
    workspace,
    '--session',
    session.sessionId,
    '--summary',
    'CLI telemetry checkpoint',
    '--verify-result',
    'failed',
    '--verify-evidence',
    'quality-gate quick',
    '--retry-count',
    '3',
    '--failure-category',
    'timeout',
    '--elapsed-ms',
    '987',
    '--cost-input-tokens',
    '120',
    '--cost-output-tokens',
    '80',
    '--cost-usd',
    '0.45',
  ]);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse((result.stdout || '{}').trim()) as {
    telemetry?: {
      verification?: { result?: string; evidence?: string };
      retryCount?: number;
      failureCategory?: string;
      elapsedMs?: number;
      cost?: { inputTokens?: number; outputTokens?: number; totalTokens?: number; usd?: number };
    };
  };
  assert.deepEqual(payload.telemetry, {
    verification: { result: 'failed', evidence: 'quality-gate quick' },
    retryCount: 3,
    failureCategory: 'timeout',
    elapsedMs: 987,
    cost: {
      inputTokens: 120,
      outputTokens: 80,
      totalTokens: 200,
      usd: 0.45,
    },
  });
});

test('appendEvent normalizes and persists turn envelope metadata', async () => {
  const workspace = await makeWorkspace();
  const session = await createSession({
    workspaceRoot: workspace,
    agent: 'codex-cli',
    project: 'rex-cli',
    goal: 'turn envelope normalization',
  });

  const event = await appendEvent({
    workspaceRoot: workspace,
    sessionId: session.sessionId,
    role: 'assistant',
    kind: 'response',
    text: 'turn envelope event',
    turn: {
      turnId: ' turn-1 ',
      parentTurnId: ' parent-0 ',
      turnType: 'MAIN' as unknown as 'main',
      environment: ' cli ',
      workItemRefs: ['wi-2', 'wi-1', 'wi-1', ''],
      nextStateRefs: ['artifact:b', 'artifact:a', 'artifact:b'],
      hindsightStatus: 'PENDING' as unknown as 'pending',
      outcome: 'SUCCESS' as unknown as 'success',
    },
  });

  assert.deepEqual(event.turn, {
    turnId: 'turn-1',
    parentTurnId: 'parent-0',
    turnType: 'main',
    environment: 'cli',
    workItemRefs: ['wi-1', 'wi-2'],
    nextStateRefs: ['artifact:a', 'artifact:b'],
    hindsightStatus: 'pending',
    outcome: 'success',
  });

  const eventId = `${session.sessionId}#${event.seq}`;
  const byId = await getEventById({
    workspaceRoot: workspace,
    eventId,
  });
  assert.equal(byId.event?.turn?.turnId, 'turn-1');
  assert.equal(byId.event?.turn?.turnType, 'main');
});

test('contextdb cli event:add accepts turn envelope flags', async () => {
  const workspace = await makeWorkspace();
  const session = await createSession({
    workspaceRoot: workspace,
    agent: 'codex-cli',
    project: 'rex-cli',
    goal: 'event add turn flags',
  });

  const result = runContextDbCli([
    'event:add',
    '--workspace',
    workspace,
    '--session',
    session.sessionId,
    '--role',
    'assistant',
    '--kind',
    'response',
    '--text',
    'cli turn envelope event',
    '--turn-id',
    'turn-2',
    '--parent-turn-id',
    'turn-1',
    '--turn-type',
    'main',
    '--environment',
    'cli',
    '--work-item-refs',
    'wi-2,wi-1,wi-2',
    '--next-state-refs',
    'artifact:b,artifact:a',
    '--hindsight-status',
    'evaluated',
    '--outcome',
    'correction',
  ]);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse((result.stdout || '{}').trim()) as {
    turn?: {
      turnId?: string;
      parentTurnId?: string;
      turnType?: string;
      environment?: string;
      workItemRefs?: string[];
      nextStateRefs?: string[];
      hindsightStatus?: string;
      outcome?: string;
    };
  };
  assert.deepEqual(payload.turn, {
    turnId: 'turn-2',
    parentTurnId: 'turn-1',
    turnType: 'main',
    environment: 'cli',
    workItemRefs: ['wi-1', 'wi-2'],
    nextStateRefs: ['artifact:a', 'artifact:b'],
    hindsightStatus: 'evaluated',
    outcome: 'correction',
  });
});

test('createSession writes metadata and index record', async () => {
  const workspace = await makeWorkspace();
  const session = await createSession({
    workspaceRoot: workspace,
    agent: 'claude-code',
    project: 'rex-cli',
    goal: 'Diagnose flaky browser launch',
    tags: ['debug', 'browser'],
  });

  const metaPath = path.join(
    workspace,
    '.aios',
    'context-db',
    'sessions',
    session.sessionId,
    'meta.json'
  );
  const indexPath = path.join(workspace, '.aios', 'context-db', 'index', 'sessions.jsonl');

  const [metaRaw, indexRaw] = await Promise.all([
    fs.readFile(metaPath, 'utf8'),
    fs.readFile(indexPath, 'utf8'),
  ]);

  const meta = JSON.parse(metaRaw) as { agent: string; project: string; goal: string };
  assert.equal(meta.agent, 'claude-code');
  assert.equal(meta.project, 'rex-cli');
  assert.equal(meta.goal, 'Diagnose flaky browser launch');
  assert.match(indexRaw, new RegExp(session.sessionId));
});

test('appendEvent and writeCheckpoint persist l2/l1 context', async () => {
  const workspace = await makeWorkspace();
  const session = await createSession({
    workspaceRoot: workspace,
    agent: 'gemini-cli',
    project: 'rex-cli',
    goal: 'Publish xiaohongshu post safely',
  });

  await appendEvent({
    workspaceRoot: workspace,
    sessionId: session.sessionId,
    role: 'user',
    text: 'Need a safe posting flow.',
    kind: 'request',
  });
  await appendEvent({
    workspaceRoot: workspace,
    sessionId: session.sessionId,
    role: 'assistant',
    text: 'Start with auth gate checks and pacing.',
    kind: 'plan',
  });
  await writeCheckpoint({
    workspaceRoot: workspace,
    sessionId: session.sessionId,
    summary: 'Auth gate is present; waiting for manual login.',
    status: 'blocked',
    nextActions: ['Wait for human login', 'Resume snapshot and publish draft'],
    artifacts: ['screenshots/auth-gate.png'],
  });

  const eventsPath = path.join(
    workspace,
    '.aios',
    'context-db',
    'sessions',
    session.sessionId,
    'l2-events.jsonl'
  );
  const checkpointsPath = path.join(
    workspace,
    '.aios',
    'context-db',
    'sessions',
    session.sessionId,
    'l1-checkpoints.jsonl'
  );
  const summaryPath = path.join(
    workspace,
    '.aios',
    'context-db',
    'sessions',
    session.sessionId,
    'l0-summary.md'
  );
  const continuitySummaryPath = path.join(
    workspace,
    '.aios',
    'context-db',
    'sessions',
    session.sessionId,
    'continuity-summary.md'
  );
  const continuityJsonPath = path.join(
    workspace,
    '.aios',
    'context-db',
    'sessions',
    session.sessionId,
    'continuity.json'
  );

  const [eventsRaw, checkpointsRaw, summaryRaw, continuitySummaryRaw, continuityJsonRaw] = await Promise.all([
    fs.readFile(eventsPath, 'utf8'),
    fs.readFile(checkpointsPath, 'utf8'),
    fs.readFile(summaryPath, 'utf8'),
    fs.readFile(continuitySummaryPath, 'utf8'),
    fs.readFile(continuityJsonPath, 'utf8'),
  ]);

  const eventLines = eventsRaw.trim().split('\n');
  const checkpointLines = checkpointsRaw.trim().split('\n');

  assert.equal(eventLines.length, 2);
  assert.equal(checkpointLines.length, 1);
  assert.match(summaryRaw, /Auth gate is present/);
  assert.match(continuitySummaryRaw, /# Continuity Summary/);
  assert.match(continuitySummaryRaw, /Auth gate is present/);
  const continuityJson = JSON.parse(continuityJsonRaw) as { schemaVersion?: number; sessionId?: string; summary?: string; nextActions?: string[] };
  assert.equal(continuityJson.schemaVersion, 1);
  assert.equal(continuityJson.sessionId, session.sessionId);
  assert.match(String(continuityJson.summary || ''), /Auth gate is present/);
  assert.deepEqual(continuityJson.nextActions, ['Wait for human login', 'Resume snapshot and publish draft']);
});

test('writeCheckpoint normalizes telemetry and mirrors it to sidecar indexes', async () => {
  const workspace = await makeWorkspace();
  const session = await createSession({
    workspaceRoot: workspace,
    agent: 'codex-cli',
    project: 'rex-cli',
    goal: 'Capture checkpoint telemetry',
  });

  await writeCheckpoint({
    workspaceRoot: workspace,
    sessionId: session.sessionId,
    summary: 'Telemetry checkpoint.',
    status: 'running',
    telemetry: {
      verification: { result: 'passed', evidence: 'quality-gate quick' },
      retryCount: 2.9,
      failureCategory: ' Timeout ',
      elapsedMs: 1543.8,
      cost: {
        inputTokens: 120,
        outputTokens: 30,
        usd: 0.42,
      },
    },
  });

  const checkpointsPath = path.join(
    workspace,
    '.aios',
    'context-db',
    'sessions',
    session.sessionId,
    'l1-checkpoints.jsonl'
  );
  const summaryPath = path.join(
    workspace,
    '.aios',
    'context-db',
    'sessions',
    session.sessionId,
    'l0-summary.md'
  );
  const sqlitePath = path.join(workspace, '.aios', 'context-db', 'index', 'context.db');

  const [checkpointsRaw, summaryRaw] = await Promise.all([
    fs.readFile(checkpointsPath, 'utf8'),
    fs.readFile(summaryPath, 'utf8'),
  ]);

  const checkpoint = JSON.parse(checkpointsRaw.trim()) as {
    telemetry?: {
      verification?: { result?: string; evidence?: string };
      retryCount?: number;
      failureCategory?: string;
      elapsedMs?: number;
      cost?: { inputTokens?: number; outputTokens?: number; totalTokens?: number; usd?: number };
    };
  };
  assert.deepEqual(checkpoint.telemetry, {
    verification: { result: 'passed', evidence: 'quality-gate quick' },
    retryCount: 2,
    failureCategory: 'timeout',
    elapsedMs: 1543,
    cost: {
      inputTokens: 120,
      outputTokens: 30,
      totalTokens: 150,
      usd: 0.42,
    },
  });
  assert.match(summaryRaw, /## Telemetry/);
  assert.match(summaryRaw, /Verification: passed \(quality-gate quick\)/);
  assert.match(summaryRaw, /Retry Count: 2/);
  assert.match(summaryRaw, /Elapsed: 1543 ms/);

  const checkpointRows = timelineCheckpointRows(sqlitePath, { sessionId: session.sessionId, limit: 5 });
  assert.equal(checkpointRows.length, 1);
  assert.deepEqual(checkpointRows[0].telemetry, checkpoint.telemetry);

  const packet = await buildContextPacket({
    workspaceRoot: workspace,
    sessionId: session.sessionId,
    eventLimit: 5,
  });
  assert.match(packet.markdown, /Telemetry:/);
  assert.match(packet.markdown, /Failure Category: timeout/);
});

test('buildContextPacket composes markdown for agent handoff', async () => {
  const workspace = await makeWorkspace();
  const session = await createSession({
    workspaceRoot: workspace,
    agent: 'claude-code',
    project: 'rex-cli',
    goal: 'Generate image workflow docs',
  });

  await appendEvent({
    workspaceRoot: workspace,
    sessionId: session.sessionId,
    role: 'user',
    text: 'Analyze OpenViking and simplify context DB flow.',
  });
  await writeCheckpoint({
    workspaceRoot: workspace,
    sessionId: session.sessionId,
    summary: 'Need filesystem-only context DB MVP.',
    nextActions: ['Create CLI commands', 'Write runbook'],
    status: 'running',
  });

  await fs.writeFile(
    path.join(
      workspace,
      '.aios',
      'context-db',
      'sessions',
      session.sessionId,
      'continuity.json'
    ),
    `${JSON.stringify({
      schemaVersion: 1,
      sessionId: session.sessionId,
      intent: 'Unique sidecar intent for packet injection',
      summary: 'Sidecar-only compact resume summary.',
      touchedFiles: ['sidecar-only.ts'],
      nextActions: ['Sidecar-only resume action'],
      updatedAt: '2026-04-25T00:00:00.000Z',
    }, null, 2)}\n`,
    'utf8'
  );

  const packet = await buildContextPacket({
    workspaceRoot: workspace,
    sessionId: session.sessionId,
    eventLimit: 10,
  });

  assert.match(packet.markdown, /Context Packet/);
  assert.match(packet.markdown, /filesystem-only context DB MVP/);
  assert.match(packet.markdown, /## Continuity Summary/);
  assert.match(packet.markdown, /Unique sidecar intent for packet injection/);
  assert.match(packet.markdown, /Sidecar-only compact resume summary/);
  assert.match(packet.markdown, /Sidecar-only resume action/);
  assert.match(packet.markdown, /Create CLI commands/);
  assert.match(packet.markdown, /Analyze OpenViking/);
});

test('buildContextPacket tolerates missing or corrupt continuity sidecar', async () => {
  const workspace = await makeWorkspace();
  const session = await createSession({
    workspaceRoot: workspace,
    agent: 'claude-code',
    project: 'rex-cli',
    goal: 'Continuity sidecar tolerance',
  });

  await writeCheckpoint({
    workspaceRoot: workspace,
    sessionId: session.sessionId,
    summary: 'Checkpoint should remain packable.',
    nextActions: ['Keep building packet'],
    status: 'running',
  });

  const continuityJsonPath = path.join(
    workspace,
    '.aios',
    'context-db',
    'sessions',
    session.sessionId,
    'continuity.json'
  );

  await fs.rm(continuityJsonPath, { force: true });
  const missingPacket = await buildContextPacket({
    workspaceRoot: workspace,
    sessionId: session.sessionId,
    eventLimit: 5,
  });
  assert.match(missingPacket.markdown, /No continuity summary yet/);
  assert.match(missingPacket.markdown, /Checkpoint should remain packable/);

  await fs.writeFile(continuityJsonPath, '{not-json', 'utf8');
  const corruptPacket = await buildContextPacket({
    workspaceRoot: workspace,
    sessionId: session.sessionId,
    eventLimit: 5,
  });
  assert.match(corruptPacket.markdown, /No continuity summary yet/);
  assert.match(corruptPacket.markdown, /Checkpoint should remain packable/);
});

test('buildContextPacket tolerates legacy events missing text', async () => {
  const workspace = await makeWorkspace();
  const session = await createSession({
    workspaceRoot: workspace,
    agent: 'codex-cli',
    project: 'rex-cli',
    goal: 'Legacy event regression test',
  });

  const eventsPath = path.join(
    workspace,
    '.aios',
    'context-db',
    'sessions',
    session.sessionId,
    'l2-events.jsonl'
  );

  // Simulate a legacy/corrupt event line where "text" is missing entirely.
  await fs.appendFile(eventsPath, `${JSON.stringify({
    ts: '2026-03-10T00:00:00.000Z',
    role: 'user',
    kind: 'prompt',
    refs: [],
  })}\n`);

  const packet = await buildContextPacket({
    workspaceRoot: workspace,
    sessionId: session.sessionId,
    eventLimit: 5,
  });

  assert.match(packet.markdown, /Recent Events/);
  assert.match(packet.markdown, new RegExp(`${session.sessionId}#\\?`));
  assert.match(packet.markdown, /user\/prompt/);
});

test('buildContextPacket tolerates legacy events with non-array refs', async () => {
  const workspace = await makeWorkspace();
  const session = await createSession({
    workspaceRoot: workspace,
    agent: 'codex-cli',
    project: 'rex-cli',
    goal: 'Legacy refs regression test',
  });

  const eventsPath = path.join(
    workspace,
    '.aios',
    'context-db',
    'sessions',
    session.sessionId,
    'l2-events.jsonl'
  );

  // Simulate a legacy/corrupt event line where "refs" is a string.
  await fs.appendFile(eventsPath, `${JSON.stringify({
    ts: '2026-03-10T00:00:00.000Z',
    role: 'user',
    kind: 'prompt',
    text: 'Legacy refs payload',
    refs: 'core.ts',
  })}\n`);

  const packet = await buildContextPacket({
    workspaceRoot: workspace,
    sessionId: session.sessionId,
    eventLimit: 5,
    refs: ['core.ts'],
  });

  assert.match(packet.markdown, /Event Filters: kinds=\(all\) refs=core\.ts/);
  assert.match(packet.markdown, /Legacy refs payload/);
  assert.match(packet.markdown, /refs=\[core\.ts\]/);
});

test('buildContextPacket tolerates legacy checkpoints missing action/artifact arrays', async () => {
  const workspace = await makeWorkspace();
  const session = await createSession({
    workspaceRoot: workspace,
    agent: 'codex-cli',
    project: 'rex-cli',
    goal: 'Legacy checkpoint regression test',
  });

  const checkpointsPath = path.join(
    workspace,
    '.aios',
    'context-db',
    'sessions',
    session.sessionId,
    'l1-checkpoints.jsonl'
  );

  // Simulate a legacy/corrupt checkpoint line where "nextActions" and "artifacts" are missing.
  await fs.appendFile(checkpointsPath, `${JSON.stringify({
    ts: '2026-03-10T00:00:00.000Z',
    status: 'running',
    summary: 'Legacy checkpoint',
  })}\n`);

  const packet = await buildContextPacket({
    workspaceRoot: workspace,
    sessionId: session.sessionId,
    eventLimit: 5,
  });

  assert.match(packet.markdown, /## L1 Snapshot/);
  assert.match(packet.markdown, /Next Actions:/);
  assert.match(packet.markdown, /Artifacts:/);
  assert.match(packet.markdown, /- \(none\)/);
});

test('appendEvent deduplicates rapid duplicate events', async () => {
  const workspace = await makeWorkspace();
  const session = await createSession({
    workspaceRoot: workspace,
    agent: 'codex-cli',
    project: 'rex-cli',
    goal: 'Validate dedupe',
  });

  const first = await appendEvent({
    workspaceRoot: workspace,
    sessionId: session.sessionId,
    role: 'assistant',
    kind: 'response',
    text: 'Same response body',
    refs: ['core.ts'],
  });
  const second = await appendEvent({
    workspaceRoot: workspace,
    sessionId: session.sessionId,
    role: 'assistant',
    kind: 'response',
    text: 'Same response body',
    refs: ['core.ts'],
  });

  const eventsPath = path.join(
    workspace,
    '.aios',
    'context-db',
    'sessions',
    session.sessionId,
    'l2-events.jsonl'
  );
  const eventsRaw = await fs.readFile(eventsPath, 'utf8');
  const lines = eventsRaw.trim().split('\n').filter(Boolean);

  assert.equal(lines.length, 1);
  assert.equal(first.seq, second.seq);
});

test('buildContextPacket supports kind/ref filtering and token budget', async () => {
  const workspace = await makeWorkspace();
  const session = await createSession({
    workspaceRoot: workspace,
    agent: 'claude-code',
    project: 'rex-cli',
    goal: 'Filter packet events',
  });

  await appendEvent({
    workspaceRoot: workspace,
    sessionId: session.sessionId,
    role: 'user',
    kind: 'prompt',
    text: 'First prompt should be excluded.',
    refs: ['task.md'],
  });
  await appendEvent({
    workspaceRoot: workspace,
    sessionId: session.sessionId,
    role: 'assistant',
    kind: 'response',
    text: 'Long response for pack budget verification and downstream context handoff.',
    refs: ['core.ts', 'cli.ts'],
  });
  await writeCheckpoint({
    workspaceRoot: workspace,
    sessionId: session.sessionId,
    summary: 'Checkpoint summary for packet.',
    status: 'running',
    nextActions: ['Continue'],
  });

  const packet = await buildContextPacket({
    workspaceRoot: workspace,
    sessionId: session.sessionId,
    eventLimit: 50,
    tokenBudget: 18,
    kinds: ['response'],
    refs: ['core.ts'],
  });

  assert.match(packet.markdown, /Event Filters: kinds=response refs=core\.ts/);
  assert.match(packet.markdown, /response/);
  assert.doesNotMatch(packet.markdown, /First prompt should be excluded/);
});

test('buildContextPacket balanced token strategy keeps critical error context under tight budget', async () => {
  const workspace = await makeWorkspace();
  const session = await createSession({
    workspaceRoot: workspace,
    agent: 'codex-cli',
    project: 'rex-cli',
    goal: 'Preserve critical failure signals with tight token budget',
  });

  await appendEvent({
    workspaceRoot: workspace,
    sessionId: session.sessionId,
    role: 'assistant',
    kind: 'response',
    text: Array.from({ length: 40 }).map(() => 'heartbeat ok').join('\n'),
  });
  await appendEvent({
    workspaceRoot: workspace,
    sessionId: session.sessionId,
    role: 'tool',
    kind: 'error',
    text: [
      'ERROR: migration failed while updating state table',
      'at migrate (/repo/scripts/lib/harness/orchestrator.mjs:442:11)',
      'at run (/repo/scripts/aios.mjs:77:3)',
      'Caused by: timeout waiting for lock',
    ].join('\n'),
    refs: ['scripts/lib/harness/orchestrator.mjs'],
  });
  await appendEvent({
    workspaceRoot: workspace,
    sessionId: session.sessionId,
    role: 'assistant',
    kind: 'response',
    text: 'Retry with focused lock scope and checkpoint update.',
  });

  const packet = await buildContextPacket({
    workspaceRoot: workspace,
    sessionId: session.sessionId,
    eventLimit: 20,
    tokenBudget: 72,
    tokenStrategy: 'balanced',
  });

  assert.match(packet.markdown, /strategy=balanced/);
  assert.match(packet.markdown, /migration failed/i);
  assert.match(packet.markdown, /orchestrator\.mjs/);
  assert.match(packet.markdown, /Retry with focused lock scope/i);
});

test('contextdb cli context:pack accepts --token-strategy and writes strategy metadata', async () => {
  const workspace = await makeWorkspace();
  const session = await createSession({
    workspaceRoot: workspace,
    agent: 'claude-code',
    project: 'rex-cli',
    goal: 'CLI token strategy coverage',
  });

  await appendEvent({
    workspaceRoot: workspace,
    sessionId: session.sessionId,
    role: 'tool',
    kind: 'error',
    text: [
      'Traceback (most recent call last):',
      'File "/tmp/task.py", line 1, in <module>',
      'raise RuntimeError("forced failure")',
      'RuntimeError: forced failure',
      'at handler (/repo/src/index.ts:10:2)',
      'at run (/repo/src/main.ts:20:5)',
    ].join('\n'),
  });

  const outputRel = path.join('.aios', 'context-db', 'exports', `${session.sessionId}-aggressive.md`);
  const result = runContextDbCli([
    'context:pack',
    '--workspace',
    workspace,
    '--session',
    session.sessionId,
    '--limit',
    '30',
    '--token-budget',
    '48',
    '--token-strategy',
    'aggressive',
    '--out',
    outputRel,
  ]);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const packetPath = path.join(workspace, outputRel);
  const packetRaw = await fs.readFile(packetPath, 'utf8');
  assert.match(packetRaw, /strategy=aggressive/);
});

test('searchEvents, getEventById, and buildTimeline use sidecar indexes', async () => {
  const workspace = await makeWorkspace();
  const session = await createSession({
    workspaceRoot: workspace,
    agent: 'gemini-cli',
    project: 'rex-cli',
    goal: 'Exercise sidecar index APIs',
  });

  await appendEvent({
    workspaceRoot: workspace,
    sessionId: session.sessionId,
    role: 'user',
    kind: 'prompt',
    text: 'Investigate auth race condition',
    refs: ['auth.ts'],
  });
  await appendEvent({
    workspaceRoot: workspace,
    sessionId: session.sessionId,
    role: 'assistant',
    kind: 'response',
    text: 'Auth race likely in refresh path',
    refs: ['auth.ts', 'token.ts'],
  });
  await writeCheckpoint({
    workspaceRoot: workspace,
    sessionId: session.sessionId,
    summary: 'Race condition isolated.',
    status: 'running',
    nextActions: ['Patch token refresh'],
    artifacts: ['logs/auth-race.log'],
  });

  const found = await searchEvents({
    workspaceRoot: workspace,
    query: 'auth race',
    project: 'rex-cli',
    kinds: ['response'],
    refs: ['auth.ts'],
    limit: 10,
  });

  assert.equal(found.results.length, 1);
  assert.match(found.results[0].eventId, new RegExp(`^${session.sessionId}#`));

  const byId = await getEventById({
    workspaceRoot: workspace,
    eventId: found.results[0].eventId,
  });
  assert.equal(byId.event?.kind, 'response');
  assert.match(byId.event?.text ?? '', /refresh path/);

  const timeline = await buildTimeline({
    workspaceRoot: workspace,
    sessionId: session.sessionId,
    limit: 5,
  });
  assert.ok(timeline.items.length >= 2);
  assert.ok(timeline.items.some((item) => item.itemType === 'checkpoint'));
});

test('searchEvents rebuilds sqlite sidecar when context.db is missing', async () => {
  const workspace = await makeWorkspace();
  const session = await createSession({
    workspaceRoot: workspace,
    agent: 'codex-cli',
    project: 'rex-cli',
    goal: 'recover from missing sqlite sidecar',
  });

  await appendEvent({
    workspaceRoot: workspace,
    sessionId: session.sessionId,
    role: 'assistant',
    kind: 'response',
    text: 'sidecar rebuild should recover this event',
    refs: ['core.ts'],
  });

  const sqlitePath = path.join(workspace, '.aios', 'context-db', 'index', 'context.db');
  await fs.unlink(sqlitePath);
  const walPath = `${sqlitePath}-wal`;
  const shmPath = `${sqlitePath}-shm`;
  await fs.rm(walPath, { force: true });
  await fs.rm(shmPath, { force: true });

  const cli = runContextDbCli([
    'search',
    '--workspace',
    workspace,
    '--project',
    'rex-cli',
    '--query',
    'recover this event',
    '--limit',
    '5',
  ]);

  assert.equal(cli.status, 0, cli.stderr || cli.stdout);
  const found = JSON.parse((cli.stdout || '{}').trim()) as { results?: Array<{ eventId: string }> };
  assert.equal(Array.isArray(found.results), true);
  assert.equal(found.results?.length, 1);
  assert.match(found.results?.[0]?.eventId ?? '', new RegExp(`^${session.sessionId}#`));

  const searchFromCore = await searchEvents({
    workspaceRoot: workspace,
    project: 'rex-cli',
    query: 'recover this event',
    limit: 5,
  });
  assert.equal(searchFromCore.results.length, 1);
});

test('searchEvents semantic mode reranks lexical candidates and falls back safely', async () => {
  const workspace = await makeWorkspace();
  const session = await createSession({
    workspaceRoot: workspace,
    agent: 'codex-cli',
    project: 'rex-cli',
    goal: 'semantic retrieval smoke test',
  });

  await appendEvent({
    workspaceRoot: workspace,
    sessionId: session.sessionId,
    role: 'assistant',
    kind: 'response',
    text: 'auth issue found in login callback',
    refs: ['auth.ts'],
  });
  await appendEvent({
    workspaceRoot: workspace,
    sessionId: session.sessionId,
    role: 'assistant',
    kind: 'response',
    text: 'auth checklist draft for docs website',
    refs: ['docs.md'],
  });

  const previousSemantic = process.env.CONTEXTDB_SEMANTIC;
  const previousProvider = process.env.CONTEXTDB_SEMANTIC_PROVIDER;
  try {
    process.env.CONTEXTDB_SEMANTIC = '0';
    const lexicalFallback = await searchEvents({
      workspaceRoot: workspace,
      project: 'rex-cli',
      query: 'issue auth',
      kinds: ['response'],
      semantic: true,
      limit: 5,
    });
    assert.equal(lexicalFallback.results.length, 2);

    process.env.CONTEXTDB_SEMANTIC = '1';
    process.env.CONTEXTDB_SEMANTIC_PROVIDER = 'token';
    const semantic = await searchEvents({
      workspaceRoot: workspace,
      project: 'rex-cli',
      query: 'issue auth',
      kinds: ['response'],
      semantic: true,
      limit: 5,
    });
    assert.equal(semantic.results.length, 2);
    assert.match(semantic.results[0].text, /auth issue/i);
  } finally {
    if (previousSemantic === undefined) {
      delete process.env.CONTEXTDB_SEMANTIC;
    } else {
      process.env.CONTEXTDB_SEMANTIC = previousSemantic;
    }
    if (previousProvider === undefined) {
      delete process.env.CONTEXTDB_SEMANTIC_PROVIDER;
    } else {
      process.env.CONTEXTDB_SEMANTIC_PROVIDER = previousProvider;
    }
  }
});

test('searchEvents tokenized query matches punctuation-delimited terms', async () => {
  const workspace = await makeWorkspace();
  const session = await createSession({
    workspaceRoot: workspace,
    agent: 'codex-cli',
    project: 'rex-cli',
    goal: 'tokenized lexical retrieval',
  });

  await appendEvent({
    workspaceRoot: workspace,
    sessionId: session.sessionId,
    role: 'assistant',
    kind: 'orchestration.human-gate',
    text: 'Clarity gate requires human input: blocked checkpoints (5) reached threshold (2); auth/payment/policy boundary signals detected (3)',
  });

  const results = await searchEvents({
    workspaceRoot: workspace,
    sessionId: session.sessionId,
    query: 'blocked checkpoints threshold auth policy boundary',
    limit: 5,
  });

  assert.equal(results.results.length, 1);
  assert.match(results.results[0].text, /auth\/payment\/policy boundary/i);
});

test('searchEvents semantic mode keeps query-scoped candidates so older exact hits are not dropped', async () => {
  const workspace = await makeWorkspace();
  const session = await createSession({
    workspaceRoot: workspace,
    agent: 'codex-cli',
    project: 'rex-cli',
    goal: 'semantic candidate scope',
  });

  await appendEvent({
    workspaceRoot: workspace,
    sessionId: session.sessionId,
    role: 'user',
    kind: 'prompt',
    text: 'smoke two',
  });

  for (let i = 0; i < 40; i += 1) {
    await appendEvent({
      workspaceRoot: workspace,
      sessionId: session.sessionId,
      role: 'assistant',
      kind: 'response',
      text: `recent status update ${i}`,
    });
  }

  const previousSemantic = process.env.CONTEXTDB_SEMANTIC;
  const previousProvider = process.env.CONTEXTDB_SEMANTIC_PROVIDER;
  try {
    process.env.CONTEXTDB_SEMANTIC = '1';
    process.env.CONTEXTDB_SEMANTIC_PROVIDER = 'token';
    const semantic = await searchEvents({
      workspaceRoot: workspace,
      sessionId: session.sessionId,
      query: 'smoke two',
      semantic: true,
      limit: 5,
    });
    assert.equal(semantic.results.length > 0, true);
    assert.match(semantic.results[0].text, /^smoke two$/i);
  } finally {
    if (previousSemantic === undefined) {
      delete process.env.CONTEXTDB_SEMANTIC;
    } else {
      process.env.CONTEXTDB_SEMANTIC = previousSemantic;
    }
    if (previousProvider === undefined) {
      delete process.env.CONTEXTDB_SEMANTIC_PROVIDER;
    } else {
      process.env.CONTEXTDB_SEMANTIC_PROVIDER = previousProvider;
    }
  }
});

test('findLatestSession prefers sidecar lookup and tolerates malformed sibling meta files', async () => {
  const workspace = await makeWorkspace();
  const latest = await createSession({
    workspaceRoot: workspace,
    agent: 'codex-cli',
    project: 'rex-cli',
    goal: 'latest session from sidecar',
  });

  const brokenSessionId = `codex-cli-broken-${Date.now()}`;
  const brokenDir = path.join(workspace, '.aios', 'context-db', 'sessions', brokenSessionId);
  await fs.mkdir(brokenDir, { recursive: true });
  await fs.writeFile(path.join(brokenDir, 'meta.json'), '{this-is-not-json', 'utf8');

  const resolved = await findLatestSession(workspace, 'codex-cli', 'rex-cli');
  assert.equal(resolved?.sessionId, latest.sessionId);
});

test('searchEvents supports CJK queries via lexical fallback', async () => {
  const workspace = await makeWorkspace();
  const session = await createSession({
    workspaceRoot: workspace,
    agent: 'codex-cli',
    project: 'rex-cli',
    goal: 'CJK lexical retrieval',
  });

  await appendEvent({
    workspaceRoot: workspace,
    sessionId: session.sessionId,
    role: 'assistant',
    kind: 'analysis',
    text: '记忆系统需要升级检索和召回策略',
  });

  const results = await searchEvents({
    workspaceRoot: workspace,
    sessionId: session.sessionId,
    query: '记忆系统 升级',
    limit: 5,
  });
  assert.equal(results.results.length, 1);
  assert.match(results.results[0].text, /记忆系统需要升级/);
});

test('searchCheckpoints and searchMemory can retrieve checkpoint evidence', async () => {
  const workspace = await makeWorkspace();
  const session = await createSession({
    workspaceRoot: workspace,
    agent: 'codex-cli',
    project: 'rex-cli',
    goal: 'cross-layer memory search',
  });

  await appendEvent({
    workspaceRoot: workspace,
    sessionId: session.sessionId,
    role: 'assistant',
    kind: 'response',
    text: 'Investigate retry spikes in context pack stage',
  });
  await writeCheckpoint({
    workspaceRoot: workspace,
    sessionId: session.sessionId,
    status: 'blocked',
    summary: 'Context pack retry spikes persisted after three attempts',
    nextActions: ['Inspect checkpoint telemetry'],
    telemetry: {
      failureCategory: 'retry-spike',
    },
  });

  const checkpointResults = await searchCheckpoints({
    workspaceRoot: workspace,
    sessionId: session.sessionId,
    query: 'retry spikes',
    limit: 5,
  });
  assert.equal(checkpointResults.results.length, 1);
  assert.match(checkpointResults.results[0].summary, /retry spikes/i);

  const memoryResults = await searchMemory({
    workspaceRoot: workspace,
    sessionId: session.sessionId,
    query: 'retry spikes',
    scope: 'all',
    limit: 10,
  });
  assert.equal(memoryResults.results.some((item) => item.itemType === 'event'), true);
  assert.equal(memoryResults.results.some((item) => item.itemType === 'checkpoint'), true);
});

test('recallSessions ranks matched sessions and returns concise highlights', async () => {
  const workspace = await makeWorkspace();
  const target = await createSession({
    workspaceRoot: workspace,
    agent: 'codex-cli',
    project: 'rex-cli',
    goal: 'stabilize retry handling in contextdb',
  });
  const distractor = await createSession({
    workspaceRoot: workspace,
    agent: 'codex-cli',
    project: 'rex-cli',
    goal: 'prepare release notes',
  });

  await appendEvent({
    workspaceRoot: workspace,
    sessionId: target.sessionId,
    role: 'assistant',
    kind: 'analysis',
    text: 'Observed retry spike during context pack generation and sidecar sync',
    refs: ['contextdb/core.ts'],
  });
  await writeCheckpoint({
    workspaceRoot: workspace,
    sessionId: target.sessionId,
    status: 'blocked',
    summary: 'Retry spike still reproduces in context pack stage',
    nextActions: ['inspect retry policy'],
  });
  await appendEvent({
    workspaceRoot: workspace,
    sessionId: distractor.sessionId,
    role: 'assistant',
    kind: 'response',
    text: 'Release notes draft for docs site',
  });

  const recalled = await recallSessions({
    workspaceRoot: workspace,
    query: 'retry spike context pack',
    project: 'rex-cli',
    limit: 3,
    highlightLimit: 3,
    explainScore: true,
  });

  assert.equal(recalled.results.length >= 1, true);
  assert.equal(recalled.results[0].sessionId, target.sessionId);
  assert.match(recalled.results[0].summary, /matched/i);
  assert.equal(recalled.results[0].highlights.length > 0, true);
  assert.equal(recalled.results[0].highlights.some((item) => item.itemType === 'checkpoint'), true);
  assert.equal(Boolean(recalled.results[0].scoreExplanation), true);
  assert.match(String(recalled.results[0].scoreExplanation?.formula || ''), /lexical/i);
  assert.equal((recalled.results[0].scoreExplanation?.matchedCheckpoints || 0) > 0, true);
  assert.equal((recalled.results[0].scoreExplanation?.projectWeight || 0) >= 1, true);
  assert.equal((recalled.results[0].scoreExplanation?.recencyDecay || 0) > 0, true);
});

test('contextdb cli supports recall:sessions', async () => {
  const workspace = await makeWorkspace();
  const session = await createSession({
    workspaceRoot: workspace,
    agent: 'codex-cli',
    project: 'rex-cli',
    goal: 'cli recall coverage',
  });

  await appendEvent({
    workspaceRoot: workspace,
    sessionId: session.sessionId,
    role: 'assistant',
    kind: 'analysis',
    text: 'Memory recall should surface this retry guidance event',
    refs: ['core.ts'],
  });

  const result = runContextDbCli([
    'recall:sessions',
    '--workspace',
    workspace,
    '--project',
    'rex-cli',
    '--query',
    'retry guidance',
    '--limit',
    '3',
    '--highlight-limit',
    '2',
    '--explain-score',
  ]);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse((result.stdout || '{}').trim()) as {
    results?: Array<{
      sessionId?: string;
      summary?: string;
      highlights?: Array<{ itemType?: string }>;
      scoreExplanation?: unknown;
    }>;
  };
  assert.equal(Array.isArray(payload.results), true);
  assert.equal(payload.results?.[0]?.sessionId, session.sessionId);
  assert.match(String(payload.results?.[0]?.summary || ''), /matched|latest/i);
  assert.equal((payload.results?.[0]?.highlights?.length || 0) > 0, true);
  assert.equal(Boolean(payload.results?.[0]?.scoreExplanation), true);
});

test('contextdb cli search supports --scope checkpoints and --scope all', async () => {
  const workspace = await makeWorkspace();
  const session = await createSession({
    workspaceRoot: workspace,
    agent: 'codex-cli',
    project: 'rex-cli',
    goal: 'cli scope coverage',
  });

  await appendEvent({
    workspaceRoot: workspace,
    sessionId: session.sessionId,
    role: 'assistant',
    kind: 'response',
    text: 'memory retrieval retry guidance',
  });
  await writeCheckpoint({
    workspaceRoot: workspace,
    sessionId: session.sessionId,
    status: 'blocked',
    summary: 'retry guidance checkpoint',
  });

  const checkpointsOnly = runContextDbCli([
    'search',
    '--workspace',
    workspace,
    '--session',
    session.sessionId,
    '--query',
    'retry guidance',
    '--scope',
    'checkpoints',
    '--limit',
    '5',
  ]);
  assert.equal(checkpointsOnly.status, 0, checkpointsOnly.stderr || checkpointsOnly.stdout);
  const checkpointPayload = JSON.parse((checkpointsOnly.stdout || '{}').trim()) as { results?: Array<{ checkpointId?: string }> };
  assert.equal(Array.isArray(checkpointPayload.results), true);
  assert.equal((checkpointPayload.results?.[0]?.checkpointId ?? '').includes('#C'), true);

  const allScope = runContextDbCli([
    'search',
    '--workspace',
    workspace,
    '--session',
    session.sessionId,
    '--query',
    'retry guidance',
    '--scope',
    'all',
    '--limit',
    '10',
  ]);
  assert.equal(allScope.status, 0, allScope.stderr || allScope.stdout);
  const allPayload = JSON.parse((allScope.stdout || '{}').trim()) as { results?: Array<{ itemType?: string }> };
  assert.equal(Array.isArray(allPayload.results), true);
  assert.equal(allPayload.results?.some((item) => item.itemType === 'event'), true);
  assert.equal(allPayload.results?.some((item) => item.itemType === 'checkpoint'), true);
});

test('buildContextPacket smart recall includes relevant older checkpoint context', async () => {
  const workspace = await makeWorkspace();
  const session = await createSession({
    workspaceRoot: workspace,
    agent: 'codex-cli',
    project: 'rex-cli',
    goal: 'repair contextdb memory retrieval quality',
  });

  await writeCheckpoint({
    workspaceRoot: workspace,
    sessionId: session.sessionId,
    status: 'blocked',
    summary: 'Failure triage points to contextdb retry loop in memory retrieval',
    nextActions: ['fix memory retrieval'],
    telemetry: { failureCategory: 'retry-loop' },
  });

  for (let i = 0; i < 10; i += 1) {
    await appendEvent({
      workspaceRoot: workspace,
      sessionId: session.sessionId,
      role: 'assistant',
      kind: 'response',
      text: `unrelated status update ${i}`,
    });
  }

  const packet = await buildContextPacket({
    workspaceRoot: workspace,
    sessionId: session.sessionId,
    eventLimit: 6,
    recallStrategy: 'smart',
  });

  assert.match(packet.markdown, /Relevant Checkpoints \(L1\+\)/);
  assert.match(packet.markdown, /contextdb retry loop/i);
});

test('searchEvents refs filter uses normalized event_refs exact matching', async () => {
  const workspace = await makeWorkspace();
  const session = await createSession({
    workspaceRoot: workspace,
    agent: 'codex-cli',
    project: 'rex-cli',
    goal: 'refs exact matching',
  });

  await appendEvent({
    workspaceRoot: workspace,
    sessionId: session.sessionId,
    role: 'assistant',
    kind: 'response',
    text: 'primary ref hit',
    refs: ['mcp-server/src/contextdb/core.ts'],
  });
  await appendEvent({
    workspaceRoot: workspace,
    sessionId: session.sessionId,
    role: 'assistant',
    kind: 'response',
    text: 'similar-looking ref should not match exact filter',
    refs: ['mcp-server/src/contextdb/core.ts.bak'],
  });

  const found = await searchEvents({
    workspaceRoot: workspace,
    sessionId: session.sessionId,
    refs: ['mcp-server/src/contextdb/core.ts'],
    limit: 10,
  });

  assert.equal(found.results.length, 1);
  assert.match(found.results[0].text, /primary ref hit/);
});

test('searchEvents incrementally syncs sidecar rows from filesystem without full rebuild', async () => {
  const workspace = await makeWorkspace();
  const session = await createSession({
    workspaceRoot: workspace,
    agent: 'codex-cli',
    project: 'rex-cli',
    goal: 'incremental sync from files',
  });

  await appendEvent({
    workspaceRoot: workspace,
    sessionId: session.sessionId,
    role: 'assistant',
    kind: 'response',
    text: 'existing indexed row',
  });

  const sessionDir = path.join(workspace, '.aios', 'context-db', 'sessions', session.sessionId);
  const eventsPath = path.join(sessionDir, 'l2-events.jsonl');
  const statePath = path.join(sessionDir, 'state.json');
  const ts = new Date().toISOString();
  await fs.appendFile(eventsPath, `${JSON.stringify({
    seq: 2,
    ts,
    role: 'assistant',
    kind: 'response',
    text: 'filesystem-only event pending sidecar sync',
    refs: ['docs/pending.md'],
  })}\n`, 'utf8');

  const state = JSON.parse(await fs.readFile(statePath, 'utf8')) as { lastEventSeq?: number; lastEventAt?: string };
  state.lastEventSeq = 2;
  state.lastEventAt = ts;
  await fs.writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');

  const found = await searchEvents({
    workspaceRoot: workspace,
    sessionId: session.sessionId,
    query: 'filesystem-only event pending sidecar sync',
    limit: 5,
  });

  assert.equal(found.results.length, 1);
  assert.match(found.results[0].text, /filesystem-only event pending sidecar sync/);
});
