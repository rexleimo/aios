---
name: cap-commit-push
description: Use when the user sends `cap` or asks for a fast commit-and-push shortcut for current repository changes.
---

# Cap Commit Push

## Overview
`cap` is a shorthand command that means: commit current changes and push to remote.

## Trigger
- User message is exactly `cap`.
- Or user explicitly asks for "commit + push".

## Required Workflow
1. Preflight
   - Run `git status --short`.
   - If there are no changes, report no-op and stop.
2. Sync Gate
   - If this task changes behavior/commands/workflow, update impacted skills first.
   - Keep `.codex/skills/*` and `.claude/skills/*` in sync for shared skills.
3. Stage
   - Run `git add -A`.
4. Commit
   - Prefer a Conventional Commit message based on current task context.
   - Fallback message: `chore: cap snapshot <YYYY-MM-DD>`.
5. Push
   - Run `git push`.
   - If upstream is missing, run `git push --set-upstream origin <current-branch>`.
6. Report
   - Return commit hash, branch, and push result.

## Safety Rules
- Do not amend commits unless the user explicitly asks.
- Do not run destructive git commands (`reset --hard`, forced checkout).
