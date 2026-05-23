# Windows OpenCode Shell Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent Windows OpenCode ContextDB wrapper launches from treating injected AIOS context text as `cmd.exe` commands.

**Architecture:** Keep ContextDB handoff behavior when OpenCode can be launched as a direct Node CLI. When Windows can only launch OpenCode through a `.cmd`/`.bat` shell fallback, avoid passing multiline or shell-sensitive context text through command-line arguments and emit a clear fallback warning instead.

**Tech Stack:** Node.js 24 ESM, PowerShell wrapper integration, `node:test`, Windows process spawning.

---

### Task 1: Reproduce the Shell-Fallback OpenCode Failure

**Files:**
- Modify: `scripts/tests/ctx-agent-core.test.mjs`

- [ ] **Step 1: Write the failing test**

Add a fake Windows `opencode.cmd` launcher that is intentionally not resolvable to a direct Node entrypoint, then run `scripts/ctx-agent.mjs --agent opencode-cli --context-mode slim` with a ContextDB auto prompt. Assert the OpenCode shell fallback does not receive `--prompt` and receives no split `Status:` argument.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/tests/ctx-agent-core.test.mjs --test-name-pattern "OpenCode Windows shell fallback"`

Expected: FAIL because current code passes `--prompt` and the AIOS status text through the shell fallback.

### Task 2: Implement Minimal OpenCode Guard

**Files:**
- Modify: `scripts/ctx-agent-core.mjs`

- [ ] **Step 1: Add a helper**

Add a helper that detects `process.platform === 'win32'` and `getCommandSpawnSpec('opencode', [], { env: process.env }).shell === true`.

- [ ] **Step 2: Guard interactive OpenCode prompt injection**

When the helper reports a shell fallback, disable `--prompt` injection for interactive OpenCode runs and warn that the user should install/update OpenCode so AIOS can resolve the native Node entrypoint.

- [ ] **Step 3: Run focused test**

Run: `node --test scripts/tests/ctx-agent-core.test.mjs --test-name-pattern "OpenCode Windows shell fallback"`

Expected: PASS.

### Task 3: Verify Windows Install And TUI Regressions

**Files:**
- Existing changes under `scripts/aios-install.ps1`, `scripts/lib/cli/dispatch.mjs`, `scripts/lib/tui-ink/*`, `scripts/tests/*`

- [ ] **Step 1: Run release/platform smoke tests**

Run: `node --test scripts/tests/release-pipeline.test.mjs scripts/tests/platform-smoke.test.mjs`

Expected: PASS.

- [ ] **Step 2: Run full script suite**

Run: `npm run test:scripts`

Expected: PASS.

- [ ] **Step 3: Run install/goal smoke commands on Windows**

Run dry-run or local-safe commands that cover version, help, setup planning, doctor, shell wrapper, and harness/goal routing without requiring external model/network calls.

Expected: Commands exit successfully or report only documented local prerequisites.

### Task 4: Release v1.20.8

**Files:**
- Modify/confirm: `VERSION`, docs version links, changelog.

- [ ] **Step 1: Confirm version metadata**

Verify `VERSION` and docs point to `v1.20.8`.

- [ ] **Step 2: Stage and commit**

Run `git add -A` and commit with a Conventional Commit message.

- [ ] **Step 3: Publish**

Create/push the release tag or run the repository release command after tests pass.
