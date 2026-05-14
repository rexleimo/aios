# ContextDB Memory Genealogy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first usable ContextDB memory genealogy surface: a read-only graph JSON command that maps project, workspace memory, sessions, checkpoints, continuity/handoff, refs, and optionally events into a user-inspectable "Memory Galaxy" payload.

**Architecture:** Add a focused `genealogy.ts` graph builder beside the existing ContextDB core. Keep source-of-truth reads filesystem-first, avoid schema migrations, and expose the feature through `contextdb genealogy --json` so later TUI/browser views can consume the same payload.

**Tech Stack:** TypeScript ESM, Node.js filesystem APIs, existing ContextDB session layout, `node:test`, current `npm run contextdb` CLI.

---

## File Structure

- Create `mcp-server/src/contextdb/genealogy.ts`
  - Owns graph types, filesystem reads, node/edge construction, trust/risk heuristics, and limits.
- Modify `mcp-server/src/contextdb/cli.ts`
  - Imports `buildMemoryGenealogyGraph`, adds help text, parses `genealogy` options, prints JSON.
- Modify `mcp-server/tests/contextdb.test.ts`
  - Adds direct builder and CLI coverage.
- Modify `docs-site/contextdb.md`
  - Documents `contextdb genealogy` as the Memory Galaxy data source.

## Task 1: Add Genealogy Graph Builder

**Files:**
- Create: `mcp-server/src/contextdb/genealogy.ts`
- Test: `mcp-server/tests/contextdb.test.ts`

- [ ] **Step 1: Write failing builder test**

Append this test near the other ContextDB core tests in `mcp-server/tests/contextdb.test.ts` and add `buildMemoryGenealogyGraph` to the imports.

```ts
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

  const sessionDir = path.join(workspace, 'memory', 'context-db', 'sessions', session.sessionId);
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
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd mcp-server
npm run test:contextdb -- --test-name-pattern "buildMemoryGenealogyGraph maps"
```

Expected: FAIL because `buildMemoryGenealogyGraph` is not exported yet.

- [ ] **Step 3: Create `genealogy.ts` with graph contracts**

Create `mcp-server/src/contextdb/genealogy.ts` with exported types:

```ts
export type MemoryGenealogyNodeType =
  | 'project'
  | 'workspace-memory'
  | 'session'
  | 'checkpoint'
  | 'event'
  | 'continuity'
  | 'handoff'
  | 'ref';

export type MemoryGenealogyEdgeType =
  | 'contains'
  | 'summarizes'
  | 'inherits'
  | 'references'
  | 'relates'
  | 'risk';

export type MemoryGenealogyRisk = 'none' | 'stale' | 'blocked' | 'failed' | 'missing-evidence';

export interface MemoryGenealogyNode {
  id: string;
  type: MemoryGenealogyNodeType;
  label: string;
  summary: string;
  sessionId?: string;
  project?: string;
  agent?: string;
  status?: string;
  sourcePath?: string;
  ts?: string;
  trust: number;
  risk: MemoryGenealogyRisk;
  refs: string[];
  hiddenRaw?: boolean;
  metadata?: Record<string, unknown>;
}

export interface MemoryGenealogyEdge {
  source: string;
  target: string;
  type: MemoryGenealogyEdgeType;
  strength: number;
  label?: string;
}

export interface MemoryGenealogyGraph {
  schemaVersion: 1;
  generatedAt: string;
  project: string;
  root: string;
  limits: {
    requestedLimit: number;
    includeEvents: boolean;
    eventsPerSession: number;
  };
  summary: {
    nodes: number;
    edges: number;
    sessions: number;
    checkpoints: number;
    events: number;
    refs: number;
    hiddenEvents: number;
    risks: Record<MemoryGenealogyRisk, number>;
  };
  nodes: MemoryGenealogyNode[];
  edges: MemoryGenealogyEdge[];
  warnings: string[];
}

export interface BuildMemoryGenealogyInput {
  workspaceRoot: string;
  project?: string;
  sessionId?: string;
  limit?: number;
  includeEvents?: boolean;
  eventsPerSession?: number;
}
```

- [ ] **Step 4: Implement filesystem graph builder**

In the same file, implement:

```ts
export async function buildMemoryGenealogyGraph(input: BuildMemoryGenealogyInput): Promise<MemoryGenealogyGraph> {
  const workspaceRoot = path.resolve(input.workspaceRoot);
  const requestedLimit = normalizeLimit(input.limit, 40);
  const includeEvents = input.includeEvents === true;
  const eventsPerSession = normalizeLimit(input.eventsPerSession, 20);
  const dbRoot = path.join(workspaceRoot, 'memory', 'context-db');
  const sessionsRoot = path.join(dbRoot, 'sessions');
  const generatedAt = new Date().toISOString();
  const project = input.project || 'workspace';
  const root = `project:${project}`;
  const nodes = new Map<string, MemoryGenealogyNode>();
  const edges: MemoryGenealogyEdge[] = [];
  const warnings: string[] = [];

  addNode(nodes, {
    id: root,
    type: 'project',
    label: project,
    summary: `ContextDB memory genealogy for ${project}`,
    project,
    sourcePath: path.join('memory', 'context-db'),
    trust: 1,
    risk: 'none',
    refs: [],
  });

  await addWorkspaceMemoryNode({ workspaceRoot, dbRoot, project, root, nodes, edges, warnings });

  const metas = await readSessionMetas(sessionsRoot, warnings);
  const filtered = metas
    .filter((item) => !input.project || item.meta.project === input.project)
    .filter((item) => !input.sessionId || item.meta.sessionId === input.sessionId)
    .sort((left, right) => String(right.meta.updatedAt || '').localeCompare(String(left.meta.updatedAt || '')))
    .slice(0, requestedLimit);

  let hiddenEvents = 0;
  let emittedEvents = 0;
  for (const item of filtered) {
    const sessionNodeId = `session:${item.meta.sessionId}`;
    const sessionRisk = riskFromStatus(item.meta.status);
    addNode(nodes, {
      id: sessionNodeId,
      type: 'session',
      label: `${item.meta.agent} · ${clip(item.meta.goal, 48)}`,
      summary: item.meta.goal,
      sessionId: item.meta.sessionId,
      project: item.meta.project,
      agent: item.meta.agent,
      status: item.meta.status,
      sourcePath: toRelative(workspaceRoot, path.join(item.dir, 'meta.json')),
      ts: item.meta.updatedAt || item.meta.createdAt,
      trust: trustFromStatus(item.meta.status),
      risk: sessionRisk,
      refs: [],
      metadata: { tags: item.meta.tags || [] },
    });
    addEdge(edges, root, sessionNodeId, 'contains', 1, 'session');
    if (sessionRisk !== 'none') addEdge(edges, sessionNodeId, root, 'risk', 0.7, sessionRisk);

    const checkpoints = await readJsonLines<SessionCheckpoint>(path.join(item.dir, 'l1-checkpoints.jsonl'), warnings);
    const events = await readJsonLines<SessionEvent>(path.join(item.dir, 'l2-events.jsonl'), warnings);
    hiddenEvents += includeEvents ? Math.max(0, events.length - eventsPerSession) : events.length;

    for (const checkpoint of checkpoints.slice(-10)) {
      const seq = normalizeSeq(checkpoint.seq, checkpoints.indexOf(checkpoint) + 1);
      const checkpointNodeId = `checkpoint:${item.meta.sessionId}#C${seq}`;
      const refs = normalizeStringArray([...(checkpoint.artifacts || []), ...(checkpoint.nextActions || [])]);
      const checkpointRisk = riskFromCheckpoint(checkpoint);
      addNode(nodes, {
        id: checkpointNodeId,
        type: 'checkpoint',
        label: `C${seq} · ${checkpoint.status || item.meta.status}`,
        summary: checkpoint.summary || 'No checkpoint summary recorded.',
        sessionId: item.meta.sessionId,
        project: item.meta.project,
        agent: item.meta.agent,
        status: checkpoint.status,
        sourcePath: toRelative(workspaceRoot, path.join(item.dir, 'l1-checkpoints.jsonl')),
        ts: checkpoint.ts,
        trust: trustFromCheckpoint(checkpoint),
        risk: checkpointRisk,
        refs,
        metadata: { nextActions: checkpoint.nextActions || [], telemetry: checkpoint.telemetry || {} },
      });
      addEdge(edges, sessionNodeId, checkpointNodeId, 'contains', 0.92, 'checkpoint');
      addRefNodes({ workspaceRoot, nodes, edges, sourceNodeId: checkpointNodeId, refs });
      if (checkpointRisk !== 'none') addEdge(edges, checkpointNodeId, sessionNodeId, 'risk', 0.75, checkpointRisk);
    }

    if (includeEvents) {
      for (const event of events.slice(-eventsPerSession)) {
        const seq = normalizeSeq(event.seq, events.indexOf(event) + 1);
        const eventNodeId = `event:${item.meta.sessionId}#${seq}`;
        const refs = normalizeStringArray(event.refs || []);
        addNode(nodes, {
          id: eventNodeId,
          type: 'event',
          label: `${event.role || 'event'}/${event.kind || 'message'} #${seq}`,
          summary: clip(event.text || '', 180),
          sessionId: item.meta.sessionId,
          project: item.meta.project,
          agent: item.meta.agent,
          sourcePath: toRelative(workspaceRoot, path.join(item.dir, 'l2-events.jsonl')),
          ts: event.ts,
          trust: 0.6,
          risk: refs.length > 0 ? 'none' : 'missing-evidence',
          refs,
          hiddenRaw: true,
          metadata: { role: event.role, kind: event.kind, turn: event.turn || null },
        });
        addEdge(edges, sessionNodeId, eventNodeId, 'contains', 0.55, 'event');
        const latestCheckpoint = checkpoints.length > 0 ? checkpoints[checkpoints.length - 1] : null;
        if (latestCheckpoint) {
          const checkpointNodeId = `checkpoint:${item.meta.sessionId}#C${normalizeSeq(latestCheckpoint.seq, checkpoints.length)}`;
          addEdge(edges, checkpointNodeId, eventNodeId, 'summarizes', 0.45, 'event-window');
        }
        addRefNodes({ workspaceRoot, nodes, edges, sourceNodeId: eventNodeId, refs });
        emittedEvents += 1;
      }
    }

    await addContinuityAndHandoffNodes({ workspaceRoot, sessionDir: item.dir, meta: item.meta, sessionNodeId, nodes, edges, warnings });
  }

  const cappedNodes = Array.from(nodes.values()).slice(0, Math.max(1, requestedLimit * 4));
  const nodeIds = new Set(cappedNodes.map((node) => node.id));
  const cappedEdges = edges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target)).slice(0, requestedLimit * 8);
  const summary = summarizeGraph(cappedNodes, cappedEdges, hiddenEvents, emittedEvents);

  return {
    schemaVersion: 1,
    generatedAt,
    project,
    root,
    limits: { requestedLimit, includeEvents, eventsPerSession },
    summary,
    nodes: cappedNodes,
    edges: cappedEdges,
    warnings,
  };
}
```

- [ ] **Step 5: Add small helpers in `genealogy.ts`**

Add focused helpers used above: `normalizeLimit`, `clip`, `normalizeStringArray`, `readJsonMaybe`, `readJsonLines`, `readSessionMetas`, `addNode`, `addEdge`, `addRefNodes`, `addWorkspaceMemoryNode`, `addContinuityAndHandoffNodes`, `trustFromStatus`, `trustFromCheckpoint`, `riskFromStatus`, `riskFromCheckpoint`, `summarizeGraph`, and `toRelative`.

The key behavior:

```ts
function trustFromStatus(status = ''): number {
  if (status === 'done') return 0.9;
  if (status === 'blocked') return 0.35;
  return 0.65;
}

function riskFromCheckpoint(checkpoint: SessionCheckpoint): MemoryGenealogyRisk {
  if (checkpoint.telemetry?.verification?.result === 'failed') return 'failed';
  if (checkpoint.telemetry?.failureCategory) return 'failed';
  return riskFromStatus(checkpoint.status);
}

function addRefNodes({ workspaceRoot, nodes, edges, sourceNodeId, refs }: {
  workspaceRoot: string;
  nodes: Map<string, MemoryGenealogyNode>;
  edges: MemoryGenealogyEdge[];
  sourceNodeId: string;
  refs: string[];
}): void {
  for (const ref of refs.slice(0, 8)) {
    const id = `ref:${hashId(ref)}`;
    addNode(nodes, {
      id,
      type: 'ref',
      label: path.basename(ref) || ref,
      summary: ref,
      sourcePath: ref,
      trust: 0.7,
      risk: 'none',
      refs: [ref],
      metadata: { exists: existsSync(path.resolve(workspaceRoot, ref)) },
    });
    addEdge(edges, sourceNodeId, id, 'references', 0.72, 'ref');
  }
}
```

- [ ] **Step 6: Run builder test to verify it passes**

Run:

```bash
cd mcp-server
npm run test:contextdb -- --test-name-pattern "buildMemoryGenealogyGraph maps"
```

Expected: PASS.

## Task 2: Wire CLI Command

**Files:**
- Modify: `mcp-server/src/contextdb/cli.ts`
- Test: `mcp-server/tests/contextdb.test.ts`

- [ ] **Step 1: Write failing CLI test**

Append:

```ts
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
```

- [ ] **Step 2: Run CLI test to verify it fails**

Run:

```bash
cd mcp-server
npm run test:contextdb -- --test-name-pattern "contextdb cli genealogy outputs"
```

Expected: FAIL because the command is not wired.

- [ ] **Step 3: Import and add usage**

Modify `mcp-server/src/contextdb/cli.ts`:

```ts
import { buildMemoryGenealogyGraph } from './genealogy.js';
```

Add to `usage()`:

```ts
'  contextdb genealogy [--project <name>] [--session <id>] [--limit 40] [--include-events] [--events-per-session 20] [--json]',
```

- [ ] **Step 4: Add command case**

Add a `case` before `timeline`:

```ts
case 'genealogy': {
  const limit = typeof options.limit === 'string' ? Number(options.limit) : 40;
  const eventsPerSession = typeof options['events-per-session'] === 'string'
    ? Number(options['events-per-session'])
    : 20;
  const result = await buildMemoryGenealogyGraph({
    workspaceRoot,
    project: typeof options.project === 'string' ? options.project : undefined,
    sessionId: typeof options.session === 'string' ? options.session : undefined,
    limit: Number.isFinite(limit) ? limit : 40,
    includeEvents: options['include-events'] === true,
    eventsPerSession: Number.isFinite(eventsPerSession) ? eventsPerSession : 20,
  });
  console.log(JSON.stringify(result, null, 2));
  return;
}
```

- [ ] **Step 5: Run CLI test to verify it passes**

Run:

```bash
cd mcp-server
npm run test:contextdb -- --test-name-pattern "contextdb cli genealogy outputs"
```

Expected: PASS.

## Task 3: Event Expansion and Privacy Defaults

**Files:**
- Modify: `mcp-server/src/contextdb/genealogy.ts`
- Test: `mcp-server/tests/contextdb.test.ts`

- [ ] **Step 1: Write event expansion test**

Append:

```ts
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
```

- [ ] **Step 2: Run test**

Run:

```bash
cd mcp-server
npm run test:contextdb -- --test-name-pattern "includes hidden event nodes"
```

Expected: PASS after Task 1 implementation. If it fails, fix event slicing and `hiddenRaw`.

## Task 4: Docs

**Files:**
- Modify: `docs-site/contextdb.md`

- [ ] **Step 1: Add Memory Genealogy docs**

Insert a section after "Manual Command Examples":

```md
## Memory Genealogy

Use `contextdb genealogy` to inspect ContextDB memory as a graph payload for the Memory Galaxy UI. The command is read-only and works from existing session files and indexes.

```bash
cd mcp-server
npm run contextdb -- genealogy --project aios --limit 40 --json
npm run contextdb -- genealogy --project aios --include-events --events-per-session 10 --json
```

Default output hides raw event nodes so users see sessions, checkpoints, continuity, handoff, and evidence refs first. Add `--include-events` only when a user explicitly expands raw memory details.

Node types include `project`, `workspace-memory`, `session`, `checkpoint`, `continuity`, `handoff`, `event`, and `ref`. Edge types include `contains`, `summarizes`, `inherits`, `references`, `relates`, and `risk`.
```

- [ ] **Step 2: Run docs grep**

Run:

```bash
rg -n "Memory Genealogy|contextdb genealogy|--include-events" docs-site/contextdb.md
```

Expected: all three patterns appear.

## Task 5: Final Verification

**Files:**
- Verify: `mcp-server/src/contextdb/genealogy.ts`
- Verify: `mcp-server/src/contextdb/cli.ts`
- Verify: `mcp-server/tests/contextdb.test.ts`
- Verify: `docs-site/contextdb.md`

- [ ] **Step 1: Run targeted ContextDB suite**

```bash
cd mcp-server
npm run test:contextdb
```

Expected: PASS.

- [ ] **Step 2: Run typecheck**

```bash
cd mcp-server
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Run CLI smoke on current repo**

```bash
cd mcp-server
npm run contextdb -- genealogy --workspace .. --project aios --limit 5 --json
```

Expected: JSON with `schemaVersion: 1`, `root: "project:aios"`, non-empty `nodes`, and `summary`.

- [ ] **Step 4: Run plan placeholder scan**

```bash
rg -n "T[B]D|T[O]DO|implement la[t]er|fill in detai[l]s|Similar to Tas[k]" docs/superpowers/plans/2026-05-14-contextdb-memory-genealogy.md docs/superpowers/specs/2026-05-13-contextdb-memory-genealogy-design.md
```

Expected: no matches.

- [ ] **Step 5: Inspect git diff**

```bash
git diff --stat
git diff -- mcp-server/src/contextdb/genealogy.ts mcp-server/src/contextdb/cli.ts mcp-server/tests/contextdb.test.ts docs-site/contextdb.md
```

Expected: only intended feature, tests, and docs changes.
