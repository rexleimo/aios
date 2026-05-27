# SkillOpt-Lite: Agent-Native Skill Training Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a skill that lets any code agent (opencode/Claude Code/Codex) autonomously optimize its own skill documents using the SkillOpt training methodology — without external API keys, using the agent's own execution and reasoning capabilities as both target and optimizer.

**Architecture:** A single skill (`skill-opt-lite`) that embeds the 6-stage ReflACT pipeline (Rollout → Reflect → Aggregate → Select → Update → Gate) as agent-executable instructions. The agent itself plays both roles: it runs tasks with the current skill (target), then reflects on its own trajectories and proposes edits (optimizer). State is persisted to the filesystem under `.skillopt/`. The skill works with any evaluable task set the user provides.

**Tech Stack:** Markdown skill, filesystem state, agent-native tools (edit, write, read, bash, git). No Python dependencies. No API keys beyond the agent's own session.

---

## Core Concept Mapping: SkillOpt → Agent-Native

| SkillOpt (Python + API) | SkillOpt-Lite (Agent-Native) |
|---|---|
| `python scripts/train.py` | Agent reads skill-opt-lite SKILL.md and follows the loop |
| `target_model` API call | Agent executes task with current skill loaded |
| `optimizer_model` API call | Agent reflects on its own execution logs |
| `rollout()` → list of RolloutResult | Agent runs tasks, records pass/fail per task |
| `reflect()` → list of Patch | Agent analyzes failures, proposes edits |
| `aggregate()` → merged Patch | Agent deduplicates and prioritizes edits |
| `select()` → top-L edits | Agent picks ≤4 edits by impact |
| `apply_patch()` → new skill | Agent uses edit tool to modify skill.md |
| `evaluate_gate()` → accept/reject | Agent re-runs validation tasks, compares score |
| `runtime_state.json` | `.skillopt/state.json` |
| `best_skill.md` | `.skillopt/best_skill.md` |
| `history.json` | `.skillopt/history.jsonl` |
| `step_buffer` (rejected edits) | `.skillopt/step_buffer.json` |
| slow_update (EMA) | Epoch-end review section in skill |
| meta_skill (optimizer memory) | `.skillopt/meta_skill.md` |

## File Structure

```
skill-sources/skill-opt-lite/
├── SKILL.md                          # Main skill instructions (<500 lines)
└── references/
    ├── training-protocol.md          # Detailed 6-stage protocol with prompts
    ├── edit-operations.md            # Edit op spec (append/insert_after/replace/delete)
    └── scoring-guide.md              # How to score tasks, gate logic
```

Installed to:
- `.claude/skills/skill-opt-lite/`
- `~/.claude/skills/skill-opt-lite/`
- `~/.config/opencode/skills/skill-opt-lite/`

---

### Task 1: Create `references/edit-operations.md`

**Files:**
- Create: `skill-sources/skill-opt-lite/references/edit-operations.md`

- [ ] **Step 1: Write the edit operations reference**

This file documents the 4 edit operations and protected region rules, directly adapted from SkillOpt's `optimizer/skill.py` and `types.py`.

```markdown
# Edit Operations Reference

## Operations

| Op | Target Required | Description |
|---|---|---|
| `append` | No | Add content at the end of the skill (before `<!-- SLOW_UPDATE_START -->` if present) |
| `insert_after` | Yes | Insert content after the line containing `target` text |
| `replace` | Yes | Replace exact `target` text with `content` |
| `delete` | Yes | Remove exact `target` text |

## Rules

1. `target` must be an exact substring of the current skill. If not found, the edit is skipped.
2. Only one `replace` or `delete` per unique target (first match only).
3. Edits targeting the protected slow-update region (between `<!-- SLOW_UPDATE_START -->` and `<!-- SLOW_UPDATE_END -->`) are silently skipped — only epoch-end review can modify this region.
4. Each edit must be independent — no edit may depend on a prior edit in the same step applying successfully.
5. `content` for `append` and `insert_after` is markdown to insert. It must not contain slow-update markers.
6. Edits are applied sequentially in the order listed. If an earlier edit changes the skill text such that a later edit's `target` no longer exists, the later edit is skipped.

## Edit Budget (Textual Learning Rate)

- Default: 4 edits per step
- Cosine decay: edit_budget = max(min_budget, round(max_budget * 0.5 * (1 + cos(π * step / total_steps))))
- min_budget defaults to 2
- If edit_budget = 0, skip update (no edits this step)

## Step Buffer

After each step, record:
- Failure patterns observed during rollout
- If step was rejected: the specific edits tried and score change

This buffer is fed into the next step's Reflect phase to avoid repeating ineffective edits.

## Slow Update (Epoch-End Review)

At the end of each epoch, before starting the next:
1. Compare the same validation tasks under previous vs current skill
2. Write a strategic guidance block into the protected region
3. This region cannot be modified by step-level edits

The slow-update content addresses:
- Regressions (right→wrong): HIGHEST priority to fix
- Persistent failures (wrong→wrong): address blind spots
- Improvements (wrong→right): reinforce what worked
- Stable successes (right→right): no action needed
```

- [ ] **Step 2: Verify file exists and is well-formed**

Run: `cat skill-sources/skill-opt-lite/references/edit-operations.md | head -5`
Expected: Shows the table header

---

### Task 2: Create `references/scoring-guide.md`

**Files:**
- Create: `skill-sources/skill-opt-lite/references/scoring-guide.md`

- [ ] **Step 1: Write the scoring and gate reference**

Adapted from SkillOpt's `evaluation/gate.py` and `utils/scoring.py`.

```markdown
# Scoring and Gate Reference

## Task Scoring

Each task result is a dict:
```
{ "id": "<task_id>", "hard": 0|1, "soft": 0.0-1.0, "fail_reason": "..." }
```

- `hard`: 1 if task fully succeeded, 0 if failed. This is the primary metric.
- `soft`: Partial credit score (0.0 to 1.0). Used as tiebreaker only.
- `fail_reason`: One-line explanation of why the task failed (empty on success).

**How to determine hard score:**
- If the task has an objective pass/fail test (e.g., exact match, test passes, file exists with correct content): hard = 1 if pass, 0 if fail
- If the task requires human judgment: hard = 1 if you are confident the task is complete, 0 otherwise. Be strict — a skill that claims success on failures is worse than one that honestly reports failure.
- soft should reflect partial progress: 0.0 = no progress, 0.5 = half done, 1.0 = fully correct

## Batch Score

```
batch_hard = sum(hard for all tasks) / count(tasks)
batch_soft = sum(soft for all tasks) / count(tasks)
```

## Gate Logic

After applying edits and re-running validation tasks:

```
if candidate_hard > current_hard:
    if candidate_hard > best_hard:
        action = "accept_new_best"
        save candidate as best_skill.md
    else:
        action = "accept"
    current_skill = candidate_skill
    current_score = candidate_hard
else:
    action = "reject"
    revert to current_skill (git checkout or rewrite from checkpoint)
```

Gate decisions are strict: equal scores count as reject. Only strictly better scores are accepted.

## Validation Set

- The validation set is separate from the training set.
- Use ~20% of available tasks for validation, or at minimum 3 tasks.
- Validation tasks must not overlap with training tasks.
- The same validation set is used for all gate decisions within a run.

## Stopping Criteria

Training stops when any of:
1. All epochs completed
2. Score reaches 1.0 (perfect on validation)
3. 3 consecutive steps with no score improvement (early stopping)
4. Token budget exhausted (if set)
```

- [ ] **Step 2: Verify file exists**

Run: `cat skill-sources/skill-opt-lite/references/scoring-guide.md | head -5`
Expected: Shows scoring section

---

### Task 3: Create `references/training-protocol.md`

**Files:**
- Create: `skill-sources/skill-opt-lite/references/training-protocol.md`

- [ ] **Step 1: Write the detailed training protocol**

This is the core document — the full 6-stage pipeline translated into agent-executable instructions, with inline prompts adapted from SkillOpt's prompt files.

```markdown
# SkillOpt-Lite Training Protocol

## Overview

This protocol adapts Microsoft's SkillOpt (ReflACT pipeline) for agent-native execution. The agent is both the target model (executing tasks) and the optimizer model (reflecting and editing the skill). No external API keys are needed.

The training loop:

```
for epoch in 1..N:
    for step in 1..steps_per_epoch:
        ① ROLLOUT  — execute tasks with current skill, record results
        ② REFLECT  — analyze failures and successes, propose edits
        ③ AGGREGATE — deduplicate and merge edits
        ④ SELECT   — pick top-L edits by impact
        ⑤ UPDATE   — apply edits to skill document
        ⑥ GATE     — validate candidate skill, accept or reject
    SLOW_UPDATE — epoch-end longitudinal review
```

## Pre-Flight: Initialize Run

Before the first step, set up the run directory and baseline:

1. Create `.skillopt/` directory in the project root:
   ```
   .skillopt/
   ├── state.json           # current step, scores, paths
   ├── history.jsonl         # one JSON line per step
   ├── step_buffer.json      # rejected edits and failure patterns
   ├── meta_skill.md         # optimizer-side memory (optional)
   ├── skills/               # versioned skill snapshots
   │   ├── skill_v0000.md    # initial skill
   │   └── skill_v0001.md    # after step 1
   ├── best_skill.md         # best scoring skill
   ├── tasks/
   │   ├── train.json        # training task set
   │   └── valid.json        # validation task set
   └── steps/
       └── step_0001/        # per-step artifacts
           ├── rollout_results.json
           ├── patches.json
           └── gate_result.json
   ```

2. Load or create the initial skill document. If none provided, start from an empty skill (just the frontmatter).

3. Prepare task sets:
   - `train.json`: array of task objects, each with `id`, `instruction`, and `expected_outcome` (or a test command)
   - `valid.json`: separate validation tasks (minimum 3, ideally ~20% of total)
   - If the user doesn't provide separate sets, split their tasks 80/20

4. Run baseline evaluation on validation set:
   - Execute each validation task with the initial skill
   - Record results as `baseline_results.json`
   - Set `current_score = batch_hard`, `best_score = current_score`

5. Write `state.json`:
   ```json
   {
     "current_step": 0,
     "current_epoch": 0,
     "current_score": 0.0,
     "best_score": 0.0,
     "best_step": 0,
     "edit_budget": 4,
     "min_edit_budget": 2,
     "total_epochs": 4,
     "steps_per_epoch": 2,
     "consecutive_no_improvement": 0,
     "early_stop_patience": 3
   }
   ```

## Stage ①: ROLLOUT

**Purpose:** Execute tasks with the current skill and collect results.

**Process:**
1. Load `tasks/train.json` and select the batch for this step (round-robin or random sample)
2. For each task in the batch:
   a. Read the current skill document
   b. Execute the task instruction following the skill's guidance
   c. Evaluate the result:
      - If the task has an automated test, run it
      - If the task has `expected_outcome`, compare against it
      - Otherwise, make your best judgment (be strict)
   d. Record: `{ "id": ..., "hard": 0|1, "soft": 0.0-1.0, "fail_reason": "...", "task_type": "..." }`
3. Save results to `steps/step_NNNN/rollout_results.json`
4. Compute `batch_hard` and `batch_soft`

**Key principle:** Execute honestly. Do not give yourself the benefit of the doubt on scoring. A false positive (claiming success when you failed) is worse than a false negative — it prevents the Reflect stage from catching real bugs in the skill.

## Stage ②: REFLECT

**Purpose:** Analyze rollout trajectories and propose edits.

**Process:**
1. Separate results into failures (hard=0) and successes (hard=1)
2. For failure trajectories:
   - Identify the MOST COMMON failure patterns across the batch
   - For each pattern, classify the failure type
   - Propose skill edits that address the COMMON patterns, not individual edge cases
   - Edits must be generalizable — do not hardcode task-specific values
   - Only patch gaps in the skill — do not duplicate existing content

3. For success trajectories (if any and time allows):
   - Identify generalizable behavior patterns that appear across MULTIPLE successes
   - Only propose patches for patterns NOT already covered in the skill
   - Prefer reinforcing existing sections over adding new top-level sections

4. Produce a patch for each group:
   ```json
   {
     "source_type": "failure",
     "failure_summary": [
       {"failure_type": "...", "count": N, "description": "..."}
     ],
     "patch": {
       "reasoning": "why these edits address the common failures",
       "edits": [
         {"op": "append", "content": "..."},
         {"op": "replace", "target": "exact text to find", "content": "replacement"},
         {"op": "delete", "target": "exact text to remove"}
       ]
     }
   }
   ```

5. Load the step buffer (`.skillopt/step_buffer.json`) and include it as context — avoid repeating edits that were rejected in previous steps.

6. Save patches to `steps/step_NNNN/patches.json`

**Reflection prompt (internal — what you should be thinking):**

> I am analyzing my own task execution. Looking at the failures:
> 1. What is the most common mistake I made across multiple tasks?
> 2. Is there a rule or instruction missing from the skill that would have prevented this?
> 3. Is there an existing instruction that misled me?
> 4. For each proposed edit: does it generalize beyond these specific tasks?
> 5. Am I duplicating something already in the skill?
>
> Looking at the successes:
> 1. What pattern did I consistently follow that led to success?
> 2. Is this pattern already documented in the skill? If not, should it be?

## Stage ③: AGGREGATE

**Purpose:** Merge failure-driven and success-driven edits into one coherent patch.

**Process:**
1. If there are multiple patches from different minibatches, merge them:
   - Deduplicate: keep the best-worded version of similar edits
   - Resolve conflicts: failure-driven edits take priority over success-driven
   - Preserve unique insights from both groups
   - No two edits may target the same text region
   - Estimate support_count for each merged edit (how many source patches back it)
2. If there's only one patch, use it as-is.
3. Save merged patch to `steps/step_NNN4/merged_patch.json`

**Priority rule:** Failure-driven patches are HIGH priority. Success-driven patches are lower priority and should only fill gaps not addressed by failure edits.

## Stage ④: SELECT

**Purpose:** Pick the top-L edits by impact (gradient clipping).

**Process:**
1. Read current edit_budget from state.json
2. If number of proposed edits ≤ edit_budget, keep all
3. Otherwise, rank edits by these criteria (in priority order):
   a. Systematic impact: edits addressing widespread, recurring failures rank highest
   b. Complementarity: edits filling gaps in the current skill rank higher than those duplicating existing content
   c. Generality: general principles rank higher than task-specific instructions
   d. Actionability: concrete, clear guidance ranks higher than vague advice
4. Keep only the top edit_budget edits
5. Save to `steps/step_NNNN/ranked_edits.json`

**Edit budget decay (cosine):**
```
budget = max(min_budget, round(max_budget * 0.5 * (1 + cos(π * step / total_steps))))
```
Update state.json with the new budget after each step.

## Stage ⑤: UPDATE

**Purpose:** Apply selected edits to the skill document.

**Process:**
1. Read the current skill document
2. Apply each edit sequentially:
   - `append`: add content at end (before `<!-- SLOW_UPDATE_START -->` if present)
   - `insert_after`: find `target` text, insert `content` after it
   - `replace`: find `target` text, replace with `content`
   - `delete`: find `target` text, remove it
3. If an edit's target is not found in the skill, skip that edit and record it as failed
4. If an edit targets the protected slow-update region, skip it
5. The result is the `candidate_skill`
6. Save candidate to `skills/skill_vNNNN.md`

## Stage ⑥: GATE

**Purpose:** Validate the candidate skill. Accept only if score improves.

**Process:**
1. Load the validation task set (`tasks/valid.json`)
2. Execute each validation task with the CANDIDATE skill (not the current skill)
3. Compute candidate_score = batch_hard
4. Apply gate logic:
   - If candidate_score > current_score AND candidate_score > best_score: **accept_new_best**
     - Update best_skill.md
     - Update best_score, best_step in state.json
   - If candidate_score > current_score: **accept**
     - Update current_skill, current_score in state.json
   - Otherwise: **reject**
     - Revert to the previous skill (reload from `skills/skill_v(N-1).md`)
     - Record rejected edits in step_buffer.json
5. Save gate result to `steps/step_NNNN/gate_result.json`
6. Append step record to `history.jsonl`
7. Update `state.json`
8. Increment `consecutive_no_improvement` on reject, reset to 0 on accept
9. Check early stopping: if `consecutive_no_improvement >= early_stop_patience`, stop training

**IMPORTANT:** Be honest about validation scores. Over-scoring defeats the entire purpose of the gate — you'll accept bad edits and the skill will degrade.

## SLOW_UPDATE (Epoch-End Review)

**Purpose:** Longitudinal review comparing skill performance across epochs.

**Process (at the end of each epoch):**
1. Select ~20 tasks from the training set
2. Run them under BOTH the previous epoch's skill and the current epoch's skill
3. Categorize each task:
   - **regressed**: was passing, now failing (HIGHEST priority to address)
   - **persistent_fail**: failing under both versions
   - **improved**: was failing, now passing
   - **stable_success**: passing under both
4. Write a strategic guidance block into the skill's protected region:
   ```
   <!-- SLOW_UPDATE_START -->
   [epoch N guidance: address regressions first, then persistent failures,
    reinforce what worked, remove what didn't]
   <!-- SLOW_UPDATE_END -->
   ```
5. This region is protected — step-level edits in the next epoch cannot modify it

## META SKILL (Optional Optimizer Memory)

**Purpose:** Keep optimizer-side notes about what editing strategies have worked.

**Process:**
1. After each epoch, reflect on:
   - Which types of edits were most often accepted by the gate?
   - Which editing strategies consistently led to rejections?
   - What failure patterns keep recurring despite edits?
2. Write notes to `.skillopt/meta_skill.md`
3. Include these notes as context in the next epoch's Reflect stage

## Resume Support

If `.skillopt/state.json` exists:
1. Load current_step, current_score, best_score, etc.
2. Continue training from the next step
3. This enables cross-session training — the user can close the client and resume later

## Output

When training completes:
1. Report final results: best_score, best_step, total steps, total epochs
2. The optimized skill is at `.skillopt/best_skill.md`
3. The user should copy best_skill.md to replace their original skill document
```

- [ ] **Step 2: Verify file exists**

Run: `wc -l skill-sources/skill-opt-lite/references/training-protocol.md`
Expected: ~200+ lines

---

### Task 4: Create `SKILL.md`

**Files:**
- Create: `skill-sources/skill-opt-lite/SKILL.md`

- [ ] **Step 1: Write the main SKILL.md**

This is the entry point that triggers and guides the agent through the training loop. Keep under 500 lines — reference files handle details.

```markdown
---
name: skill-opt-lite
description: Train and optimize skill documents using the SkillOpt methodology — the agent acts as both target and optimizer, running tasks, reflecting on failures, proposing edits, and validating improvements in a self-contained training loop. TRIGGER: optimize skill, train skill, improve skill, skill training, skill optimization, SkillOpt, skill evolution, skill iteration loop, skill feedback loop.
---

# SkillOpt-Lite: Agent-Native Skill Training

Train your skill documents the way neural networks train weights — iterative rollout, reflection, and validation. No external API keys. The agent is both the worker and the optimizer.

## When to Use

- You have a skill that doesn't work well and want to systematically improve it
- You want to create a new skill from scratch using data-driven iteration
- You want to know whether a skill change actually helps or hurts

Do NOT use for:
- One-off skill fixes (just edit the skill directly)
- Skills that can't be objectively evaluated (purely subjective quality)

## Quick Start

1. Prepare a task set (JSON array of tasks with verifiable outcomes)
2. Point this skill at your draft skill document
3. Run the training loop
4. Get an optimized `best_skill.md`

## Training Loop

```
for epoch in 1..N:
  for step in 1..steps_per_epoch:
    ① ROLLOUT   — run tasks with current skill, record pass/fail
    ② REFLECT   — analyze failures, propose edits (≤ edit_budget)
    ③ AGGREGATE — deduplicate, failure-first merge
    ④ SELECT    — pick top-L edits by impact
    ⑤ UPDATE    — apply edits to skill document
    ⑥ GATE      — re-run validation, accept only if score improves
  SLOW_UPDATE — epoch-end strategic review into protected region
```

Read `references/training-protocol.md` for the full detailed protocol before starting.

## Required Inputs

| Input | Description | Format |
|---|---|---|
| skill_path | Path to the skill document to optimize | `.md` file |
| tasks | Task set with verifiable outcomes | JSON array (see below) |
| valid_tasks | Validation tasks (separate from training) | JSON array (optional, auto-split if not provided) |

**Task format:**
```json
[
  {
    "id": "task-001",
    "instruction": "The task the agent should perform",
    "expected_outcome": "What success looks like (for scoring)",
    "test_command": "optional: command to verify success"
  }
]
```

## Configuration Defaults

| Parameter | Default | Description |
|---|---|---|
| num_epochs | 4 | Number of training epochs |
| steps_per_epoch | 2 | Steps per epoch |
| edit_budget | 4 | Max edits per step (cosine decay) |
| min_edit_budget | 2 | Floor for edit budget decay |
| early_stop_patience | 3 | Consecutive no-improvement steps before stopping |
| slow_update | true | Enable epoch-end longitudinal review |
| meta_skill | true | Enable optimizer-side memory |

Override by adding a `config` key when invoking the skill.

## State Persistence

All state lives in `.skillopt/` in the project root:

```
.skillopt/
├── state.json           # current training state (resume point)
├── history.jsonl        # one JSON line per step
├── best_skill.md        # best scoring skill
├── skills/              # versioned skill snapshots
├── tasks/               # train/valid task sets
└── steps/               # per-step artifacts
```

**Resume:** If `.skillopt/state.json` exists, continue from the last completed step. This works across sessions — you can stop and restart the client.

## Edit Operations

4 operations, applied sequentially:

| Op | Target | Description |
|---|---|---|
| `append` | No | Add at end of skill |
| `insert_after` | Yes | Insert after target text |
| `replace` | Yes | Replace target text with content |
| `delete` | Yes | Remove target text |

Read `references/edit-operations.md` for full spec including protected region rules and edit budget decay.

## Scoring and Gate

Each task scores `hard` (0 or 1) and `soft` (0.0 to 1.0). Gate accepts candidate skill only if `candidate_hard > current_hard` (strict improvement). Equal scores = reject.

Read `references/scoring-guide.md` for full scoring and gate logic.

## Critical Rules

1. **Be honest about scoring.** Over-scoring defeats the gate and degrades the skill. When in doubt, score hard=0.
2. **Edit budget is a ceiling, not a target.** Produce fewer edits if fewer are warranted. Do not pad to reach the budget.
3. **Generalize, don't memorize.** Edits must address common patterns, not individual task answers. A rule like "always check the workbook structure before writing formulas" is good. A rule like "the answer to task-003 is 42" is bad.
4. **Protected region is sacred.** Step-level edits MUST NOT target the `<!-- SLOW_UPDATE_START -->` ... `<!-- SLOW_UPDATE_END -->` region. Only the epoch-end review can modify it.
5. **Failure-first priority.** When merging failure-driven and success-driven edits, failure edits always win conflicts.
6. **Reject = learn.** Record rejected edits in the step buffer. The next step's Reflect phase sees them and avoids repeating the same mistakes.

## Minimal Example

User: "Optimize my skill at `.claude/skills/my-skill/SKILL.md` for writing TypeScript tests. Here are 10 test-writing tasks."

Agent:
1. Split tasks 8 train / 2 valid
2. Run baseline: 3/8 pass → score = 0.375
3. Step 1: Rollout (2/8 pass), Reflect (common failure: not mocking file system), Edit (append mock strategy), Gate (4/8 pass = 0.5 > 0.375 → accept!)
4. Step 2: Rollout (5/8 pass), Reflect (failure: not handling async), Edit (append async pattern), Gate (5/8 pass = 0.625 > 0.5 → accept!)
5. ... continue for configured epochs
6. Output: best_skill.md with score 0.75 (up from 0.375)

## Integration with AIOS

- Works with `aios-long-running-harness` for multi-session checkpoint/recovery
- Use `superpowers:verification-before-completion` before declaring training success
- Use `superpowers:brainstorming` first if the skill domain is unclear
- Training results can be committed via `cap`
```

- [ ] **Step 2: Verify SKILL.md**

Run: `wc -l skill-sources/skill-opt-lite/SKILL.md`
Expected: <500 lines

---

### Task 5: Sync to All Install Locations

**Files:**
- Copy: `skill-sources/skill-opt-lite/` → `.claude/skills/skill-opt-lite/`
- Copy: `skill-sources/skill-opt-lite/` → `~/.claude/skills/skill-opt-lite/`
- Copy: `skill-sources/skill-opt-lite/` → `~/.config/opencode/skills/skill-opt-lite/`

- [ ] **Step 1: Copy to .claude/skills/**

Run:
```bash
cp -r skill-sources/skill-opt-lite/ .claude/skills/skill-opt-lite/
```

- [ ] **Step 2: Copy to ~/.claude/skills/**

Run:
```bash
cp -r skill-sources/skill-opt-lite/ ~/.claude/skills/skill-opt-lite/
```

- [ ] **Step 3: Copy to ~/.config/opencode/skills/**

Run:
```bash
cp -r skill-sources/skill-opt-lite/ ~/.config/opencode/skills/skill-opt-lite/
```

- [ ] **Step 4: Verify all locations**

Run:
```bash
for d in skill-sources .claude ~/.claude ~/.config/opencode; do
  echo "=== $d ==="
  ls $d/skills/skill-opt-lite/
done
```
Expected: Each shows `SKILL.md` and `references/`

---

### Task 6: Update Skills Catalog

**Files:**
- Modify: `config/skills-catalog.json`

- [ ] **Step 1: Add skill-opt-lite entry to catalog**

Add entry:
```json
{
  "name": "skill-opt-lite",
  "source": "skill-sources/skill-opt-lite",
  "description": "Agent-native SkillOpt training loop — optimize skill documents through iterative rollout, reflection, and validation without external APIs",
  "locations": [
    ".claude/skills/skill-opt-lite",
    "~/.claude/skills/skill-opt-lite",
    "~/.config/opencode/skills/skill-opt-lite"
  ]
}
```

- [ ] **Step 2: Verify catalog is valid JSON**

Run: `python3 -c "import json; json.load(open('config/skills-catalog.json'))"` 
Expected: No error

---

## Self-Review

**1. Spec coverage:**
- SkillOpt's 6-stage pipeline → covered in training-protocol.md ✓
- Edit operations (4 ops) → edit-operations.md ✓
- Gate logic → scoring-guide.md ✓
- Edit budget / cosine decay → edit-operations.md ✓
- Step buffer / rejected edits → training-protocol.md ✓
- Slow update (epoch review) → training-protocol.md ✓
- Meta skill (optimizer memory) → training-protocol.md ✓
- Resume support → SKILL.md + training-protocol.md ✓
- Agent-native (no API keys) → all docs ✓

**2. Placeholder scan:**
- No TBD, TODO, or "implement later" found ✓
- All code blocks contain actual content ✓
- All file paths are specific ✓

**3. Type consistency:**
- Task format is consistent across training-protocol.md and SKILL.md ✓
- state.json schema is consistent ✓
- Edit ops match between edit-operations.md and training-protocol.md ✓
