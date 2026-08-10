---
title: "v4.0 Adaptive Workflow Policy: How AIOS Chooses the Right Amount of Process"
description: "A practical guide to AIOS v4.0's noop, direct, guarded, and planned workflow routes, persistent plans, and evidence gates."
date: 2026-07-14
tags: ["AIOS", "AI agent workflow", "workflow policy", "developer productivity", "SEO"]
---

# v4.0 Adaptive Workflow Policy: How AIOS Chooses the Right Amount of Process

> **Quick Answer:** AIOS v4.0 classifies work before it adds process. A question can be `noop` or `direct`, a small local edit can be `guarded`, and a multi-step or risky objective can be `planned`. The policy also separates plan persistence (`none`, `reuse`, or `create`) from workflow route selection, so a short acknowledgement does not accidentally start a new plan.

AI coding tools become difficult to trust when every request triggers the same ceremony. A one-line lookup should not create a work item, while a change that spans documentation, tests, and release evidence should not rely on memory alone. v4.0 makes that distinction explicit and inspectable.

## The four workflow routes

| Route | Use it for | Typical output |
| --- | --- | --- |
| `noop` | Empty input, acknowledgement, or no actionable request | No repository action |
| `direct` | Questions, read-only inspection, or status checks | An evidence-backed answer |
| `guarded` | One small, clear local change | Edit gate plus focused verification |
| `planned` | Multi-step, unclear, risky, delegated, or resumable work | A persisted work item and selected playbook |

The important detail is that route selection is adaptive. “Long” does not automatically mean “planned,” and “implementation” does not automatically mean “team.” The scope and risk of the work decide the route.

## Plan persistence is a separate decision

When a request is substantive, v4.0 answers two different questions:

1. Which route should execute the request?
2. What should happen to the plan state?

The plan state can be:

- `none`: do not create or reuse a persistent plan.
- `reuse`: continue an eligible active plan after an explicit `continue` or `resume`.
- `create`: create one work item for a new planned objective.

This prevents a common failure mode: treating “yes,” “continue,” or a short acknowledgement as a brand-new objective. Same-session acknowledgements can stay attached to the current work item. Cross-client continuation requires an explicit resume signal and only the selected task and handoff context should be loaded.

## What makes `planned` different?

A planned workflow has a durable boundary around the work:

1. Classify the objective and record its scope.
2. Select only the applicable playbook, such as brainstorming, writing a plan, TDD, or systematic debugging.
3. Run the pre-edit safety gate before changing files.
4. Capture verification evidence before claiming completion.

The plan is not a promise that every task needs a team. A solo harness is useful for a resumable objective; a team is useful only when independent domains can be safely separated. Coupled changes remain sequential.

## Dry run is not live readiness

`dry-run` can tell you whether configuration, routes, or task inputs look valid. It does not prove that an external model provider, browser session, MCP server, or authenticated account is available. A reliable status page should therefore distinguish:

- configuration accepted;
- local checks passed;
- provider or browser dependency available;
- human approval still required.

That distinction is both operationally useful and easier for search engines and answer engines to quote accurately.

## A safe starting sequence

For a new checkout, start with the documented initialization and doctor commands:

```bash
aios init --all
aios doctor --native --verbose
```

Read the [Workflow Policy documentation](https://cli.rexai.top/workflow-policy/) for the current route matrix. Then use the [Getting Started guide](https://cli.rexai.top/getting-started/) for client setup and the [Solo Harness guide](https://cli.rexai.top/solo-harness/) when the objective must survive interruptions.

## FAQ

### Does every code change need a plan?

No. A small, unambiguous edit can use the guarded route. A plan is warranted when the work has multiple dependent steps, unclear design, meaningful risk, delegation, or a need to resume later.

### Does `planned` mean a team is required?

No. Planned is a workflow classification. It may run in one client, a solo harness, or a team depending on the dependency graph.

### Can a terminal plan be resumed?

No. A terminal plan is complete or blocked and cannot be silently continued as if it were active. Start a new objective or explicitly resume an eligible nonterminal work item.

### Where are the implementation details?

The [Architecture guide](https://cli.rexai.top/architecture/) explains the relationship between the CLI, ContextDB, client projections, and runtime state. The [Troubleshooting guide](https://cli.rexai.top/troubleshooting/) maps common route and verification failures to next actions.

The policy is intentionally small: use less process for small work and more durable evidence for work that deserves it.
