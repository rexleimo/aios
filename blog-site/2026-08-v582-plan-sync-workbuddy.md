---
title: "v5.8.2: Plans stop jumping the gun, and AIOS now speaks WorkBuddy"
description: "AIOS v5.8.2 stops plans from advancing themselves when a subagent reports success without a task id, and adds WorkBuddy as a fully-supported client — native instructions, MCP, 24/24 skills, and harness driving via the bundled codebuddy CLI."
date: 2026-08-29
tags: ["AIOS", "release", "planning", "workbuddy", "harness", "stability"]
---

# v5.8.2: Plans stop jumping the gun, and AIOS now speaks WorkBuddy

Two things landed in v5.8.2. One is a quiet bug that bit anyone running plans through subagents. The other is that AIOS now treats WorkBuddy as a real client instead of an afterthought.

## Plans were advancing themselves

If you ran a structured plan through the subagent runtime, you may have noticed the *next* task flip to `in_progress` before anything actually worked on it. Not "done" — just quietly marked in progress, so the plan looked further along than it was.

Root cause: `syncPlanWithIterationOutcome` called `markPlanTaskInProgress` on **every** sync. The subagent runtime reports a success without naming the task it finished (`phase-plan-sync.mjs` sends `{outcome:'success', ok:true}` with no `taskId`). With no id to bind to, the old code grabbed the next pending task and promoted it. The fix: sync now only records evidence and acts on an explicit `taskId`. Whoever owns the harness loop decides `in_progress` — sync just watches.

We also dropped the dead `hasCommitEvidence` helper and fixed a path-matching bug in `hasTargetFileChanges` (absolute paths were never matching). Tests: plan-runtime 5/5, full regression 1064/0.

## WorkBuddy is now a first-class client

Previously WorkBuddy got native instruction generation but not the rest of the chain. Now it's wired end to end:

- Native workflow/skills generation into `.workbuddy/`
- MCP config written to `~/.workbuddy/mcp.json` (browser / shell / auth MCP all migrate)
- Full skills sync — 24 of 24 catalog skills install
- Solo-harness driving through the bundled `codebuddy` CLI: `aios harness run --provider workbuddy` resolves the provider and runs

One caveat: the `codebuddy` binary isn't on your PATH by default. Drop this in your shell profile:

```bash
export PATH="/Applications/WorkBuddy.app/Contents/Resources/app.asar.unpacked/cli/bin:$PATH"
```

## Upgrade

```bash
aios update
```

No config migration. Restart your client and the new plan-runtime + WorkBuddy integration are live.
