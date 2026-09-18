---
title: "v5.19.1: A Declaration You Can Actually Reach"
description: "The workflow policy never guesses intent, so an unreachable declaration channel quietly becomes 'no declaration'. This release lets the shell declare, and the guard written for it found 82 test files that no gate has ever run."
date: 2026-09-18
tags: ["AIOS", "workflow", "rex", "testing", "CI", "release", "v5.19.1"]
---

# v5.19.1: A Declaration You Can Actually Reach

The AIOS workflow policy is declaration-driven by design: it reads an explicit `intent` field or a `/command` prefix and never infers what you want from prose. That is the right default, and it has a sharp edge. If the declaration channel is unreachable, the policy does not complain. It falls back to its deterministic default, and no Provider is ever selected.

That is not hypothetical. It happened in this repository, for a whole session.

## The channel that was not there

`aios plan auto-gate` could receive a declaration in exactly one way: a `/plan`-style prefix inside the message. The prefix whitelist is `plan`, `team`, `subagent`, `harness`, `single`, `grill`, `spec`, `tickets`, `review`, `implement`, `debug`, `wayfinder`. There is no `/read-only`.

So an inspection-only turn could not be declared from the shell at all. The planning layer already read `options.intent || options.explicitIntent`; the reading side existed and nothing produced it. The new flag `--explicit-intent <value>` closes that gap.

## No allowlist, on purpose

The obvious next move is to validate the value against a list inside the CLI. That plan was written, and then measured first:

```
--explicit-intent read-only  -> direct  | explicit-direct-intent
--explicit-intent plan       -> planned | rex-capability-selected:software.planning.sequence
--explicit-intent readony    -> blocked | explicit-intent-unknown
```

The policy already fails closed on vocabulary it does not know. A CLI-side copy would be a third name table for the same words with zero extra safety, so the flag forwards the value verbatim and lets the policy decide. The test for the typo case exists so that reasoning cannot be quietly undone later.

## The trap on the way

In Git Bash, an argument that starts with `/` is rewritten into a Windows path. `--message "/plan x"` reaches the process as `C:/Program Files/Git/plan x`, the prefix never matches, and the decision quietly returns to the default. Part of a session was spent reading that as "the declaration channel is broken". It was the call site. `MSYS_NO_PATHCONV=1` is the fix, and the lesson is to confirm the argument arrived intact before blaming the product.

## The guard, and what it found

The new flag needed a test. One was written, the full regression was run, and the result was clean, with the same test count as before. The new file was not listed in `scripts/test-suites.json`, and that file is an explicit list rather than a glob. The suite had never executed it.

That raised a larger question: how many other files are in that position?

```
255  .test.mjs files under scripts/tests
144  sit in no suite
 82  are reachable from no test entry at all
```

Running those 82 by hand gives 677 tests, 653 passing, and 23 failures across 14 files. No gate has ever reported them, because no gate has ever run them. From the outside, a healthy pipeline and a rotting test suite look exactly the same.

The guard that came out of this checks reachability instead of registration, because 111 of the 255 files are registered by design and the rest are wired through package.json entries and globs. It keeps the 82 unwired files as a drift baseline, so a newly unwired file fails instead of being appended silently, and the baseline cannot rot into a blanket excuse. Its teeth are verified by mutation rather than by assertion: inject a dangling suite reference and only that check fails; add an unwired file and the guard fails and names it.

## What comes next

The 23 failures are work of their own. Some look environment-dependent, some look like state assumptions, and some look like genuine rot. They are a separate work item rather than something to bury inside a patch release.

The point of this version is smaller and more useful. If a declaration is how the workflow learns what you want, then the declaration has to be reachable. And if a test cannot run, something has to say so out loud.
