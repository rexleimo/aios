# AIOS Commander CLI Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the most brittle AIOS CLI command plumbing with a Commander-backed entry layer, an Inquirer-powered interactive picker, and Chalk-styled operator output while preserving existing command behavior.

**Architecture:** Keep the existing runtime handlers intact and introduce a focused CLI shell that owns command routing, version/help presentation, and the no-argument interactive path. Preserve the current parsed-command shape so downstream lifecycle modules are not rewritten in the same pass.

**Tech Stack:** Node.js ESM, `commander`, `@inquirer/prompts`, `chalk`, Node test runner.

---

### Task 1: Lock CLI Parser Behavior

**Files:**
- Modify: `scripts/tests/aios-cli.test.mjs`
- Modify: `package.json`
- Modify: `package-lock.json`

- [x] **Step 1: Write failing tests**

Add tests that require Commander-style option support (`--flag=value`), the conventional Commander `-V` version alias, and declared direct dependencies for `commander`, `@inquirer/prompts`, and `chalk`.

- [x] **Step 2: Verify red**

Run: `node --test scripts/tests/aios-cli.test.mjs`

Expected: FAIL because current parser rejects equals-form options, does not handle `-V`, and package dependencies are missing.

### Task 2: Add Commander-Compatible Parsing Boundary

**Files:**
- Modify: `scripts/lib/cli/parse-args.mjs`
- Create: `scripts/lib/cli/interactive.mjs`
- Create: `scripts/lib/cli/commander-app.mjs`
- Modify: `scripts/aios.mjs`

- [x] **Step 1: Add direct imports/dependencies**

Add direct package dependencies and use `import { Command } from 'commander'`, `import { select } from '@inquirer/prompts'`, and `import chalk from 'chalk'` in the CLI layer.

- [x] **Step 2: Preserve existing parsed-command shape**

Normalize `--flag=value` into the existing parser flow and support `-V` as a version alias so current downstream handlers keep working.

- [x] **Step 3: Add interactive command picker**

When `aios` runs with no arguments in a TTY, use an Inquirer `select` prompt to choose the TUI, help, doctor, or setup. Preserve the existing non-TTY help fallback.

- [x] **Step 4: Move the executable entry to Commander actions**

`scripts/aios.mjs` now constructs an `aios` Commander program from `scripts/lib/cli/commander-app.mjs`, then dispatches parsed commands from Commander actions instead of manually parsing `process.argv` in the executable.

### Task 3: Verification

**Files:**
- Verify: `scripts/tests/aios-cli.test.mjs`
- Verify: `package.json`
- Verify: `package-lock.json`
- Verify: `scripts/aios.mjs`
- Verify: `scripts/lib/cli/parse-args.mjs`
- Verify: `scripts/lib/cli/interactive.mjs`

- [x] **Step 1: Run targeted test**

Run: `node --test scripts/tests/aios-cli.test.mjs`

Expected: PASS.

- [x] **Step 2: Run required root script suite**

Run: `npm run test:scripts`

Actual: PASS (`564` tests, `0` failures).

- [x] **Step 3: Completion audit**

Confirm the final artifacts map to the explicit request: Commander import and command boundary, Inquirer select prompt, Chalk output styling, direct dependencies, and preserved AIOS command behavior.

### Task 4: Split Single-Responsibility Boundaries

**Files:**
- Modify: `scripts/aios.mjs`
- Create: `scripts/lib/cli/dispatch.mjs`
- Create: `scripts/lib/cli/dispatch/*.mjs`
- Modify: `scripts/lib/cli/parse-args.mjs`
- Create: `scripts/lib/cli/parse-args/*.mjs`
- Create: `scripts/lib/cli/fragment-parser.mjs`
- Modify: `scripts/lib/lifecycle/learn-eval.mjs`
- Modify: `scripts/lib/lifecycle/orchestrate.mjs`
- Modify: `scripts/tests/aios-cli.test.mjs`

- [x] **Step 1: Thin the executable launcher**

Move parsed-command dispatch, internal component routing, workspace resolution, and offload command execution out of `scripts/aios.mjs`. Keep the executable responsible for root discovery, Commander creation, and top-level error rendering.

- [x] **Step 2: Split the legacy parser boundary**

Turn `scripts/lib/cli/parse-args.mjs` into a small compatibility router and move shared helpers plus execution/workflow/maintenance/top-level command parsing into focused modules under `scripts/lib/cli/parse-args/`.

- [x] **Step 3: Share embedded CLI fragment parsing**

Replace duplicated `node scripts/aios.mjs ...` fragment parsing in `learn-eval` and `orchestrate` with `scripts/lib/cli/fragment-parser.mjs`.

- [x] **Step 4: Re-run full verification**

Run targeted CLI tests and the required root `npm run test:scripts` suite after the split.
