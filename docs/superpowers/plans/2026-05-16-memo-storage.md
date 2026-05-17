# Memo Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Extend `aios memo` with a storage abstraction and two concrete implementations, `split` and `file`, while keeping the user-facing memo API stable.

**Architecture:** `aios memo` calls a memo service layer that delegates canonical reads/writes to `MemoStorage`. `split` stores one JSON object per memo event for Git-friendly diffs; `file` stores append-only JSONL for replay-friendly logs. SQLite/ContextDB indexes remain optional derived caches and are not the canonical memo storage.

**Tech Stack:** Node.js ESM CLI, `node:test`, filesystem JSON/JSONL storage, existing AIOS ContextDB compatibility helpers.

---

## Approved User Contract

```text
aios memo
├── add <text>
├── pin show|set|add
├── search <query>
├── recall [query]
├── gui
└── storage
    ├── status
    ├── use split
    ├── use file
    ├── rebuild
    └── doctor
```

- Do not introduce `aios memory`.
- Do not expose `driver`, `share`, `space`, `index`, `refresh`, or `list` as the new model.
- Keep legacy `memo use`, `memo space list`, and `memo list` working only as hidden compatibility commands if needed.
- `storage rebuild` is always full rebuild. It regenerates derived query files and must not rewrite canonical memo records.
- `storage use <split|file>` switches active storage; if the target has no data, convert from the current active storage or legacy ContextDB workspace-memory records, then full rebuild.
- SQLite is a local cache only. It is never the source of truth for storage status/use/rebuild/doctor.

## File Map

- Create `scripts/lib/memo/storage.mjs`: storage abstraction, `split`/`file` implementations, conversion, rebuild, status, doctor.
- Modify `scripts/lib/memo/memo.mjs`: route `add`, `pin`, `search`, `recall`, hidden compat commands, and `storage` subcommands through the storage service.
- Modify `scripts/lib/cli/help.mjs`: memo and memo-storage command help with explicit `--help` examples.
- Modify `scripts/lib/cli/parse-args.mjs`: preserve memo subcommand path for nested help.
- Modify `scripts/aios.mjs`: print nested memo help using memo help path.
- Modify `scripts/ctx-agent-core.mjs`: read pinned and recent memo overlay through the storage abstraction, with legacy fallback.
- Modify `scripts/tests/aios-cli.test.mjs`: keep existing compatibility coverage green.
- Create `scripts/tests/memo-storage.test.mjs`: focused storage module unit tests.
- Create `scripts/tests/memo-help.test.mjs`: nested memo help tests.
- Create `scripts/tests/memo-cli-integration.test.mjs`: memo storage CLI integration tests.
- Create `docs/reports/2026-05-16-memo-storage-test-report.md`: verification commands, outcomes, and edge cases.

## Agent Team Workstreams

```text
Coordinator (main session)
├─ Owns plan, integration, red/green verification, final report
├─ Worker A: storage module + unit tests
│  └─ Files: scripts/lib/memo/storage.mjs, scripts/tests/memo-storage.test.mjs
├─ Worker B: CLI parse/help + CLI help tests
│  └─ Files: scripts/lib/cli/parse-args.mjs, scripts/lib/cli/help.mjs, scripts/aios.mjs, scripts/tests/memo-help.test.mjs
└─ Worker C: memo service integration + overlay compatibility tests
   └─ Files: scripts/lib/memo/memo.mjs, scripts/ctx-agent-core.mjs, scripts/tests/memo-cli-integration.test.mjs, scripts/tests/ctx-agent-core.test.mjs
```

Workers must not revert or overwrite other workers' files. If a worker needs a file outside its scope, it reports the needed change instead of editing it.

## Task 1: Storage Contract And Unit Tests

**Files:**
- Create: `scripts/lib/memo/storage.mjs`
- Create: `scripts/tests/memo-storage.test.mjs`

- [x] **Step 1: Write failing tests**

Add tests that assert:

```js
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  appendMemoEvent,
  getMemoStorageStatus,
  readPinnedMemo,
  rebuildMemoStorage,
  runMemoStorageDoctor,
  searchMemoEvents,
  switchMemoStorage,
  writePinnedMemo,
} from '../lib/memo/storage.mjs';

test('default storage status uses file without creating canonical records', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'memo-storage-default-'));
  try {
    const status = await getMemoStorageStatus(root);
    assert.equal(status.active, 'file');
    assert.deepEqual(status.supported, ['split', 'file']);
    assert.equal(status.available.file.exists, false);
    await assert.rejects(() => fs.stat(path.join(root, 'memory', 'memo', 'file', 'events.jsonl')));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('file storage appends searchable memo records and rebuilds derived docs only', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'memo-storage-file-'));
  try {
    const first = await appendMemoEvent({ workspaceRoot: root, storage: 'file', space: 'default', text: 'alpha deployment note', refs: ['ops'] });
    const sourcePath = path.join(root, 'memory', 'memo', 'file', 'events.jsonl');
    const before = await fs.readFile(sourcePath, 'utf8');
    await rebuildMemoStorage(root, { storage: 'file' });
    const after = await fs.readFile(sourcePath, 'utf8');
    assert.equal(after, before);
    const rows = await searchMemoEvents(root, { storage: 'file', space: 'default', query: 'deployment', limit: 5 });
    assert.equal(rows[0].eventId, first.eventId);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('split storage writes one JSON file per event and supports pinned memo content', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'memo-storage-split-'));
  try {
    await appendMemoEvent({ workspaceRoot: root, storage: 'split', space: 'default', text: 'split record one', refs: [] });
    await writePinnedMemo(root, { storage: 'split', space: 'default', content: 'Pinned split memo' });
    const eventFiles = await fs.readdir(path.join(root, 'memory', 'memo', 'split', 'events', 'default'));
    assert.equal(eventFiles.length, 1);
    assert.equal(await readPinnedMemo(root, { storage: 'split', space: 'default' }), 'Pinned split memo\n');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('switchMemoStorage converts records and rejects invalid storage names', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'memo-storage-switch-'));
  try {
    await appendMemoEvent({ workspaceRoot: root, storage: 'file', space: 'default', text: 'portable record', refs: ['git'] });
    await switchMemoStorage(root, { target: 'split' });
    const rows = await searchMemoEvents(root, { storage: 'split', space: 'default', query: 'portable', limit: 5 });
    assert.equal(rows.length, 1);
    await assert.rejects(() => switchMemoStorage(root, { target: 'sqlite' }), /storage must be one of: split, file/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('doctor reports malformed file JSONL and stale derived manifest', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'memo-storage-doctor-'));
  try {
    await appendMemoEvent({ workspaceRoot: root, storage: 'file', space: 'default', text: 'healthy record', refs: [] });
    await rebuildMemoStorage(root, { storage: 'file' });
    await fs.appendFile(path.join(root, 'memory', 'memo', 'file', 'events.jsonl'), '{bad-json\n', 'utf8');
    const report = await runMemoStorageDoctor(root, { storage: 'file' });
    assert.equal(report.ok, false);
    assert.equal(report.checks.some((check) => check.id === 'file-jsonl' && check.status === 'error'), true);
    assert.equal(report.checks.some((check) => check.id === 'derived-manifest' && check.status === 'error'), true);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
```

Run: `node --test scripts/tests/memo-storage.test.mjs`
Expected: FAIL because `scripts/lib/memo/storage.mjs` does not exist.

- [x] **Step 2: Implement minimal storage module**

Implement the exact exported functions used by the tests plus internal helpers for paths, atomic writes, JSONL parsing, source hashing, and conversion.

- [x] **Step 3: Verify storage tests pass**

Run: `node --test scripts/tests/memo-storage.test.mjs`
Expected: PASS.

## Task 2: CLI Help And Parser

**Files:**
- Modify: `scripts/lib/cli/parse-args.mjs`
- Modify: `scripts/lib/cli/help.mjs`
- Modify: `scripts/aios.mjs`
- Create: `scripts/tests/memo-help.test.mjs`

- [x] **Step 1: Write failing help tests**

Add tests that spawn:

```bash
node scripts/aios.mjs memo --help
node scripts/aios.mjs memo storage --help
node scripts/aios.mjs memo storage status --help
node scripts/aios.mjs memo storage use --help
node scripts/aios.mjs memo storage rebuild --help
node scripts/aios.mjs memo storage doctor --help
```

Assertions:
- Each exits `0`.
- `memo --help` mentions `storage` and omits `space list` and `list [--limit N]`.
- `memo storage --help` mentions `status`, `use split`, `use file`, `rebuild`, `doctor`.
- Nested help prints command-specific usage.

Run: `node --test scripts/tests/memo-help.test.mjs`
Expected: FAIL because nested memo help is not implemented.

- [x] **Step 2: Implement parser/help changes**

`parseMemoArgs()` must preserve non-help memo path tokens in `options.argv` while setting `mode: 'help'`. `printHelp()` must call `getMemoHelpText(parsed.options.argv)` for memo help.

- [x] **Step 3: Verify help tests pass**

Run: `node --test scripts/tests/memo-help.test.mjs`
Expected: PASS.

## Task 3: Memo Service Integration

**Files:**
- Modify: `scripts/lib/memo/memo.mjs`
- Modify: `scripts/ctx-agent-core.mjs`
- Create: `scripts/tests/memo-cli-integration.test.mjs`
- Modify: `scripts/tests/ctx-agent-core.test.mjs`

- [x] **Step 1: Write failing integration tests**

Add tests for:
- `aios memo add` writes canonical file storage by default under `memory/memo/file/events.jsonl`.
- `aios memo storage use split` converts file records and rebuilds derived docs.
- `aios memo storage rebuild` preserves source event bytes.
- `aios memo storage doctor` exits non-zero on malformed active storage.
- `aios memo search` returns records from the active storage.
- Workspace memory overlay reads new storage records and keeps legacy fallback.

Run focused tests:

```bash
node --test scripts/tests/memo-cli-integration.test.mjs
node --test scripts/tests/ctx-agent-core.test.mjs --test-name-pattern "WorkspaceMemory|workspace memory"
```

Expected: FAIL before integration.

- [x] **Step 2: Implement service routing**

Replace direct ContextDB CLI calls in `memo add`, `pin`, `search`, `list`, and `recall` with storage functions. Keep persona/user/gui unchanged. Keep hidden legacy `memo use` and `memo space list` compatibility.

- [x] **Step 3: Verify focused integration tests pass**

Run the focused tests again.
Expected: PASS.

## Task 4: Edge Cases And Reports

**Files:**
- Modify: `scripts/tests/aios-cli.test.mjs`
- Create: `docs/reports/2026-05-16-memo-storage-test-report.md`

- [x] **Step 1: Add edge-case tests**

Add/confirm coverage for:
- no config default status,
- invalid `storage use` target,
- empty active storage rebuild,
- malformed file JSONL,
- malformed split JSON file,
- stale derived manifest,
- SQLite cache not reported as canonical,
- legacy `.aios/context-db/sessions/workspace-memory--*` import path.

- [x] **Step 2: Run verification suite**

Run:

```bash
node --test scripts/tests/memo-storage.test.mjs
node --test scripts/tests/memo-help.test.mjs
node --test scripts/tests/memo-cli-integration.test.mjs
node --test scripts/tests/aios-cli.test.mjs --test-name-pattern "memo"
node --test scripts/tests/ctx-agent-core.test.mjs --test-name-pattern "WorkspaceMemory|workspace memory"
npm run test:scripts
cd mcp-server && npm run typecheck && npm run test && npm run build
```

- [x] **Step 3: Write final test report**

The report must include command, exit status, notable output, covered edge cases, and remaining risks.
