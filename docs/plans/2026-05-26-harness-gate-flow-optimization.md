# Harness Gate Flow Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make harness gates advance user goals by asking concrete, recoverable questions only when the next action truly needs human confirmation.

**Architecture:** Keep existing safety boundaries, but turn gate output into structured decisions (`allow`, `warn`, `approval-required`, `clarify`, `blocked`) with reasons, questions, and resume guidance. Narrow lightweight human-gate scans to actionable intent so background AGENTS/skill text does not trigger false blocks. Preserve strict merge/quality safety while making blocker details actionable.

**Tech Stack:** Node.js ESM, `node:test`, existing AIOS harness modules, generated skill sync from `skill-sources/`.

---

### Task 1: Lightweight Human Gate Decision Contract

**Files:**
- Modify: `scripts/tests/harness-runtime.test.mjs`
- Modify: `skill-sources/harness-init-runner/assets/template/harness/lib/human-gate.mjs`
- Modify: `skill-sources/harness-init-runner/assets/template/harness/run.mjs`

- [ ] **Step 1: Write failing tests**

Add tests that import `skill-sources/harness-init-runner/assets/template/harness/lib/human-gate.mjs` and prove: background text mentioning `git push` does not block; an explicit `Run git push now` task asks for approval; approval output contains a concrete question and resume guidance.

- [ ] **Step 2: Run red test**

Run: `node --test scripts/tests/harness-runtime.test.mjs`
Expected: FAIL because the current human gate blocks all sensitive terms and has no structured decision/question fields.

- [ ] **Step 3: Implement minimal decision contract**

Update `evaluateHumanGate` to return backward-compatible `allowed` plus `decision`, `reasons`, `warnings`, `question`, `recommendedAction`, and `resumeHint`. Detect explicit sensitive actions, skip negated/background references, and keep `--allow-risk` as an explicit override.

- [ ] **Step 4: Update runner UX**

Change `run.mjs` from generic `blocked by human gate` to `confirmation required by human gate`, print the question, recommended action, and `--allow-risk` resume hint. Print warnings without stopping when `decision=warn`.

- [ ] **Step 5: Run green test**

Run: `node --test scripts/tests/harness-runtime.test.mjs`
Expected: PASS.

### Task 2: AIOS Clarity Gate Questions and False-Positive Filtering

**Files:**
- Modify: `scripts/tests/aios-orchestrator.test.mjs`
- Modify: `scripts/lib/harness/clarity-gate/signals.mjs`
- Modify: `scripts/lib/harness/clarity-gate/evaluate.mjs`
- Modify: `scripts/lib/harness/dispatch-insights.mjs`

- [ ] **Step 1: Write failing tests**

Add tests that prove clarity gate skips negated command examples like `Do not run git push`, and when it does need human input it returns `decision`, `question`, and specific next actions.

- [ ] **Step 2: Run red test**

Run: `node --test scripts/tests/aios-orchestrator.test.mjs`
Expected: FAIL because current clarity gate flags negated command text and lacks structured question fields.

- [ ] **Step 3: Implement signal filtering and structured gate result**

Add a shared negation/background filter for risk samples. Update `evaluateClarityGate` to split blocking reasons from warnings, set `decision`, and build an operator-facing question/resume action.

- [ ] **Step 4: Surface structured clarity guidance in insights**

Update `buildDispatchInsights` to use `clarityGate.question` and `clarityGate.nextActions` when present instead of generic review text.

- [ ] **Step 5: Run green test**

Run: `node --test scripts/tests/aios-orchestrator.test.mjs`
Expected: PASS.

### Task 3: Merge Gate Blocker Details

**Files:**
- Modify: `scripts/tests/aios-orchestrator.test.mjs`
- Modify: `scripts/lib/harness/subagent-runtime/merge-gate.mjs`

- [ ] **Step 1: Write failing test**

Assert blocked merge-gate output includes details for blocked handoffs, ownership violations, conflicts, and a concrete operator question.

- [ ] **Step 2: Run red test**

Run: `node --test scripts/tests/aios-orchestrator.test.mjs`
Expected: FAIL because current merge output only exposes counts.

- [ ] **Step 3: Implement minimal details**

Include `blocked`, `ownershipViolations`, `conflicts`, `question`, and `nextAction` in `output.mergeResult` for blocked merge jobs.

- [ ] **Step 4: Run green test**

Run: `node --test scripts/tests/aios-orchestrator.test.mjs`
Expected: PASS.

### Task 4: Sync Skills and Verify

**Files:**
- Generated: `.codex/skills/harness-init-runner/**`
- Generated: `.claude/skills/harness-init-runner/**`
- Generated: `.gemini/skills/harness-init-runner/**`
- Generated: `.opencode/skills/harness-init-runner/**`

- [ ] **Step 1: Sync generated skill roots**

Run: `node scripts/sync-skills.mjs`
Expected: generated skill roots match `skill-sources/`.

- [ ] **Step 2: Run targeted tests**

Run: `node --test scripts/tests/harness-runtime.test.mjs scripts/tests/aios-orchestrator.test.mjs`
Expected: PASS.

- [ ] **Step 3: Run repository script tests**

Run: `npm run test:scripts`
Expected: PASS.

- [ ] **Step 4: Capture review context**

Run code-review-graph `detect_changes(detail_level="minimal")` and confirm blast radius matches expected harness/skill/test files.
