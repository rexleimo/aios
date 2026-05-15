# Kiro CLI Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Kiro CLI as a supported AIOS client at the deep native layer, shell bridge, and runtime paths.

**Architecture:** Extend the existing client registry and home-directory resolution so Kiro is treated like the other supported clients. Add a Kiro shell bridge entry so interactive CLI usage still inherits ContextDB auto-load behavior. Add Kiro native emitters and agent sync so the workspace can materialize `.kiro` steering, MCP settings, agents, and skills.

**Tech Stack:** Node.js 22 ESM, zsh/PowerShell wrappers, native sync emitters, Node test runner.

---

### Task 1: Client registry and wrapper tests

**Files:**
- Modify: `scripts/tests/aios-components.test.mjs`
- Modify: `scripts/tests/native-source-tree.test.mjs`
- Modify: `scripts/tests/native-sync.test.mjs`

- [x] **Step 1: Write the failing test**

Add assertions that:
- `getClientHomes()` includes `kiro`
- setup/update/uninstall client selection accepts `kiro`
- native manifest/source-tree accepts `kiro`

- [x] **Step 2: Run test to verify it fails**

Run:
```bash
node --test scripts/tests/aios-components.test.mjs scripts/tests/native-source-tree.test.mjs scripts/tests/native-sync.test.mjs
```

- [x] **Step 3: Write minimal implementation**

Add `kiro` to the client white-lists and home-dir mapping.

- [x] **Step 4: Run test to verify it passes**

Run:
```bash
node --test scripts/tests/aios-components.test.mjs scripts/tests/native-source-tree.test.mjs scripts/tests/native-sync.test.mjs
```

### Task 2: ContextDB shell bridge support

**Files:**
- Modify: `scripts/contextdb-shell.zsh`
- Modify: `scripts/contextdb-shell.ps1`
- Modify: `scripts/contextdb-shell-bridge.mjs`
- Modify: `scripts/ctx-agent-core.mjs`
- Modify: `scripts/lib/components/shell.mjs`
- Modify: `scripts/tests/aios-wrappers.test.mjs`
- Modify: `scripts/tests/contextdb-shell-bridge-codex-home.test.mjs`
- Modify: `scripts/tests/ctx-agent-core.test.mjs`

- [x] **Step 1: Write the failing test**

Add coverage for:
- a `kiro` wrapper path
- `kiro-cli` agent identity
- blocked admin subcommands still bypass wrapping

- [x] **Step 2: Run test to verify it fails**

Run:
```bash
node --test scripts/tests/aios-wrappers.test.mjs scripts/tests/contextdb-shell-bridge-codex-home.test.mjs scripts/tests/ctx-agent-core.test.mjs
```

- [x] **Step 3: Write minimal implementation**

Add the Kiro command/function path and keep routed execution falling back to existing supported subagent runtimes.

- [x] **Step 4: Run test to verify it passes**

Run:
```bash
node --test scripts/tests/aios-wrappers.test.mjs scripts/tests/contextdb-shell-bridge-codex-home.test.mjs scripts/tests/ctx-agent-core.test.mjs
```

### Task 3: Native sync for Kiro steering and MCP

**Files:**
- Create: `scripts/lib/native/emitters/kiro.mjs`
- Modify: `scripts/lib/native/sync.mjs`
- Modify: `scripts/lib/native/doctor.mjs`
- Modify: `scripts/lib/native/repairs.mjs`
- Modify: `scripts/lib/native/source-tree.mjs`
- Modify: `config/native-sync-manifest.json`
- Create: `client-sources/native-base/kiro/project/mcp.json`
- Create: `client-sources/native-base/kiro/project/steering.md`
- Modify: `scripts/tests/native-sync.test.mjs`
- Modify: `scripts/tests/native-doctor.test.mjs`
- Modify: `scripts/tests/native-source-tree.test.mjs`

- [x] **Step 1: Write the failing test**

Add coverage for:
- Kiro native sync output paths under `.kiro/`
- Kiro metadata/doctor drift reporting
- Kiro native source-tree plan resolution

- [x] **Step 2: Run test to verify it fails**

Run:
```bash
node --test scripts/tests/native-source-tree.test.mjs scripts/tests/native-sync.test.mjs scripts/tests/native-doctor.test.mjs
```

- [x] **Step 3: Write minimal implementation**

Render `.kiro/steering/AIOS.md` and `.kiro/settings/mcp.json` from `client-sources/native-base/kiro/project`.

- [x] **Step 4: Run test to verify it passes**

Run:
```bash
node --test scripts/tests/native-source-tree.test.mjs scripts/tests/native-sync.test.mjs scripts/tests/native-doctor.test.mjs
```

### Task 4: Docs and verification

**Files:**
- Modify: `README-zh.md`
- Modify: `CLAUDE.md`
- Modify: `AGENTS.md`

- [x] **Step 1: Update user-facing client lists**

Mention Kiro as a supported compatibility client and note that live `team/subagent/harness` execution still uses the existing supported runtimes.

- [ ] **Step 2: Run full verification**

Run:
```bash
node --test scripts/tests/aios-components.test.mjs scripts/tests/aios-wrappers.test.mjs scripts/tests/contextdb-shell-bridge-codex-home.test.mjs scripts/tests/ctx-agent-core.test.mjs scripts/tests/native-source-tree.test.mjs scripts/tests/native-sync.test.mjs scripts/tests/native-doctor.test.mjs
node --test --import tsx scripts/lib/tui-ink/tests/tui-ink.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(kiro): add Kiro CLI compatibility support"
```
