# Scoring and Gate Reference

## Task Scoring

Each task result is a dict:
```
{ "id": "<task_id>", "hard": 0|1, "soft": 0.0-1.0, "fail_reason": "..." }
```

- `hard`: 1 if task fully succeeded, 0 if failed. This is the primary metric.
- `soft`: Partial credit score (0.0 to 1.0). Used as tiebreaker only.
- `fail_reason`: One-line explanation of why the task failed (empty on success).

### How to Determine Hard Score

- If the task has an objective pass/fail test (e.g., exact match, test passes, file exists with correct content): hard = 1 if pass, 0 if fail
- If the task has `expected_outcome` text: compare agent output against it. hard = 1 if the outcome is met, 0 otherwise
- If the task has a `test_command`: run it. hard = 1 if exit code 0, 0 otherwise
- If the task requires human judgment: hard = 1 only if you are confident the task is complete. Be strict — a skill that claims success on failures is worse than one that honestly reports failure.
- When in doubt, score hard=0. False positives (claiming success when you failed) are worse than false negatives — they prevent the Reflect stage from catching real bugs in the skill.

### How to Determine Soft Score

soft reflects partial progress:
- 0.0 = no progress at all
- 0.3 = started but hit an early blocker
- 0.5 = roughly half done or got the right approach but wrong answer
- 0.7 = mostly correct but missing details
- 1.0 = fully correct

soft is only used as a tiebreaker when hard scores are equal. It does not affect gate decisions.

## Batch Score

```
batch_hard = sum(hard for all tasks) / count(tasks)
batch_soft = sum(soft for all tasks) / count(tasks)
```

Round to 4 decimal places for display and comparison.

## Gate Logic

After applying edits and re-running validation tasks:

```
if candidate_hard > current_hard:
    if candidate_hard > best_hard:
        action = "accept_new_best"
        save candidate as best_skill.md
        update best_score, best_step
    else:
        action = "accept"
    current_skill = candidate_skill
    current_score = candidate_hard
else:
    action = "reject"
    revert to current_skill (reload from previous checkpoint)
```

### Key Rules

1. **Strict improvement required**: candidate_hard must be STRICTLY GREATER than current_hard. Equal scores count as reject.
2. **Revert on reject**: If the gate rejects, you must restore the previous skill document. Do not keep the candidate.
3. **Record everything**: Save the gate result (action, scores, candidate_hash) to `steps/step_NNNN/gate_result.json` and append to `history.jsonl`.
4. **Honest scoring only**: Do not inflate validation scores. Over-scoring defeats the gate — bad edits get accepted and the skill degrades over time.

### Gate Result Format

```json
{
  "step": 3,
  "action": "accept_new_best",
  "candidate_hard": 0.75,
  "candidate_soft": 0.82,
  "current_hard": 0.5,
  "best_hard": 0.5,
  "candidate_hash": "a1b2c3d4e5f6g7h8"
}
```

## Validation Set

- The validation set is separate from the training set.
- Use ~20% of available tasks for validation, or at minimum 3 tasks.
- Validation tasks must not overlap with training tasks.
- The same validation set is used for all gate decisions within a run.
- Validation tasks should be representative of the full task distribution.

### Split Strategy

If the user provides N tasks without a pre-split:
1. Shuffle deterministically (seed = 42 by default)
2. Take first 80% as training, last 20% as validation
3. Minimum: 3 tasks in each set (if total < 6, use 50/50)
4. Save to `.skillopt/tasks/train.json` and `.skillopt/tasks/valid.json`

## Stopping Criteria

Training stops when any of:
1. All epochs completed (configured `num_epochs`)
2. Score reaches 1.0 on validation (perfect — stop early)
3. `consecutive_no_improvement >= early_stop_patience` (default patience = 3)
4. Token budget exhausted (if configured)

### Early Stopping Counter

- Increment `consecutive_no_improvement` on each reject
- Reset to 0 on each accept (any kind)
- Check after every gate decision

## Baseline Evaluation

Before the first training step:
1. Execute all validation tasks with the initial skill
2. Record results as `.skillopt/baseline_results.json`
3. Set `current_score = best_score = batch_hard` from baseline
4. This baseline is the floor — the training loop must beat it to accept any edits
