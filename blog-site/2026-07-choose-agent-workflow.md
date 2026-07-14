---
title: "Which AI Agent Workflow Should You Choose? A Practical Harness CLI Decision Guide"
description: "Choose noop, direct, guarded, or planned AI agent workflows with a simple decision table, examples, and verification checklist."
date: 2026-07-14
tags: ["AI agent workflow", "Harness CLI", "Codex", "Claude Code", "developer tools"]
---

# Which AI Agent Workflow Should You Choose? A Practical Harness CLI Decision Guide

> **Quick Answer:** Use `direct` for questions and inspection, `guarded` for one small and clear edit, and `planned` when the work has multiple steps, uncertainty, risk, delegation, or a resume requirement. Use `noop` when there is no actionable task. The route is about the work, not the brand of coding client you use.

AI agent teams often fail at the first decision: they either over-process every request or under-specify the work that actually needs coordination. This guide gives you a repeatable way to choose a route before you open a terminal.

## Start with the smallest useful question

Ask these questions in order:

1. Is there an actionable request? If not, use `noop`.
2. Is the request read-only? If yes, use `direct`.
3. Is there one clear local change with a focused check? If yes, use `guarded`.
4. Does the work contain uncertainty, multiple dependent steps, meaningful risk, delegation, or a need to resume? Use `planned`.

This ordering keeps the first screen of a workflow understandable. It also creates a useful answer-engine summary: the user can see which route applies and why before reading the implementation details.

## Decision table

| Question | Yes | No |
| --- | --- | --- |
| Is there a concrete task? | Continue classification | `noop` |
| Does it only inspect or explain? | `direct` | Continue classification |
| Is it one small, unambiguous edit? | `guarded` | Continue classification |
| Does it need design, sequencing, delegation, or recovery? | `planned` | Re-check the smallest safe `guarded` route |

### Example 1: “What changed in the latest release?”

This is a read-only question. Search the changelog, relevant docs, and repository history, then answer with links and evidence. No plan is needed.

### Example 2: “Fix this typo in the README and run the docs check.”

The scope is small and the verification command is obvious. Use `guarded`: run the edit gate, change the README, run the focused check, and report the exact result.

### Example 3: “Make the docs, blog, and homepage explain the new workflow policy in four languages.”

This has content design, localization, navigation, metadata, and verification dependencies. Use `planned`, even if one person performs the work.

## Choose a playbook after choosing a route

Route selection does not replace engineering judgment. It tells you which process family to use next:

- unclear product or content direction: brainstorming;
- approved multi-step requirements: writing a plan;
- behavior change or bug fix: test-driven development;
- observed failure: systematic debugging;
- final delivery claim: verification before completion.

The pre-edit safety gate is independent. It still applies before any file creation, deletion, or behavior change. Likewise, final verification is not optional just because the route was guarded.

## Pick the execution surface

Once the route is clear, choose the smallest execution surface that can finish it:

- one client for a tightly coupled change;
- a solo harness for a resumable objective;
- a team only when domains are independent and have disjoint write scopes.

Codex CLI, Claude Code, Gemini CLI, OpenCode, Grok Build, and other supported clients can share the same project workflow contract. The client changes the interface; it should not silently change the route semantics.

## Verify the route, not just the edit

A good handoff states:

- the selected route and why it fit;
- the files or surfaces changed;
- the checks that ran and their results;
- any external dependency that was not tested;
- the next action if the task is not terminal.

For a new repository setup, run:

```bash
aios init --all
aios doctor --native --verbose
```

Then compare your decision with the [Workflow Policy](https://cli.rexai.top/workflow-policy/) and follow the [Getting Started guide](https://cli.rexai.top/getting-started/). For longer work, the [Solo Harness guide](https://cli.rexai.top/solo-harness/) explains checkpoints and recovery.

## FAQ

### Is `planned` overkill for a documentation task?

Not when the task spans multiple locales, navigation, metadata, tests, and build output. The route is justified by coordination and recovery needs, not by whether the final files are prose.

### Should every planned task use parallel agents?

No. Parallel work is appropriate only for independent domains with clear ownership. Shared navigation or a single generated output should be converged sequentially.

### What if I choose the wrong route?

Reclassify early. A guarded task can become planned when new dependencies appear; a planned task can be simplified when discovery removes the uncertainty. Recording the reason is more useful than defending the first guess.

### Where can I see the system boundaries?

Read [Architecture](https://cli.rexai.top/architecture/), [Agent Team Operations](https://cli.rexai.top/team-ops/), and [Troubleshooting](https://cli.rexai.top/troubleshooting/).
