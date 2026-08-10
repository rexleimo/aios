---
title: "Agent Governance: Make Team Runs Prove Themselves Before Going Live"
description: "How AIOS folds many agents into one workflow with smoke evidence, provenance, token-compression metrics, and skill training gates."
date: 2026-06-16
tags: ["Agent Team", "governance", "smoke", "skills", "AIOS"]
---

# Agent Governance: Make Team Runs Prove Themselves Before Going Live

Adding more agents is not the hard part. The hard part is making them safe enough to trust inside a real workflow.

AIOS now treats agent routing, team execution, and skill updates as an evidence problem. Before a workflow goes live, it should prove three things:

1. the agent can run the smoke path,
2. the run leaves provenance and token-compression metrics,
3. any changed skill has passed the training gate.

## Why governance matters

Multi-agent systems fail in boring ways:

- one role starts live work before its client capability was verified,
- a skill changes but nobody checks whether the new instruction actually trains cleanly,
- output compression works for one agent but not for another,
- a team run looks successful but leaves no evidence that can be audited later.

The answer is not "use fewer agents." The answer is to make agent admission boring, repeatable, and fail-closed.

## The new workflow

Start with a dry-run preview when you are changing routing, docs, skills, or team behavior:

```bash
node scripts/aios.mjs agents smoke --dry-run --json
```

Then record smoke evidence for the active agent set:

```bash
node scripts/aios.mjs agents smoke --json
```

If the change touched skills, run the training gate before treating the workflow as ready:

```bash
node scripts/aios.mjs skill verify-training --changed --base HEAD --json
```

That keeps the operational rule simple: team and harness workflows can grow, but they must leave evidence before they are trusted.

## What gets recorded

Each core-risk agent gets three evidence files:

| Evidence | Path | Purpose |
|---|---|---|
| Smoke result | `.aios/agents/smoke/<agent>.json` | Shows the agent passed the smoke path |
| Provenance | `.aios/agents/provenance/<agent>.json` | Records which agent/client path produced the evidence |
| Compression metrics | `.aios/interception/metrics/agents-smoke-<agent>.jsonl` | Confirms `pre_send` and `post_receive` token-compression accounting includes the agent |

The key detail is `agent_id`. Metrics without a stable agent identity are hard to audit, so smoke evidence now carries that identity through the compression data plane.

## How this fits into daily work

Use the governance path when you:

- add or rename an agent role,
- change team, harness, or subagent routing,
- modify workflow skills,
- update native client instructions,
- prepare a release that changes agent orchestration behavior.

For normal feature work, keep the user-facing flow familiar:

```bash
aios team 3:codex "Implement the settings page, add tests, and update docs"
aios team status --provider codex --watch
```

The governance checks sit behind that flow. They make sure the team surface is ready before the user depends on it.

## Skill changes need training

Skills are executable operating procedure, not just documentation. If a skill changes, the system should verify that the changed skill went through the training gate.

```bash
node scripts/aios.mjs skill verify-training --changed --base HEAD --json
```

That command is intentionally a gate, not a warning. If training evidence is missing, the workflow should stop before live agent work depends on the new instruction.

## The operating principle

The rule for a larger agent system is straightforward:

> More agents are welcome only when admission, provenance, compression, and training are observable.

That is how AIOS folds more agents into one system workflow without turning every team run into a trust fall.

---

Read the updated [Agent Team docs](https://cli.rexai.top/team-ops/) for the day-to-day commands and governance checklist.
