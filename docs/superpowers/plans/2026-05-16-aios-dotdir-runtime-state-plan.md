# AIOS Dotdir Runtime State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move AIOS-generated runtime state out of intrusive top-level project paths and into a project-local `.aios/` directory while preserving legacy read compatibility.

**Architecture:** Add explicit project-state path helpers and make new runtime writes target `.aios/context-db`, `.aios/tasks`, and `.aios/tmp`. Keep canonical product assets such as `memory/skills`, `memory/specs`, and `memory/knowledge` in place. Support legacy reads from `memory/context-db` and `tasks` only when existing state is present, then expose the selected paths through registry/index output.

**Tech Stack:** Node.js ESM scripts, TypeScript ContextDB core in `mcp-server`, Node test runner, tsx tests.

---

## File Structure

- Create: `scripts/lib/aios/state-root.mjs` — JS helpers for workspace-local runtime paths.
- Create: `mcp-server/src/contextdb/paths.ts` — TS helpers for ContextDB runtime path selection.
- Modify: `scripts/lib/contextdb/context-registry.mjs` — registry path and source paths use `.aios/context-db`.
- Modify: `scripts/lib/memo/workspace-memory.mjs` — workspace memory session state uses `.aios/context-db`.
- Modify: `scripts/lib/contextdb/facade.mjs`, `scripts/lib/contextdb/async-bootstrap*.mjs`, `scripts/lib/contextdb/continuity.mjs` — ContextDB sidecar paths use helper.
- Modify: `scripts/ctx-agent-core.mjs`, `scripts/contextdb-shell-bridge.mjs` — slim prompt references `.aios/context-db/index.json`, marker detection accepts old and new markers.
- Modify: `scripts/ctx-bootstrap.mjs`, `scripts/doctor-bootstrap-task.mjs` — generated task queue defaults to `.aios/tasks` with legacy fallback.
- Modify: `mcp-server/src/contextdb/core.ts`, `mcp-server/src/contextdb/genealogy.ts`, `mcp-server/src/contextdb/hygiene.ts`, `mcp-server/src/contextdb/cli.ts` — ContextDB storage root moves to `.aios/context-db`.
- Modify: `.gitignore`, `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, docs — document `.aios` runtime storage.

## Task 1: Add JS Runtime Path Helpers

**Files:**
- Create: `scripts/lib/aios/state-root.mjs`
- Test: `scripts/tests/aios-state-root.test.mjs`

- [x] **Step 1: Write failing tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  resolveAiosStateRoot,
  resolveContextDbRoot,
  resolveTasksRoot,
  toWorkspaceRelative,
} from '../lib/aios/state-root.mjs';

test('defaults runtime state to .aios under workspace', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'aios-state-root-'));
  assert.equal(resolveAiosStateRoot(root), path.join(root, '.aios'));
  assert.equal(resolveContextDbRoot(root), path.join(root, '.aios', 'context-db'));
  assert.equal(resolveTasksRoot(root), path.join(root, '.aios', 'tasks'));
  assert.equal(toWorkspaceRelative(root, path.join(root, '.aios', 'context-db', 'index.json')), '.aios/context-db/index.json');
});

test('legacy ContextDB root is read when it already exists', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'aios-state-root-legacy-'));
  await mkdir(path.join(root, 'memory', 'context-db'), { recursive: true });
  assert.equal(resolveContextDbRoot(root, { preferLegacyExisting: true }), path.join(root, 'memory', 'context-db'));
  assert.equal(resolveContextDbRoot(root), path.join(root, '.aios', 'context-db'));
});
```

- [x] **Step 2: Run red test**

Run: `node --test scripts/tests/aios-state-root.test.mjs`
Expected: FAIL because `scripts/lib/aios/state-root.mjs` does not exist.

- [x] **Step 3: Implement helpers**

Create `scripts/lib/aios/state-root.mjs` with absolute path helpers and POSIX relative-path formatting.

- [x] **Step 4: Run green test**

Run: `node --test scripts/tests/aios-state-root.test.mjs`
Expected: PASS.

## Task 2: Move JS Registry and Workspace Memory Writes

**Files:**
- Modify: `scripts/lib/contextdb/context-registry.mjs`
- Modify: `scripts/lib/memo/workspace-memory.mjs`
- Test: `scripts/tests/contextdb-lazy-load.test.mjs`
- Test: `scripts/tests/contextdb-facade.test.mjs`

- [x] **Step 1: Add failing tests that `writeIndex()` writes `.aios/context-db/index.json` and `ensureWorkspaceMemorySession()` creates `.aios/context-db/sessions/workspace-memory--default/pinned.md`.
- [x] **Step 2: Verify tests fail on current `memory/context-db` behavior.
- [x] **Step 3: Update registry/source helpers to use `resolveContextDbRoot()` and `.aios/context-db/...` source paths.
- [x] **Step 4: Update workspace-memory helpers to use `resolveContextDbRoot()`.
- [x] **Step 5: Run focused tests.

Commands:
```bash
node --test scripts/tests/aios-state-root.test.mjs scripts/tests/contextdb-lazy-load.test.mjs scripts/tests/contextdb-facade.test.mjs
```

## Task 3: Move Bootstrap Tasks to `.aios/tasks`

**Files:**
- Modify: `scripts/ctx-bootstrap.mjs`
- Modify: `scripts/doctor-bootstrap-task.mjs`
- Test: `scripts/tests/ctx-bootstrap.test.mjs`
- Test: `scripts/tests/doctor-bootstrap-task.test.mjs`

- [x] **Step 1: Add failing tests for `.aios/tasks/pending/...` and `.aios/tasks/.current-task`.
- [x] **Step 2: Verify tests fail because current code writes top-level `tasks/`.
- [x] **Step 3: Update bootstrap and doctor to use `resolveTasksRoot()` with legacy fallback for existing `tasks/`.
- [x] **Step 4: Run focused tests.

Commands:
```bash
node --test scripts/tests/ctx-bootstrap.test.mjs scripts/tests/doctor-bootstrap-task.test.mjs
```

## Task 4: Move TypeScript ContextDB Root

**Files:**
- Create: `mcp-server/src/contextdb/paths.ts`
- Modify: `mcp-server/src/contextdb/core.ts`
- Modify: `mcp-server/src/contextdb/genealogy.ts`
- Modify: `mcp-server/src/contextdb/hygiene.ts`
- Modify: `mcp-server/src/contextdb/cli.ts`
- Test: `mcp-server/tests/contextdb.test.ts`

- [x] **Step 1: Add failing ContextDB test that `ensureContextDb(tempRoot)` creates `.aios/context-db/manifest.json` and does not create `memory/context-db` for new workspaces.
- [x] **Step 2: Verify red test.
- [x] **Step 3: Implement TS path helper and wire ContextDB modules through it.
- [x] **Step 4: Run focused TS tests.

Commands:
```bash
cd mcp-server && npm run test:contextdb && npm run typecheck
```

## Task 5: Update Native Markers, Docs, and Git Hygiene

**Files:**
- Modify: `scripts/contextdb-shell-bridge.mjs`
- Modify: `AGENTS.md`
- Modify: `CLAUDE.md`
- Modify: `GEMINI.md`
- Modify: `.gitignore`
- Test: `scripts/tests/contextdb-shell-bridge-codex-home.test.mjs`

- [x] **Step 1: Add tests that bridge recognizes both `<!-- AIOS: .aios/context-db/index.json -->` and legacy `<!-- AIOS: memory/context-db/index.json -->`.
- [x] **Step 2: Change current generated marker/docs to `.aios/context-db/index.json` while keeping legacy detection.
- [x] **Step 3: Add `.aios/` to ignored runtime state if missing; keep source-managed `.codex`, `.claude`, `.gemini`, `.opencode` behavior unchanged.
- [x] **Step 4: Run bridge/native tests.

Commands:
```bash
node --test scripts/tests/contextdb-shell-bridge-codex-home.test.mjs scripts/tests/native-sync.test.mjs scripts/tests/native-doctor.test.mjs
```

## Verification

- [x] `node --test scripts/tests/aios-state-root.test.mjs scripts/tests/contextdb-lazy-load.test.mjs scripts/tests/contextdb-facade.test.mjs scripts/tests/ctx-bootstrap.test.mjs scripts/tests/doctor-bootstrap-task.test.mjs scripts/tests/contextdb-shell-bridge-codex-home.test.mjs`
- [x] `cd mcp-server && npm run test:contextdb && npm run typecheck`
- [x] `git status --short --ignored .aios memory/context-db tasks .contextdb-enable` shows new generated runtime state under `.aios/` for test fixtures and no new top-level runtime state for fresh workspaces.
