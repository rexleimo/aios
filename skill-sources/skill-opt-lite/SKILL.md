---
name: skill-opt-lite
description: "Train and optimize skill documents using the SkillOpt methodology — the agent acts as both target and optimizer, running tasks, reflecting on failures, proposing edits, and validating improvements in a self-contained training loop. TRIGGER: optimize skill, train skill, improve skill, skill training, skill optimization, SkillOpt, skill evolution, skill iteration loop, skill feedback loop, skill tuning."

installCatalogName: skill-opt-lite
clients: [codex, claude, gemini, opencode]
scopes: [global, project]
defaultInstall:
  global: true
  project: true
tags: [skill, training, optimization, SkillOpt, iteration]
repoTargets: [codex, claude, gemini, antigravity, opencode, crush]
---

# SkillOpt-Lite: Agent-Native Skill Training

Working directory: any

Train your skill documents the way neural networks train weights — iterative rollout, reflection, and validation. No external API keys. You are both the worker and the optimizer.

## When to Use

- You have a skill that doesn't work well and want to systematically improve it
- You want to create a new skill from scratch using data-driven iteration
- You want to know whether a skill change actually helps or hurts

MUST NOT use for:
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

Read `references/training-protocol.md` for the full detailed protocol before starting a training run.

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
    "test_command": "optional: shell command to verify success"
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

Override by providing a `config` object when starting a training run.

## State Persistence

All state lives in `.skillopt/` in the project root:

```
.skillopt/
├── state.json           # current training state (resume point)
├── history.jsonl        # one JSON line per step
├── step_buffer.json     # rejected edits and failure patterns
├── meta_skill.md        # optimizer-side memory
├── best_skill.md        # best scoring skill
├── skills/              # versioned skill snapshots
├── tasks/               # train/valid task sets
└── steps/               # per-step artifacts
```

**Resume:** If `.skillopt/state.json` exists, continue from the last completed step. This works across sessions — you can close and restart the client.

## Edit Operations

4 operations, applied sequentially:

| Op | Target | Description |
|---|---|---|
| `append` | No | Add at end of skill |
| `insert_after` | Yes | Insert after target text |
| `replace` | Yes | Replace target text with content |
| `delete` | Yes | Remove target text |

Read `references/edit-operations.md` for full spec including protected region rules, edit budget decay, and step buffer format.

## Scoring and Gate

Each task scores `hard` (0 or 1) and `soft` (0.0 to 1.0). Gate accepts candidate skill only if `candidate_hard > current_hard` (strict improvement). Equal scores = reject.

Read `references/scoring-guide.md` for full scoring and gate logic.

## Critical Rules

1. **Be honest about scoring.** Over-scoring defeats the gate and degrades the skill. When in doubt, score hard=0.
2. **Edit budget is a ceiling, not a target.** Produce fewer edits if fewer are warranted. Do not pad to reach the budget.
3. **Generalize, don't memorize.** Edits must address common patterns, not individual task answers. "Always check the workbook structure before writing" is good. "The answer to task-003 is 42" is bad.
4. **Protected region is sacred.** Step-level edits MUST NOT target content between `<!-- SLOW_UPDATE_START -->` and `<!-- SLOW_UPDATE_END -->`. Only the epoch-end review can modify it.
5. **Failure-first priority.** When merging failure-driven and success-driven edits, failure edits always win conflicts.
6. **Reject = learn.** Record rejected edits in the step buffer. The next step's Reflect phase sees them and avoids repeating the same mistakes.
7. **Revert on reject.** If the gate rejects a candidate, you MUST restore the previous skill document. MUST NOT keep a rejected candidate.

## Minimal Example

User: "Optimize my skill at `skill-sources/my-skill/SKILL.md` (or `<client-skill-root>/my-skill/SKILL.md`) for writing TypeScript tests. Here are 10 test-writing tasks."

Agent:
1. Split tasks 8 train / 2 valid
2. Run baseline: 3/8 pass → score = 0.375
3. Step 1: Rollout (2/8 pass), Reflect (common failure: not mocking file system), Edit (append mock strategy), Gate (4/8 pass = 0.5 > 0.375 → accept!)
4. Step 2: Rollout (5/8 pass), Reflect (failure: not handling async), Edit (append async pattern), Gate (5/8 pass = 0.625 > 0.5 → accept!)
5. Continue for configured epochs...
6. Output: best_skill.md with score 0.75 (up from 0.375 baseline)

## Integration with AIOS

- Works with `aios-long-running-harness` for multi-session checkpoint/recovery
- Use `superpowers:verification-before-completion` before declaring training success
- Use `superpowers:brainstorming` first if the skill domain is unclear
- Training results can be committed via `cap`

## References

- `references/training-protocol.md` — Full 6-stage pipeline with detailed prompts and decision logic
- `references/edit-operations.md` — Edit operation spec, budget decay, step buffer, protected regions
- `references/scoring-guide.md` — Scoring methods, gate logic, validation set, stopping criteria
