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
   ├── state.json
   ├── history.jsonl
   ├── step_buffer.json
   ├── meta_skill.md
   ├── skills/
   │   └── skill_v0000.md
   ├── best_skill.md
   ├── tasks/
   │   ├── train.json
   │   └── valid.json
   └── steps/
       └── step_0001/
           ├── rollout_results.json
           ├── patches.json
           └── gate_result.json
   ```

2. Load or create the initial skill document. If none provided, start from an empty skill (just the frontmatter).

3. Prepare task sets:
   - `train.json`: array of task objects, each with `id`, `instruction`, and `expected_outcome` (or a `test_command`)
   - `valid.json`: separate validation tasks (minimum 3, ideally ~20% of total)
   - If the user doesn't provide separate sets, split their tasks 80/20 with seed=42

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

6. Save initial skill to `skills/skill_v0000.md` and copy to `best_skill.md`.

## Stage ①: ROLLOUT

**Purpose:** Execute tasks with the current skill and collect results.

**Process:**
1. Load `tasks/train.json` and select the batch for this step (round-robin across steps within an epoch)
2. For each task in the batch:
   a. Read the current skill document
   b. Execute the task instruction following the skill's guidance
   c. Evaluate the result:
      - If the task has `test_command`, run it
      - If the task has `expected_outcome`, compare against it
      - Otherwise, make your best strict judgment
   d. Record: `{ "id": ..., "hard": 0|1, "soft": 0.0-1.0, "fail_reason": "...", "task_type": "..." }`
3. Save results to `steps/step_NNNN/rollout_results.json`
4. Compute `batch_hard` and `batch_soft`

**Key principle:** Execute honestly. Do not give yourself the benefit of the doubt on scoring. A false positive (claiming success when you failed) is worse than a false negative — it prevents the Reflect stage from catching real bugs in the skill.

**Batch selection:** In each epoch, training tasks are shuffled deterministically and split across steps. Each step gets a unique non-overlapping batch. This ensures full coverage of the training set per epoch.

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

6. Load meta_skill.md (`.skillopt/meta_skill.md`) if it exists — use optimizer-side memory to improve edit quality.

7. Save patches to `steps/step_NNNN/patches.json`

### Self-Reflection Prompt

When analyzing your own execution, ask yourself:

1. What is the most common mistake I made across multiple tasks?
2. Is there a rule or instruction missing from the skill that would have prevented this?
3. Is there an existing instruction that misled me or caused confusion?
4. For each proposed edit: does it generalize beyond these specific tasks?
5. Am I duplicating something already in the skill?
6. Am I being too specific (hardcoding task answers) or too vague (no actionable guidance)?

For successes:
1. What pattern did I consistently follow that led to success?
2. Is this pattern already documented in the skill? If not, should it be?

### Common Failure Patterns to Look For

- Missing prerequisite checks (e.g., not verifying state before acting)
- Incorrect assumptions about environment or data format
- Handling only the happy path, not edge cases
- Overly complex approaches where simpler ones work
- Misinterpreting instructions due to ambiguous skill wording
- Sequential dependencies not documented (e.g., "must do X before Y")

## Stage ③: AGGREGATE

**Purpose:** Merge failure-driven and success-driven edits into one coherent patch.

**Process:**
1. If there are multiple patches from different minibatches, merge them:
   - Deduplicate: keep the best-worded version of similar edits
   - Resolve conflicts: failure-driven edits take priority over success-driven
   - Preserve unique insights from both groups
   - No two edits may target the same text region
   - Estimate `support_count` for each merged edit (how many source patches back it)
2. If there's only one patch, use it as-is.
3. Save merged patch to `steps/step_NNNN/merged_patch.json`

**Priority rule:** Failure-driven patches are HIGH priority. Success-driven patches are lower priority and should only fill gaps not addressed by failure edits.

### Merge Heuristic

When two edits conflict (target overlapping text regions):
1. Keep the failure-driven edit (it addresses a known bug)
2. If both are failure-driven, keep the one with higher support_count
3. If support counts are equal, keep the more specific one

## Stage ④: SELECT

**Purpose:** Pick the top-L edits by impact (gradient clipping).

**Process:**
1. Read current `edit_budget` from state.json (with cosine decay applied)
2. If number of proposed edits ≤ edit_budget, keep all
3. Otherwise, rank edits by these criteria (in priority order):
   a. **Systematic impact**: edits addressing widespread, recurring failures rank highest. A rule that fixes 50% of failures beats one that fixes a single edge case.
   b. **Complementarity**: edits filling gaps in the current skill rank higher than those duplicating existing content
   c. **Generality**: general principles rank higher than task-specific instructions
   d. **Actionability**: concrete, clear guidance ranks higher than vague advice
4. Keep only the top `edit_budget` edits
5. Save to `steps/step_NNNN/ranked_edits.json`

### Ranking Self-Check

For each proposed edit, ask:
- How many tasks would this edit affect? (broader = better)
- Does the skill already cover this? (if yes, lower priority)
- Is this a general principle or a task-specific hack? (general = better)
- Can the agent follow this instruction unambiguously? (clear = better)

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
7. Update state.json: increment `current_step`

## Stage ⑥: GATE

**Purpose:** Validate the candidate skill. Accept only if score improves.

**Process:**
1. Load the validation task set (`tasks/valid.json`)
2. Execute each validation task with the CANDIDATE skill (not the current skill)
3. Compute `candidate_hard = batch_hard`
4. Apply gate logic:
   - If `candidate_hard > current_hard` AND `candidate_hard > best_hard`: **accept_new_best**
     - Copy candidate to `best_skill.md`
     - Update `best_score`, `best_step` in state.json
   - If `candidate_hard > current_hard`: **accept**
     - Update `current_score` in state.json
   - Otherwise: **reject**
     - Revert to the previous skill (reload from `skills/skill_v(N-1).md`)
     - Record rejected edits in `step_buffer.json`
5. Save gate result to `steps/step_NNNN/gate_result.json`
6. Append step record to `history.jsonl`
7. Update `state.json`
8. Increment `consecutive_no_improvement` on reject, reset to 0 on accept
9. Check early stopping: if `consecutive_no_improvement >= early_stop_patience`, stop training

**IMPORTANT:** Be honest about validation scores. Over-scoring defeats the entire purpose of the gate — you'll accept bad edits and the skill will degrade.

### Gate Execution Detail

When running validation tasks with the candidate skill:
- Use the candidate skill's content as your guidance
- Do NOT use knowledge from the current skill — the point is to test whether the candidate is better
- Score each validation task independently
- The candidate may perform differently on validation vs training tasks — that's expected

## SLOW_UPDATE (Epoch-End Review)

**Purpose:** Longitudinal review comparing skill performance across epochs.

**Process (at the end of each epoch, before starting the next):**
1. Select ~20 tasks from the training set (or use all validation tasks)
2. Run them under BOTH the previous epoch's skill and the current epoch's skill
3. Categorize each task:
   - **regressed**: was passing, now failing (HIGHEST priority to address)
   - **persistent_fail**: failing under both versions
   - **improved**: was failing, now passing
   - **stable_success**: passing under both
4. Write a strategic guidance block into the skill's protected region:
   ```
   <!-- SLOW_UPDATE_START -->
   ## Epoch N Strategic Guidance
   - [address regressions first]
   - [then persistent failures]
   - [reinforce what worked]
   - [remove what didn't]
   <!-- SLOW_UPDATE_END -->
   ```
5. This region is protected — step-level edits in the next epoch cannot modify it
6. Save the slow-update result to `.skillopt/slow_update_epoch_N.json`

### Writing Effective Slow-Update Guidance

- Write as direct, actionable instructions to the agent
- Focus on helping get problems RIGHT — not analysis of what went wrong
- Prioritize: (1) preventing regressions, (2) fixing persistent failures, (3) reinforcing successful patterns
- Be concise but comprehensive — every sentence should earn its place
- Do not duplicate content already in the main skill body — complement it
- Address the agent directly: "When you encounter X, always do Y"

## META SKILL (Optional Optimizer Memory)

**Purpose:** Keep optimizer-side notes about what editing strategies have worked.

**Process:**
1. After each epoch, reflect on:
   - Which types of edits were most often accepted by the gate?
   - Which editing strategies consistently led to rejections?
   - What failure patterns keep recurring despite edits?
2. Write notes to `.skillopt/meta_skill.md`
3. Include these notes as context in the next epoch's Reflect stage

### Meta Skill Content Format

```markdown
# Optimizer Meta Skill

## What Works
- Edits that add missing prerequisite checks are accepted ~80% of the time
- Appending new sections is more reliable than replacing existing text

## What Doesn't Work
- Vague instructions like "be more careful" — always rejected
- Deleting existing rules without replacement — causes regressions

## Recurring Patterns
- The agent keeps forgetting to verify state before navigation
- This has been addressed in 3 separate edits but the problem persists
```

## Resume Support

If `.skillopt/state.json` exists when starting:
1. Load `current_step`, `current_score`, `best_score`, etc.
2. Load the current skill from `skills/skill_v{current_step}.md`
3. Continue training from `current_step + 1`
4. This enables cross-session training — the user can close the client and resume later

### Resume Checklist

- [ ] `.skillopt/state.json` exists and is valid JSON
- [ ] `skills/skill_v{current_step}.md` exists
- [ ] `tasks/train.json` and `tasks/valid.json` exist
- [ ] `best_skill.md` exists
- [ ] If any file is missing, report the issue and re-initialize

## Output

When training completes:
1. Report final results:
   ```
   Training Complete
   =================
   Best score: 0.75 (up from 0.375 baseline)
   Best step: 5
   Total steps: 8
   Total epochs: 4
   Edits accepted: 6
   Edits rejected: 3
   Early stopped: no
   ```
2. The optimized skill is at `.skillopt/best_skill.md`
3. The user should copy best_skill.md to replace their original skill document
4. Optionally: show a diff between the initial and best skill
