# Unified AIOS Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an agent-facing `aios search` command and reusable implementation that searches memo-backed project memory plus local docs, plans, and code references.

**Architecture:** Keep canonical memo storage as the memory source, including pinned memory, and add a small filesystem lexical indexer for project reference files. The top-level CLI delegates to a reusable `scripts/lib/search` module and preserves existing memo `project_shared` / `agent_private` visibility rules by reusing memo storage APIs.

**Tech Stack:** Node.js ESM, built-in `node:test`, existing AIOS CLI parser/dispatcher, existing memo storage APIs.

---

### Task 1: Focused Unified Search Tests

**Files:**
- Create: `scripts/tests/search.test.mjs`

- [x] **Step 1: Write failing tests**

Add tests that import the future reusable search API, create temporary memo/docs/plans/code fixtures, verify private memo filtering by agent, and exercise the real `node scripts/aios.mjs search` command with JSON output.

- [x] **Step 2: Run tests to verify failure**

Run: `node --test scripts/tests/search.test.mjs`
Expected: FAIL because `scripts/lib/search/unified-search.mjs` does not exist yet.

### Task 2: Reusable Search Implementation

**Files:**
- Create: `scripts/lib/search/unified-search.mjs`
- Create: `scripts/lib/search/cli.mjs`
- Create: `scripts/lib/search/search.mjs`

- [x] **Step 1: Implement minimal search API**

Export `searchAiosProject(workspaceRoot, options)` with memory, pinned memory, docs, plans, and code source collectors. Rank lexical matches by exact phrase, token coverage, and source weight.

- [x] **Step 2: Implement CLI renderer**

Export `runSearchCommand(options, { rootDir, stdout })` with text and JSON output.

### Task 3: CLI Wiring and Help

**Files:**
- Modify: `scripts/lib/cli/parse-args.mjs`
- Create: `scripts/lib/cli/parse-args/search.mjs`
- Modify: `scripts/lib/cli/dispatch.mjs`
- Modify: `scripts/lib/cli/commander/specs/memory.mjs`
- Modify: `scripts/lib/cli/help/root.mjs`
- Modify: `scripts/lib/cli/help/commands/maintenance.mjs`

- [x] **Step 1: Add `search` parser and dispatcher route**

Support `aios search <query> [--limit N] [--source memory,docs,plans,code] [--scope <scope>] [--agent <id>] [--workspace <path>] [--json]`.

- [x] **Step 2: Add help text**

Expose the command in root help and command-specific help.

### Task 4: Native Instructions and Release Metadata

**Files:**
- Modify: `client-sources/native-base/shared/partials/contextdb.md`
- Modify: `scripts/tests/native-agent-guidance.test.mjs`
- Modify: `VERSION`
- Modify: `CHANGELOG.md`

- [x] **Step 1: Add native guidance**

Tell agents to use `node scripts/aios.mjs search` before ad-hoc grep when they need project memory plus docs/plans/code references.

- [x] **Step 2: Apply minor version impact**

This is a backward-compatible CLI capability, so bump `1.41.0` to `1.42.0` and add a changelog entry.

### Task 5: Verification and Commit

**Files:**
- All changed files

- [x] **Step 1: Run focused tests**

Run: `node --test scripts/tests/search.test.mjs scripts/tests/memo-scope.test.mjs scripts/tests/native-agent-guidance.test.mjs scripts/tests/aios-cli.test.mjs`

- [x] **Step 2: Run broader script verification**

Run: `npm run test:scripts`

Observed: focused search/native/harness tests pass; broader `npm run test:scripts` still has unrelated residual failures outside this search change. Current clusters include release-status fixtures expecting legacy `experiments/...` paths while runtime writes `.aios/experiments/...`, shell bridge fixture expectations for relative `CODEX_HOME` and opencode fallback provider, native target fixtures missing newer clients such as `crush`/`antigravity`, and a native route fixture missing `client-capabilities.md`.

Harness note: AIOS solo harness was invoked for this objective, and two harness Codex invocation fixes were committed before this search finish pass. The final search harness session (`codex-cli-20260604T125000Z-search-finish2`) reached the corrected Codex command shape but did not return structured JSON before timeout, so the remaining search work continued inline with ContextDB checkpoint evidence.

- [x] **Step 3: Inspect diff and commit**

Run: `git diff --stat`, `git status --short`, then commit with `feat(search): add unified AIOS project search`.
