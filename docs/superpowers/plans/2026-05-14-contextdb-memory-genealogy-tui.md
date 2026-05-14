# ContextDB Memory Genealogy TUI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only Memory Genealogy browser to the existing `npm run aios` Ink TUI.

**Architecture:** Reuse the existing ContextDB genealogy builder directly from the TUI and keep rendering-specific shaping in a pure formatter module. Add one new Ink screen, wire it into the existing route/menu, and cover the formatter plus imports with focused tests.

**Tech Stack:** Node 22, TypeScript/TSX via `tsx`, React 18, Ink 4, `react-router`, existing ContextDB genealogy TypeScript builder.

---

## Existing Worktree Constraint

The repository has unrelated or pre-existing dirty changes. During implementation, only edit these TUI-related files unless the user explicitly expands scope:

- `scripts/lib/tui-ink/genealogy-view.ts`
- `scripts/lib/tui-ink/screens/MemoryGenealogyScreen.tsx`
- `scripts/lib/tui-ink/screens/MainScreen.tsx`
- `scripts/lib/tui-ink/App.tsx`
- `scripts/lib/tui-ink/tests/tui-ink.test.ts`

Do not run `git add -A`, `git commit`, `git reset`, or checkout commands in this implementation pass.

## File Structure

- `scripts/lib/tui-ink/genealogy-view.ts`
  - Owns pure formatting helpers for graph rows, summary labels, and node details.
  - Imports only types from `mcp-server/src/contextdb/genealogy.ts`.

- `scripts/lib/tui-ink/screens/MemoryGenealogyScreen.tsx`
  - Owns Ink state and keyboard controls.
  - Loads graph data via `buildMemoryGenealogyGraph()`.
  - Renders summary, rows, selected detail, warnings, and footer hints.

- `scripts/lib/tui-ink/screens/MainScreen.tsx`
  - Adds the `Memory Genealogy` menu item.

- `scripts/lib/tui-ink/App.tsx`
  - Adds the `/memory-genealogy` route.

- `scripts/lib/tui-ink/tests/tui-ink.test.ts`
  - Extends import coverage for the new screen and formatter.
  - Adds pure formatter behavior tests.

---

### Task 1: Add Pure Genealogy View Formatter

**Files:**
- Create: `scripts/lib/tui-ink/genealogy-view.ts`
- Modify: `scripts/lib/tui-ink/tests/tui-ink.test.ts`

- [ ] **Step 1: Write formatter import and behavior tests**

Add this import test to `scripts/lib/tui-ink/tests/tui-ink.test.ts` near the existing import tests:

```ts
test('genealogy view formatter can be imported', async () => {
  const view = await import('../genealogy-view.ts');
  assert.ok(view.formatGenealogyRows, 'formatGenealogyRows should be exported');
  assert.ok(view.formatNodeDetails, 'formatNodeDetails should be exported');
  assert.ok(view.formatRiskSummary, 'formatRiskSummary should be exported');
});
```

Add this formatter behavior test to the same file:

```ts
test('genealogy view formatter creates readable hierarchy rows and details', async () => {
  const {
    formatGenealogyRows,
    formatNodeDetails,
    formatRiskSummary,
  } = await import('../genealogy-view.ts');

  const graph = {
    schemaVersion: 1,
    generatedAt: '2026-05-14T00:00:00.000Z',
    project: 'aios',
    root: 'project:aios',
    limits: {
      requestedLimit: 40,
      includeEvents: false,
      eventsPerSession: 10,
    },
    summary: {
      nodes: 4,
      edges: 3,
      sessions: 1,
      checkpoints: 1,
      events: 0,
      refs: 1,
      hiddenEvents: 2,
      risks: {
        none: 2,
        stale: 0,
        blocked: 0,
        failed: 0,
        'missing-evidence': 1,
      },
    },
    nodes: [
      {
        id: 'project:aios',
        type: 'project',
        label: 'aios',
        summary: 'AIOS project memory.',
        project: 'aios',
        trust: 1,
        risk: 'none',
        refs: [],
      },
      {
        id: 'session:s1',
        type: 'session',
        label: 's1',
        summary: 'Build memory genealogy TUI.',
        sessionId: 's1',
        project: 'aios',
        agent: 'codex-cli',
        status: 'running',
        ts: '2026-05-14T01:00:00.000Z',
        trust: 0.8,
        risk: 'none',
        refs: ['scripts/lib/tui-ink/App.tsx'],
      },
      {
        id: 'checkpoint:s1:1',
        type: 'checkpoint',
        label: 'checkpoint 1',
        summary: 'Formatter designed.',
        sessionId: 's1',
        status: 'done',
        ts: '2026-05-14T01:05:00.000Z',
        trust: 0.7,
        risk: 'missing-evidence',
        refs: ['scripts/lib/tui-ink/genealogy-view.ts'],
      },
      {
        id: 'ref:scripts-lib-tui-ink-genealogy-view.ts',
        type: 'ref',
        label: 'scripts/lib/tui-ink/genealogy-view.ts',
        summary: 'Referenced TUI formatter file.',
        sourcePath: 'scripts/lib/tui-ink/genealogy-view.ts',
        trust: 0.6,
        risk: 'none',
        refs: [],
      },
    ],
    edges: [
      { source: 'project:aios', target: 'session:s1', type: 'contains', strength: 1 },
      { source: 'session:s1', target: 'checkpoint:s1:1', type: 'summarizes', strength: 1 },
      { source: 'checkpoint:s1:1', target: 'ref:scripts-lib-tui-ink-genealogy-view.ts', type: 'references', strength: 1 },
    ],
    warnings: [],
  } as const;

  const rows = formatGenealogyRows(graph);
  assert.equal(rows[0]?.nodeId, 'project:aios');
  assert.equal(rows.some((row) => row.nodeId === 'session:s1' && row.depth === 1), true);
  assert.equal(rows.some((row) => row.nodeId === 'checkpoint:s1:1' && row.depth === 2), true);
  assert.equal(rows.some((row) => row.nodeId.startsWith('ref:') && row.depth === 3), true);

  const details = formatNodeDetails(graph.nodes[2]);
  assert.equal(details.some((line) => line.includes('Risk: missing-evidence')), true);
  assert.equal(details.some((line) => line.includes('scripts/lib/tui-ink/genealogy-view.ts')), true);

  assert.equal(formatRiskSummary(graph.summary.risks), 'none 2 | missing-evidence 1');
});
```

- [ ] **Step 2: Run the focused TUI test to verify it fails**

Run:

```bash
npx tsx --test scripts/lib/tui-ink/tests/tui-ink.test.ts
```

Expected: FAIL because `scripts/lib/tui-ink/genealogy-view.ts` does not exist yet.

- [ ] **Step 3: Create the formatter implementation**

Create `scripts/lib/tui-ink/genealogy-view.ts`:

```ts
import type {
  MemoryGenealogyGraph,
  MemoryGenealogyNode,
  MemoryGenealogyRisk,
} from '../../../mcp-server/src/contextdb/genealogy.ts';

export interface GenealogyRow {
  id: string;
  nodeId: string;
  depth: number;
  label: string;
  detail: string;
  node: MemoryGenealogyNode;
}

const RISK_ORDER: MemoryGenealogyRisk[] = ['failed', 'blocked', 'missing-evidence', 'stale', 'none'];
const PRIMARY_EDGE_TYPES = new Set(['contains', 'summarizes', 'references']);
const MAX_ROWS = 120;

function clip(value: unknown, maxLength: number): string {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(1, maxLength)).trimEnd()}...`;
}

function nodeRank(node: MemoryGenealogyNode): number {
  const ranks: Record<string, number> = {
    project: 0,
    'workspace-memory': 1,
    session: 2,
    checkpoint: 3,
    continuity: 4,
    handoff: 5,
    event: 6,
    ref: 7,
  };
  return ranks[node.type] ?? 99;
}

function sortNodes(a: MemoryGenealogyNode, b: MemoryGenealogyNode): number {
  const rankDelta = nodeRank(a) - nodeRank(b);
  if (rankDelta !== 0) return rankDelta;
  return String(b.ts ?? '').localeCompare(String(a.ts ?? '')) || a.label.localeCompare(b.label);
}

function makeDetail(node: MemoryGenealogyNode): string {
  const parts = [node.type];
  if (node.status) parts.push(node.status);
  if (node.agent) parts.push(node.agent);
  if (node.risk !== 'none') parts.push(`risk:${node.risk}`);
  parts.push(`trust:${Math.round(node.trust * 100)}%`);
  if (node.ts) parts.push(node.ts.slice(0, 10));
  return parts.join(' | ');
}

function buildChildren(graph: MemoryGenealogyGraph): Map<string, MemoryGenealogyNode[]> {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const children = new Map<string, MemoryGenealogyNode[]>();

  for (const edge of graph.edges) {
    if (!PRIMARY_EDGE_TYPES.has(edge.type)) continue;
    const target = byId.get(edge.target);
    if (!target) continue;
    const current = children.get(edge.source) ?? [];
    if (!current.some((node) => node.id === target.id)) current.push(target);
    children.set(edge.source, current);
  }

  for (const [source, nodes] of children) {
    children.set(source, nodes.sort(sortNodes));
  }

  return children;
}

export function formatGenealogyRows(graph: MemoryGenealogyGraph): GenealogyRow[] {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const children = buildChildren(graph);
  const rows: GenealogyRow[] = [];
  const seen = new Set<string>();

  const visit = (node: MemoryGenealogyNode, depth: number) => {
    if (seen.has(node.id) || rows.length >= MAX_ROWS) return;
    seen.add(node.id);
    rows.push({
      id: `${rows.length}:${node.id}`,
      nodeId: node.id,
      depth,
      label: clip(node.label || node.id, 54),
      detail: makeDetail(node),
      node,
    });

    for (const child of children.get(node.id) ?? []) {
      visit(child, depth + 1);
    }
  };

  const root = byId.get(graph.root) ?? graph.nodes.find((node) => node.type === 'project');
  if (root) visit(root, 0);

  for (const node of [...graph.nodes].sort(sortNodes)) {
    if (!seen.has(node.id)) visit(node, 0);
  }

  return rows;
}

export function formatRiskSummary(risks: Record<MemoryGenealogyRisk, number>): string {
  const visible = RISK_ORDER
    .map((risk) => [risk, risks[risk] ?? 0] as const)
    .filter(([, count]) => count > 0);
  if (visible.length === 0) return 'none 0';
  return visible.map(([risk, count]) => `${risk} ${count}`).join(' | ');
}

export function formatNodeDetails(node: MemoryGenealogyNode): string[] {
  const lines = [
    `Type: ${node.type}`,
    `ID: ${node.id}`,
    `Risk: ${node.risk}`,
    `Trust: ${Math.round(node.trust * 100)}%`,
  ];

  if (node.status) lines.push(`Status: ${node.status}`);
  if (node.agent) lines.push(`Agent: ${node.agent}`);
  if (node.sessionId) lines.push(`Session: ${node.sessionId}`);
  if (node.project) lines.push(`Project: ${node.project}`);
  if (node.ts) lines.push(`Time: ${node.ts}`);
  if (node.sourcePath) lines.push(`Source: ${node.sourcePath}`);
  if (node.summary) lines.push(`Summary: ${clip(node.summary, 220)}`);
  if (node.refs.length > 0) lines.push(`Refs: ${node.refs.slice(0, 6).join(', ')}`);
  if (node.hiddenRaw) lines.push('Raw: hidden by default; press E to reload with redacted events.');

  return lines;
}
```

- [ ] **Step 4: Run the focused TUI test to verify it passes**

Run:

```bash
npx tsx --test scripts/lib/tui-ink/tests/tui-ink.test.ts
```

Expected: PASS for all TUI import and formatter tests.

---

### Task 2: Add Memory Genealogy Screen

**Files:**
- Create: `scripts/lib/tui-ink/screens/MemoryGenealogyScreen.tsx`
- Modify: `scripts/lib/tui-ink/tests/tui-ink.test.ts`

- [ ] **Step 1: Add import coverage for the new screen**

In the existing `screens can be imported` test in `scripts/lib/tui-ink/tests/tui-ink.test.ts`, add:

```ts
  const genealogy = await import('../screens/MemoryGenealogyScreen.tsx');
```

Then add this assertion with the other screen assertions:

```ts
  assert.ok(genealogy.MemoryGenealogyScreen, 'MemoryGenealogyScreen should be exported');
```

- [ ] **Step 2: Run the focused TUI test to verify it fails**

Run:

```bash
npx tsx --test scripts/lib/tui-ink/tests/tui-ink.test.ts
```

Expected: FAIL because `MemoryGenealogyScreen.tsx` does not exist yet.

- [ ] **Step 3: Create the screen implementation**

Create `scripts/lib/tui-ink/screens/MemoryGenealogyScreen.tsx`:

```tsx
import React from 'react';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Box, Text, useInput } from 'ink';
import path from 'node:path';

import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import {
  formatGenealogyRows,
  formatNodeDetails,
  formatRiskSummary,
  type GenealogyRow,
} from '../genealogy-view';
import { buildMemoryGenealogyGraph } from '../../../../mcp-server/src/contextdb/genealogy.ts';
import type { MemoryGenealogyGraph } from '../../../../mcp-server/src/contextdb/genealogy.ts';

interface MemoryGenealogyScreenProps {
  rootDir: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function resolveWorkspaceRoot(rootDir: string): string {
  return process.env.AIOS_PROJECT_ROOT || rootDir;
}

function resolveProjectName(workspaceRoot: string): string {
  const name = path.basename(workspaceRoot).trim();
  return name || 'aios';
}

export function MemoryGenealogyScreen({ rootDir }: MemoryGenealogyScreenProps) {
  const navigate = useNavigate();
  const workspaceRoot = resolveWorkspaceRoot(rootDir);
  const project = resolveProjectName(workspaceRoot);
  const [includeEvents, setIncludeEvents] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [graph, setGraph] = useState<MemoryGenealogyGraph | null>(null);
  const [rows, setRows] = useState<GenealogyRow[]>([]);
  const [error, setError] = useState('');
  const [lastUpdatedAt, setLastUpdatedAt] = useState('');
  const refreshInFlight = useRef(false);

  const refreshGraph = useCallback(async (nextIncludeEvents = includeEvents) => {
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;
    try {
      setError('');
      const nextGraph = await buildMemoryGenealogyGraph({
        workspaceRoot,
        project,
        limit: 40,
        includeEvents: nextIncludeEvents,
        eventsPerSession: 10,
      });
      const nextRows = formatGenealogyRows(nextGraph);
      setGraph(nextGraph);
      setRows(nextRows);
      setCursor((prev) => clamp(prev, 0, Math.max(0, nextRows.length - 1)));
      setLastUpdatedAt(new Date().toISOString());
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setGraph(null);
      setRows([]);
      setCursor(0);
    } finally {
      refreshInFlight.current = false;
    }
  }, [includeEvents, project, workspaceRoot]);

  useEffect(() => {
    void refreshGraph(includeEvents);
  }, [includeEvents, refreshGraph]);

  useInput(
    useCallback((input, key) => {
      if (key.upArrow) {
        setCursor((prev) => clamp(prev - 1, 0, Math.max(0, rows.length - 1)));
        return;
      }
      if (key.downArrow) {
        setCursor((prev) => clamp(prev + 1, 0, Math.max(0, rows.length - 1)));
        return;
      }
      if (input === 'e' || input === 'E') {
        setIncludeEvents((prev) => !prev);
        return;
      }
      if (input === 'r' || input === 'R') {
        void refreshGraph(includeEvents);
        return;
      }
      if (input === 'b' || input === 'B') {
        navigate('/');
      }
    }, [includeEvents, navigate, refreshGraph, rows.length])
  );

  const selected = rows[cursor];
  const visibleRows = rows.slice(Math.max(0, cursor - 5), Math.max(11, cursor + 6));
  const summary = graph?.summary;
  const eventState = includeEvents
    ? 'Events: showing redacted raw nodes'
    : 'Events: hidden (press E to reveal redacted raw events)';

  return (
    <Box flexDirection="column" padding={1}>
      <Header rootDir={rootDir} />
      <Text bold>Memory Genealogy</Text>
      <Text dimColor>Workspace: {workspaceRoot}</Text>
      <Text dimColor>{eventState}</Text>

      {summary ? (
        <Box flexDirection="column" marginY={1}>
          <Text>
            Project {graph?.project} | Nodes {summary.nodes} | Edges {summary.edges} | Sessions {summary.sessions} | Checkpoints {summary.checkpoints} | Hidden events {summary.hiddenEvents}
          </Text>
          <Text>Risks: {formatRiskSummary(summary.risks)}</Text>
          {graph?.warnings.length ? <Text color="yellow">Warnings: {graph.warnings.length}</Text> : null}
        </Box>
      ) : null}

      {error ? (
        <Box marginY={1}>
          <Text color="red">Error: {error}</Text>
        </Box>
      ) : null}

      {!error && rows.length === 0 ? (
        <Box marginY={1}>
          <Text dimColor>No genealogy rows found for project {project}. Press R to refresh or B to go back.</Text>
        </Box>
      ) : null}

      {rows.length > 0 ? (
        <Box flexDirection="column" marginY={1}>
          {visibleRows.map((row) => {
            const index = rows.findIndex((candidate) => candidate.id === row.id);
            const active = index === cursor;
            const indent = '  '.repeat(Math.min(row.depth, 5));
            return (
              <Text key={row.id} color={active ? 'cyan' : undefined} bold={active}>
                {active ? '> ' : '  '}{indent}{row.label} [{row.detail}]
              </Text>
            );
          })}
        </Box>
      ) : null}

      {selected ? (
        <Box flexDirection="column" marginY={1}>
          <Text bold>Selected</Text>
          {formatNodeDetails(selected.node).slice(0, 10).map((line) => (
            <Text key={line} dimColor>{line}</Text>
          ))}
          {graph?.warnings.length ? (
            <Text color="yellow">First warning: {graph.warnings[0]}</Text>
          ) : null}
        </Box>
      ) : null}

      <Text dimColor>
        {lastUpdatedAt ? `Last refresh: ${lastUpdatedAt}. ` : ''}Use Up/Down, E events, R refresh, B back.
      </Text>
      <Footer hints={['Up/Down Navigate', 'E Events', 'R Refresh', 'B Back', 'Q Quit']} />
    </Box>
  );
}
```

- [ ] **Step 4: Run the focused TUI test to verify it passes**

Run:

```bash
npx tsx --test scripts/lib/tui-ink/tests/tui-ink.test.ts
```

Expected: PASS for import tests and formatter tests.

---

### Task 3: Wire the Screen Into the Existing TUI

**Files:**
- Modify: `scripts/lib/tui-ink/App.tsx`
- Modify: `scripts/lib/tui-ink/screens/MainScreen.tsx`

- [ ] **Step 1: Add the route import and route**

In `scripts/lib/tui-ink/App.tsx`, add this import near the other screen imports:

```ts
import { MemoryGenealogyScreen } from './screens/MemoryGenealogyScreen';
```

Add this route after the existing `/hud` route:

```tsx
      <Route
        path="/memory-genealogy"
        element={<MemoryGenealogyScreen rootDir={rootDir} />}
      />
```

- [ ] **Step 2: Add the main menu item**

In `scripts/lib/tui-ink/screens/MainScreen.tsx`, add this option after `HUD`:

```ts
  { label: 'Memory Genealogy', value: 'memory-genealogy' },
```

- [ ] **Step 3: Run the focused TUI test**

Run:

```bash
npx tsx --test scripts/lib/tui-ink/tests/tui-ink.test.ts
```

Expected: PASS.

---

### Task 4: Verify ContextDB Compatibility and Type Safety

**Files:**
- No additional edits expected.

- [ ] **Step 1: Run focused ContextDB tests**

Run:

```bash
cd mcp-server && npm run test:contextdb
```

Expected: PASS.

- [ ] **Step 2: Run mcp-server typecheck**

Run:

```bash
cd mcp-server && npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Run root script tests**

Run:

```bash
npm run test:scripts
```

Expected: PASS.

- [ ] **Step 4: Run a non-interactive TUI import smoke**

Run:

```bash
npx tsx --test scripts/lib/tui-ink/tests/tui-ink.test.ts
```

Expected: PASS.

---

### Task 5: Final Diff Review

**Files:**
- Review only TUI files listed in this plan.

- [ ] **Step 1: Confirm changed TUI files**

Run:

```bash
git status --short -- scripts/lib/tui-ink/genealogy-view.ts scripts/lib/tui-ink/screens/MemoryGenealogyScreen.tsx scripts/lib/tui-ink/screens/MainScreen.tsx scripts/lib/tui-ink/App.tsx scripts/lib/tui-ink/tests/tui-ink.test.ts
```

Expected: only the five TUI files show as modified or untracked.

- [ ] **Step 2: Review the scoped diff**

Run:

```bash
git diff -- scripts/lib/tui-ink/genealogy-view.ts scripts/lib/tui-ink/screens/MemoryGenealogyScreen.tsx scripts/lib/tui-ink/screens/MainScreen.tsx scripts/lib/tui-ink/App.tsx scripts/lib/tui-ink/tests/tui-ink.test.ts
```

Expected: diff contains only formatter, screen, menu, route, and focused test changes.

- [ ] **Step 3: Report verification evidence**

In the final response, report:

```text
Implemented Memory Genealogy in the existing AIOS Ink TUI.
Verified with:
- npx tsx --test scripts/lib/tui-ink/tests/tui-ink.test.ts
- cd mcp-server && npm run test:contextdb
- cd mcp-server && npm run typecheck
- npm run test:scripts
```

Do not claim the interactive TUI was manually exercised unless `npm run aios` was actually opened in a TTY and the screen was navigated.

---

## Self-Review

- Spec coverage: The plan covers the main menu entry, read-only genealogy screen, direct builder data flow, hidden events by default, explicit event toggle, refresh, back navigation, empty/error states, formatter tests, and ContextDB compatibility checks.
- Placeholder scan: The plan contains no unresolved placeholder markers.
- Type consistency: `MemoryGenealogyGraph`, `MemoryGenealogyNode`, `MemoryGenealogyRisk`, `GenealogyRow`, `formatGenealogyRows`, `formatNodeDetails`, and `formatRiskSummary` use consistent names across tests, formatter, and screen.
- Scope control: The plan only touches TUI files and avoids unrelated dirty worktree changes.
