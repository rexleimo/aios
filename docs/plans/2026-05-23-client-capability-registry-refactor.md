# Client Capability Registry Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace scattered client-specific `if/else` logic with a single capability registry that drives client selection, skill roots, agent targets, and supported feature checks.

**Architecture:** Add one canonical registry module for AIOS clients and their capabilities, then make existing consumers ask the registry for selection and support decisions instead of duplicating client lists. Keep behavior unchanged: codex, claude, gemini, and opencode still resolve exactly as before, but unsupported feature paths become explicit and testable.

**Tech Stack:** Node.js ESM, `node:test`, existing AIOS script modules

---

### Task 1: Add the client capability registry

**Files:**
- Create: `scripts/lib/clients/registry.mjs`
- Test: `scripts/tests/client-registry.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ALL_CLIENTS,
  resolveClientSelection,
  resolveClientsWithCapability,
  resolveClientSkillRoots,
} from '../lib/clients/registry.mjs';

test('registry exposes all canonical clients in stable order', () => {
  assert.deepEqual(ALL_CLIENTS, ['codex', 'claude', 'gemini', 'opencode']);
});

test('registry filters unsupported capability clients', () => {
  assert.deepEqual(resolveClientsWithCapability('superpowers', 'all'), ['codex', 'claude']);
  assert.deepEqual(resolveClientsWithCapability('agents', 'all'), ['codex', 'claude']);
});

test('registry returns project skill roots for every selected client', () => {
  assert.deepEqual(
    resolveClientSkillRoots('all'),
    ['.codex/skills', '.claude/skills', '.gemini/skills', '.opencode/skills', '.agents/skills']
  );
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test scripts/tests/client-registry.test.mjs`
Expected: fail because `scripts/lib/clients/registry.mjs` does not exist yet.

- [ ] **Step 3: Write the minimal registry implementation**

```js
export const ALL_CLIENTS = Object.freeze(['codex', 'claude', 'gemini', 'opencode']);
export function resolveClientSelection(client = 'all') { /* normalize and validate */ }
export function resolveClientsWithCapability(capability, client = 'all') { /* filter by capability */ }
export function resolveClientSkillRoots(client = 'all') { /* return project skill roots */ }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test scripts/tests/client-registry.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/clients/registry.mjs scripts/tests/client-registry.test.mjs
git commit -m "refactor: add client capability registry"
```

### Task 2: Replace duplicated client lists in consumers

**Files:**
- Modify: `scripts/lib/components/skills.mjs`
- Modify: `scripts/lib/agents/sync.mjs`
- Modify: `scripts/lib/components/superpowers.mjs`
- Modify: `scripts/lib/lifecycle/harness.mjs`
- Modify: `scripts/lib/lifecycle/options.mjs`
- Modify: `scripts/lib/native/source-tree.mjs`

- [ ] **Step 1: Update tests first**

Add coverage that proves unsupported clients are skipped while supported clients still resolve:

```js
test('codex-only superpowers doctor does not inspect claude homes', async () => {
  /* existing behavior preserved */
});

test('harness dry-run indexes .opencode/skills', async () => {
  /* new capability-aware skill root behavior */
});
```

- [ ] **Step 2: Run the focused tests to see the current failures**

Run:
`node --test scripts/tests/aios-components.test.mjs scripts/tests/harness-runtime.test.mjs scripts/tests/native-source-tree.test.mjs`

- [ ] **Step 3: Refactor each consumer to call the registry**

Use the registry to:
- normalize `client` / `all`
- return supported client subsets for `agents` and `superpowers`
- expose project skill roots in one place
- keep the native client manifest and lifecycle options aligned

- [ ] **Step 4: Re-run the focused tests**

Run the same `node --test` command and confirm all tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/components/skills.mjs scripts/lib/agents/sync.mjs scripts/lib/components/superpowers.mjs scripts/lib/lifecycle/harness.mjs scripts/lib/lifecycle/options.mjs scripts/lib/native/source-tree.mjs
git commit -m "refactor: centralize client capability checks"
```

### Task 3: Verify end-to-end behavior

**Files:**
- Modify: `scripts/tests/*`

- [ ] **Step 1: Run the full script test suite**

Run: `npm run test:scripts`
Expected: all tests pass with no new cache or temp files staged.

- [ ] **Step 2: Run the mcp-server checks if any shared runtime changed**

Run:
```bash
cd mcp-server
npm run typecheck && npm run test && npm run build
```

- [ ] **Step 3: Re-run the release preflight if release artifacts were touched**

Run: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\release-preflight.ps1 -Tag v1.20.8 -AllowDirty`

- [ ] **Step 4: Commit the final integration**

```bash
git add -A
git commit -m "refactor: centralize client capability architecture"
```

### Task 4: Split provider/runtime adapters beyond the first registry pass

**Files:**
- Create: `scripts/lib/clients/providers/index.mjs`
- Create: `scripts/lib/clients/runtime/identifiers.mjs`
- Create: `scripts/lib/clients/runtime/arguments.mjs`
- Create: `scripts/lib/harness/subagent-clients/structured-output.mjs`
- Modify: `scripts/lib/clients/core/definitions.mjs`
- Modify: `scripts/lib/cli/parse-args/shared.mjs`
- Modify: `scripts/lib/model-router.mjs`
- Modify: `scripts/lib/harness/subagent-runtime.mjs`
- Modify: `scripts/lib/native/sync.mjs`
- Modify: `scripts/lib/native/doctor.mjs`
- Modify: `scripts/lib/hud/state.mjs`
- Modify: `scripts/lib/harness/hindsight-eval.mjs`
- Test: `scripts/tests/client-registry.test.mjs`
- Test: `scripts/tests/harness-runtime.test.mjs`

- [x] **Step 1: Add failing tests for provider subsets and runtime argument adapters**

Run: `node --test scripts/tests/client-registry.test.mjs`
Observed: failed because `scripts/lib/clients/providers/index.mjs` did not exist.

- [x] **Step 2: Move runtime identifiers/arguments into focused modules**

Runtime client IDs, command names, model argument flags, and unattended permission flags now come from client definitions and runtime helper modules instead of consumer-level `if/else`.

- [x] **Step 3: Add provider capability helpers**

Team and harness provider selection now uses `resolveClientTeamProviders()`, `resolveClientHarnessProviders()`, and `buildTeamProviderRuntimeClientMap()`.

- [x] **Step 4: Isolate Codex structured output behavior behind a subagent client adapter**

`subagent-runtime.mjs` no longer owns the Codex last-message temp-dir branch; it asks `subagent-clients/structured-output.mjs` whether the selected runtime supports structured output.

- [x] **Step 5: Verify focused suites**

Run:
```bash
node --test scripts/tests/client-registry.test.mjs scripts/tests/aios-cli.test.mjs scripts/tests/ctx-agent-core.test.mjs scripts/tests/harness-runtime.test.mjs scripts/tests/harness-profiles.test.mjs scripts/tests/hud-state.test.mjs scripts/tests/native-route-commands.test.mjs
node --test scripts/tests/native-sync.test.mjs scripts/tests/native-doctor.test.mjs scripts/tests/hud-state.test.mjs scripts/tests/harness-runtime.test.mjs scripts/tests/client-registry.test.mjs
```
Observed: both focused suites passed.
