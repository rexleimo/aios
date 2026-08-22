---
title: "Run Coding Agents Overnight: One Sentence, Resumable, Verified"
description: "Overnight agent runs crash, drift, or leave unrecoverable state. AIOS makes overnight work resumable from one sentence: checkpoint state, gate milestones with evidence, isolate in git worktrees, and resume from the last accepted checkpoint. One command, done by morning."
date: 2026-08-10
schema_type: techarticle
---

# Run Coding Agents Overnight: One Sentence, Resumable, Verified

> **Quick Answer:** Overnight agent runs fail in three ways: the process crashes, context drifts off-task, or the worktree state becomes unrecoverable. AIOS fixes all three from one sentence: checkpoint state to disk, gate every milestone with evidence, isolate files in a git worktree, and resume from the last accepted checkpoint after any interruption. You say what you want, and it finishes by morning — verified and resumable if anything breaks.

## Why overnight runs fail

| Failure mode | What happens |
| --- | --- |
| **Crash** | The process dies at 3 AM; everything since the last save is lost. |
| **Drift** | The agent starts on the objective, then wanders into adjacent tasks; the loop never converges. |
| **Unrecoverable state** | Files half-written, worktree dirty, no record of what was accepted. |

All three are state-management problems, not model problems.

## The four pieces of a survivable overnight run

1. **Checkpointed state** — the run writes its plan, evidence, and decisions to disk so a resume starts from the last accepted milestone, not from zero.
2. **Evidence gates** — each milestone must survive a deterministic check (`verification-before-completion`, doctor, contract tests) before the next one starts. This stops drift at the boundary instead of discovering it in the morning.
3. **Isolation** — the run executes inside a [git worktree](https://cli.rexai.top/solo-harness/) so parallel or repeated runs cannot step on each other's files.
4. **Convergent loop** — the objective has an explicit stop condition; the run ends when the evidence says the objective is done, not when the budget runs out.

## How to start an overnight run

```bash
# 1. Initialize AIOS in the project
aios init --all

# 2. Launch a resumable, isolated objective
aios harness run --objective "Finish the release handoff checklist" --worktree

# 3. Check on it in the morning
aios harness status
```

If the machine restarts or the process dies, the harness resumes from the last accepted checkpoint. See the [Solo Harness documentation](https://cli.rexai.top/solo-harness/) for failure taxonomy and dry-run readiness checks.

## FAQ

**What if my agent run has no natural stopping point?**
Give it one. A convergent objective ("audit every route under src/routes/ for missing error handling") stops when the evidence list is complete. Without a stop condition you are paying for a random walk.

**Does an overnight run block my terminal?**
No. `aios harness run` manages the run as a resumable objective; you can close the session and resume later.

**Is worktree isolation required?**
Only when runs actually write files in parallel. For a single overnight run it is still the safest default — it keeps the working tree clean until the run is accepted.

## Next step

Read [Solo Harness](https://cli.rexai.top/solo-harness/) for the full failure taxonomy, or see the [Workflow Policy](https://cli.rexai.top/workflow-policy/) to understand how routes gate the run.
