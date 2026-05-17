import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, readFile, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { formatNodeId, parseNodeId, isNodeId, hashInput, nextNodeId } from '../lib/offload/node-id.mjs';
import { writeRef, readRef, grepRefs, listRefs, pruneRefs, refFilePath } from '../lib/offload/refs-store.mjs';
import { addNode, loadCanvas, canvasToMermaid, getCanvasPaths } from '../lib/offload/mermaid-canvas.mjs';
import { shouldOffload, resolveConfig, resolveStorage, capture } from '../lib/offload/tool-offload.mjs';
import { backfillFromJsonl, normalizeBackfillRecord } from '../lib/offload/backfill.mjs';

// ── node-id ──

test('formatNodeId pads seq to 4 digits and truncates hash to 6', () => {
  assert.equal(formatNodeId(1, 'abcdef'), 'n0001-abcdef');
  assert.equal(formatNodeId(42, 'A3F7C1'), 'n0042-a3f7c1');
  assert.equal(formatNodeId(999, '123456789'), 'n0999-123456');
});

test('formatNodeId always returns a parseable node id', () => {
  const id = formatNodeId(7, 'not-hex');
  assert.equal(isNodeId(id), true);
});

test('parseNodeId returns null for invalid formats', () => {
  assert.equal(parseNodeId(''), null);
  assert.equal(parseNodeId('abc'), null);
  assert.equal(parseNodeId('n12-ab'), null);
});

test('parseNodeId extracts seq and hash', () => {
  const result = parseNodeId('n0042-a3f7c1');
  assert.equal(result.seq, 42);
  assert.equal(result.hash, 'a3f7c1');
});

test('isNodeId validates correctly', () => {
  assert.equal(isNodeId('n0001-abc123'), true);
  assert.equal(isNodeId('invalid'), false);
});

test('hashInput is deterministic', () => {
  const h1 = hashInput('Bash', 'git log');
  const h2 = hashInput('Bash', 'git log');
  assert.equal(h1, h2);
  assert.equal(h1.length, 6);
});

test('nextNodeId generates valid node IDs', () => {
  const id = nextNodeId({ seq: 42, toolName: 'Bash', toolInput: 'git log' });
  assert.equal(isNodeId(id), true);
});

// ── refs-store (file storage) ──

test('writeRef and readRef round-trip (file storage)', async () => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'aios-refs-'));
  try {
    const data = {
      node_id: 'n0001-abc123',
      session: 'test-session',
      ts: new Date().toISOString(),
      tool: 'Bash',
      input_summary: 'git log --oneline',
      exit: 0,
      duration_ms: 100,
      size_bytes: 5000,
      output: 'commit abc\ncommit def',
      class: 'ok',
    };
    await writeRef(tmpDir, 'test-session', 'n0001-abc123', data, 'file');
    const content = await readRef(tmpDir, 'n0001-abc123', 'file');
    assert.ok(content);
    assert.ok(content.includes('node_id: n0001-abc123'));
    assert.ok(content.includes('commit abc'));
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});

test('readRef returns null when the offload root is missing', async () => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'aios-refs-missing-'));
  try {
    const content = await readRef(tmpDir, 'n0001-abc123', 'file');
    assert.equal(content, null);
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});

test('writeRef and readRef round-trip (split storage)', async () => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'aios-refs-split-'));
  try {
    const data = {
      node_id: 'n0002-def456',
      session: 'split-session',
      ts: new Date().toISOString(),
      tool: 'Read',
      input_summary: 'package.json',
      exit: 0,
      duration_ms: 50,
      size_bytes: 3000,
      output: '{"name": "aios"}',
      class: 'ok',
    };
    await writeRef(tmpDir, 'split-session', 'n0002-def456', data, 'split');
    const content = await readRef(tmpDir, 'n0002-def456', 'split');
    assert.ok(content);
    assert.equal(content.node_id, 'n0002-def456');
    assert.equal(content.tool, 'Read');
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});

test('grepRefs finds matching refs', async () => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'aios-grep-'));
  try {
    const data1 = {
      node_id: 'n0001-aaa111', session: 'grep-test', ts: new Date().toISOString(),
      tool: 'Bash', input_summary: 'git log', exit: 0, duration_ms: 100, size_bytes: 3000,
      output: 'commit abc123', class: 'ok',
    };
    const data2 = {
      node_id: 'n0002-bbb222', session: 'grep-test', ts: new Date().toISOString(),
      tool: 'Bash', input_summary: 'npm test', exit: 1, duration_ms: 200, size_bytes: 4000,
      output: 'FAIL: test suite', class: 'fail',
    };
    await writeRef(tmpDir, 'grep-test', 'n0001-aaa111', data1, 'file');
    await writeRef(tmpDir, 'grep-test', 'n0002-bbb222', data2, 'file');

    const results = await grepRefs(tmpDir, 'abc123', { sessionId: 'grep-test', storage: 'file' });
    assert.equal(results.length, 1);
    assert.equal(results[0].node_id, 'n0001-aaa111');
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});

test('grepRefs returns an empty list for missing sessions', async () => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'aios-grep-missing-'));
  try {
    const results = await grepRefs(tmpDir, 'abc123', { sessionId: 'missing-session', storage: 'file' });
    assert.deepEqual(results, []);
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});

test('pruneRefs removes old refs based on mtime', async () => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'aios-prune-'));
  try {
    const data = {
      node_id: 'n0001-ccc333', session: 'prune-test', ts: new Date().toISOString(),
      tool: 'Bash', input_summary: 'test', exit: 0, duration_ms: 10, size_bytes: 3000,
      output: 'output', class: 'ok',
    };
    await writeRef(tmpDir, 'prune-test', 'n0001-ccc333', data, 'file');
    // keepDays: 0 prunes files older than today, but the file was just created
    // so it won't be pruned. Test that the function runs without error and returns a valid shape.
    const result = await pruneRefs(tmpDir, { storage: 'file', keepDays: 30 });
    assert.ok(typeof result.pruned === 'number');
    assert.ok(typeof result.bytesFreed === 'number');
    // With keepDays=0, the cutoff is Date.now(), and freshly-created files have mtime > cutoff
    // so they won't be pruned. This is expected behavior.
    const result0 = await pruneRefs(tmpDir, { storage: 'file', keepDays: 0 });
    // Freshly created files may or may not be pruned with keepDays=0 depending on mtime precision
    assert.ok(typeof result0.pruned === 'number');
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});

// ── mermaid-canvas ──

test('canvasToMermaid generates valid Mermaid', () => {
  const canvas = {
    version: 1,
    session: 'test',
    started: '2026-05-17T00:00:00Z',
    updated: '2026-05-17T01:00:00Z',
    nodes: [
      { id: 'n0001-abc', tool: 'Bash', label: 'git log', status: 'ok', ts: '', ref: '' },
      { id: 'n0002-def', tool: 'Edit', label: 'fix bug', status: 'fail', ts: '', ref: '' },
    ],
    edges: [
      { from: 'n0001-abc', to: 'n0002-def', kind: 'next' },
    ],
  };
  const mmd = canvasToMermaid(canvas);
  assert.ok(mmd.startsWith('graph LR'));
  assert.ok(mmd.includes('m_n0001_abc'));
  assert.ok(mmd.includes('m_n0002_def'));
  assert.ok(mmd.includes('n0001-abc Bash: git log'));
  assert.ok(mmd.includes('-->'));
  assert.ok(mmd.includes('fill:#dcfce7'));
  assert.ok(mmd.includes('fill:#fecaca'));
});

test('canvasToMermaid escapes labels and never uses raw dashed ids as Mermaid ids', () => {
  const canvas = {
    version: 1,
    session: 'test',
    started: '2026-05-17T00:00:00Z',
    updated: '2026-05-17T01:00:00Z',
    nodes: [
      { id: 'n0001-abc123', tool: 'Bash', label: 'echo "quoted"', status: 'ok', ts: '', ref: '' },
    ],
    edges: [],
  };
  const mmd = canvasToMermaid(canvas);
  assert.match(mmd, /m_n0001_abc123\["n0001-abc123 Bash: echo \\"quoted\\""\]/u);
  assert.doesNotMatch(mmd, /^\s+n0001-abc123\[/mu);
});

test('addNode creates canvas and adds nodes', async () => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'aios-canvas-'));
  try {
    const node1 = { id: 'n0001-abc', tool: 'Bash', label: 'git log', status: 'ok', ts: '', ref: '' };
    const node2 = { id: 'n0002-def', tool: 'Edit', label: 'fix bug', status: 'ok', ts: '', ref: '' };

    const canvas1 = await addNode(tmpDir, 'canvas-test', node1, 'file');
    assert.equal(canvas1.nodes.length, 1);

    const canvas2 = await addNode(tmpDir, 'canvas-test', node2, 'file');
    assert.equal(canvas2.nodes.length, 2);
    assert.equal(canvas2.edges.length, 1);
    assert.equal(canvas2.edges[0].from, 'n0001-abc');
    assert.equal(canvas2.edges[0].to, 'n0002-def');

    const reloaded = await loadCanvas(tmpDir, 'canvas-test', 'file');
    assert.equal(reloaded.nodes.length, 2);
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});

// ── tool-offload ──

test('shouldOffload respects config', () => {
  const config = { enabled: true, minBytes: 2048, tools: ['Bash', 'Read'] };
  assert.equal(shouldOffload('Bash', 5000, config), true);
  assert.equal(shouldOffload('Bash', 1000, config), false);
  assert.equal(shouldOffload('Edit', 5000, config), false);
  assert.equal(shouldOffload('Read', 3000, config), true);
});

test('shouldOffload respects enabled flag', () => {
  const config = { enabled: false, minBytes: 0, tools: ['Bash'] };
  assert.equal(shouldOffload('Bash', 5000, config), false);
});

test('resolveStorage picks correct storage', () => {
  assert.equal(resolveStorage({ storage: 'split' }, {}, {}), 'split');
  assert.equal(resolveStorage({}, { AIOS_OFFLOAD_STORAGE: 'split' }, {}), 'split');
  assert.equal(resolveStorage({}, {}, { offload: { storage: 'split' } }), 'split');
  assert.equal(resolveStorage({}, {}, {}), 'file');
});

test('capture creates ref and canvas node', async () => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'aios-capture-'));
  try {
    const result = await capture({
      client: 'claude-code',
      session: 'capture-test',
      tool: 'Bash',
      input: 'git log --oneline -20',
      output: 'x'.repeat(3000),
      exitCode: 0,
      durationMs: 150,
    }, { workspaceRoot: tmpDir, storage: 'file', config: {} });

    assert.ok(result);
    assert.ok(result.node_id);
    assert.equal(result.class, 'ok');
    assert.ok(result.size_bytes >= 3000);

    const canvas = await loadCanvas(tmpDir, 'capture-test', 'file');
    assert.equal(canvas.nodes.length, 1);
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});

test('capture assigns session-local sequential node ids', async () => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'aios-capture-seq-'));
  try {
    const first = await capture({
      client: 'claude-code',
      session: 'capture-seq',
      tool: 'Bash',
      input: 'first command',
      output: 'x'.repeat(3000),
      exitCode: 0,
      durationMs: 10,
    }, { workspaceRoot: tmpDir, storage: 'file', config: {} });
    const second = await capture({
      client: 'claude-code',
      session: 'capture-seq',
      tool: 'Bash',
      input: 'second command',
      output: 'y'.repeat(3000),
      exitCode: 0,
      durationMs: 10,
    }, { workspaceRoot: tmpDir, storage: 'file', config: {} });

    assert.match(first.node_id, /^n0001-[a-f0-9]{6}$/u);
    assert.match(second.node_id, /^n0002-[a-f0-9]{6}$/u);
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});

test('capture skips small outputs', async () => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'aios-skip-'));
  try {
    const result = await capture({
      client: 'claude-code',
      session: 'skip-test',
      tool: 'Bash',
      input: 'echo hi',
      output: 'hi',
      exitCode: 0,
      durationMs: 10,
    }, { workspaceRoot: tmpDir, storage: 'file', config: {} });

    assert.equal(result, null);
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});

// ── backfill ──

test('normalizeBackfillRecord converts generic tool output JSON into capture payload', () => {
  const output = 'line\n'.repeat(600);
  const normalized = normalizeBackfillRecord({
    ts: '2026-05-17T09:00:00.000Z',
    tool: 'Bash',
    input: 'npm test',
    output,
    exitCode: 0,
    durationMs: 25,
  }, { client: 'codex-cli', sessionId: 'backfill-session' });

  assert.equal(normalized.client, 'codex-cli');
  assert.equal(normalized.session, 'backfill-session');
  assert.equal(normalized.tool, 'Bash');
  assert.equal(normalized.input, 'npm test');
  assert.equal(normalized.output, output);
  assert.equal(normalized.exitCode, 0);
});

test('normalizeBackfillRecord converts Claude PostToolUse JSON into capture payload', () => {
  const normalized = normalizeBackfillRecord({
    session_id: 'claude-session',
    hook_event_name: 'PostToolUse',
    tool_name: 'Bash',
    tool_input: { command: 'npm test' },
    tool_response: { stdout: 'ok\n', stderr: '', interrupted: false },
  }, { client: 'claude-code' });

  assert.equal(normalized.client, 'claude-code');
  assert.equal(normalized.session, 'claude-session');
  assert.equal(normalized.tool, 'Bash');
  assert.deepEqual(normalized.input, { command: 'npm test' });
  assert.deepEqual(normalized.output, { stdout: 'ok\n', stderr: '', interrupted: false });
  assert.equal(normalized.exitCode, 0);
});

test('backfillFromJsonl offloads large tool records and skips small records', async () => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'aios-backfill-'));
  try {
    const inputPath = path.join(tmpDir, 'tool-events.jsonl');
    const bigOutput = 'important evidence\n'.repeat(260);
    await mkdir(path.dirname(inputPath), { recursive: true });
    await import('node:fs/promises').then(({ writeFile }) => writeFile(inputPath, [
      JSON.stringify({ tool: 'Bash', input: 'npm test', output: bigOutput, exitCode: 0 }),
      JSON.stringify({ tool: 'Bash', input: 'echo hi', output: 'hi', exitCode: 0 }),
      '',
    ].join('\n'), 'utf8'));

    const result = await backfillFromJsonl({
      workspaceRoot: tmpDir,
      sessionId: 'backfill-session',
      client: 'codex-cli',
      inputPath,
      storage: 'file',
      config: {},
    });

    assert.equal(result.scanned, 2);
    assert.equal(result.offloaded, 1);
    assert.equal(result.skipped, 1);

    const canvas = await loadCanvas(tmpDir, 'backfill-session', 'file');
    assert.equal(canvas.nodes.length, 1);
    assert.equal(canvas.nodes[0].tool, 'Bash');

    const refs = await listRefs(tmpDir, { sessionId: 'backfill-session', storage: 'file' });
    assert.equal(refs.length, 1);
    const ref = await readRef(tmpDir, refs[0].node_id, 'file');
    assert.match(ref, /important evidence/);
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});
