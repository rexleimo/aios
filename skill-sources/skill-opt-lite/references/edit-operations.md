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
- Cosine decay formula:
  ```
  edit_budget = max(min_budget, round(max_budget * 0.5 * (1 + cos(π * step / total_steps))))
  ```
- `min_budget` defaults to 2
- If `edit_budget` = 0, skip update (no edits this step)

### Example Decay Schedule

With max_budget=4, min_budget=2, total_steps=8:

| Step | Cosine Factor | Budget |
|------|--------------|--------|
| 0 | 1.00 | 4 |
| 2 | 0.85 | 3 |
| 4 | 0.50 | 2 |
| 6 | 0.15 | 2 |
| 8 | 0.00 | 2 |

## Step Buffer

After each step, record to `.skillopt/step_buffer.json`:
- Failure patterns observed during rollout
- If step was rejected: the specific edits tried and score change

This buffer is fed into the next step's Reflect phase to avoid repeating ineffective edits.

### Buffer Entry Format

```json
{
  "step": 3,
  "action": "reject",
  "n_fail": 5,
  "n_total": 8,
  "failure_patterns": [
    {"pattern": "not checking workbook structure", "count": 3, "task_ids": ["t1", "t5", "t7"]}
  ],
  "rejected_edits": [
    {"op": "append", "content": "Always verify schema before...", "target": ""}
  ],
  "score_before": 0.375,
  "score_after": 0.25
}
```

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

### Protected Region Format

```markdown
<!-- SLOW_UPDATE_START -->
## Epoch 2 Strategic Guidance
- Always check the target element exists before clicking
- When form submission returns an error, re-read the page before retrying
- Do not assume page state persists across navigation
<!-- SLOW_UPDATE_END -->
```

### Slow Update Application

1. Remove any existing slow-update markers and content
2. Append new markers with updated guidance at the end of the skill
3. Step-level edits in the next epoch cannot target this region
4. Only the epoch-end review can overwrite this region
