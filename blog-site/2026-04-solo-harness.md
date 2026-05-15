---
title: "Solo Harness: Give Your Agent a Task, Go To Sleep, Check Results In The Morning"
description: "AIOS 1.7 introduces the overnight agent run — with journals, stop/resume controls, and git worktree isolation."
date: 2026-04-26
tags: ["AIOS", "Solo Harness", "long-running agent", "ContextDB"]
---

# Solo Harness: Give Your Agent a Task, Go To Sleep, Check Results In The Morning

Coding agents are great at short tasks. "Fix this bug", "write this function", "refactor this file" — done in minutes.

But what about bigger objectives? "Refactor the entire auth module and write tests." That's hours of work. You can't sit there and watch.

**Solo Harness lets you hand off a big task and come back when it's done.**

## The Old Way vs. The New Way

**Before:** You run a long task, go to bed, wake up to... something. Maybe it finished. Maybe it got stuck. Maybe it made a mess of your git history. You have no idea what happened.

**After:** You start a harness run with `--worktree`, go to bed, and in the morning:

- Check the **run journal** to see exactly what happened
- Review the **structured status** to see if it completed
- If it got stuck, **resume** from where it stopped
- If it went off track, **delete the worktree** — your main branch is untouched

## How It Works

```bash
# Evening: start the run
aios harness run \
  --objective "Refactor the auth module and write integration tests" \
  --session nightly-auth \
  --worktree

# Morning: check what happened
aios harness status --session nightly-auth --json

# If it finished: review the changes
aios hud --session nightly-auth

# If it got stuck: fix the issue and resume
aios harness resume --session nightly-auth --max-iterations 10
```

## Why `--worktree` Matters

The `--worktree` flag is important. It creates a separate copy of your repo where the agent can make changes freely.

- **Good results?** Merge the worktree into your main branch
- **Bad results?** Just delete the worktree — zero impact on your code

No `git reset --hard`. No risky cleanup. Just safe isolation.

## What Gets Recorded

Every harness run writes a journal:

```
memory/context-db/sessions/<session-id>/artifacts/solo-harness/
  ├── objective.md           # What you asked it to do
  ├── run-summary.json       # Current state and progress
  ├── control.json           # Stop requests and notes
  ├── iteration-0001.json    # What happened in each iteration
  └── iteration-0001.log     # Detailed logs
```

This gives you a **readable handoff trail** — not just "the agent ran for a while", but exactly what it did, what worked, and what didn't.

## When To Use Solo Harness

**Use it when:**
- You have one clear objective that will take a long time
- The task doesn't need to be split across agents
- You want to wake up to results instead of babysitting

**Don't use it when:**
- The task can be split into independent parts (use [Agent Team](https://cli.rexai.top/team-ops/) instead)
- You're still figuring out the requirements (start with a normal session)
- You need staged execution with quality gates (use orchestrate)

## Try It

```bash
# Start with a dry run to verify everything is set up
aios harness run \
  --objective "Write integration tests for the payment module" \
  --session test-dry \
  --worktree \
  --dry-run --json

# When you're ready, go live
aios harness run \
  --objective "Write integration tests for the payment module" \
  --session payment-tests \
  --worktree \
  --max-iterations 20
```

---

*Solo Harness shipped in AIOS 1.7. Read the [full docs](https://cli.rexai.top/solo-harness/) or try it tonight.*
