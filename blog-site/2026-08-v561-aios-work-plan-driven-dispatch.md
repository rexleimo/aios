---
title: "v5.6.1: Plan-Driven Multi-Agent Dispatch — aios work Reads Your Plan"
description: "v5.6.1 makes aios work plan-driven: eligible tasks from the active structured plan become parallel work items with dependencies, owned paths, and acceptance criteria — no more implicit decomposition."
date: 2026-08-12
tags: ["AIOS", "multi-agent", "parallel", "dispatch", "planning", "release", "v5.6.1"]
---

# v5.6.1: Plan-Driven Multi-Agent Dispatch — `aios work` Reads Your Plan

## Problem

[v5.6.0](2026-08-v560-aios-work-concurrent-dispatch.md) made `aios work` the one-command entry for parallel multi-agent coding: it plans, decomposes, and dispatches planner, implementer, reviewer, and security-reviewer jobs with a merge gate. But the decomposition step was still implicit — work items were guessed from the task title and `--context` hints. If your plan lived in a structured plan document (with dependencies, owned paths, and acceptance criteria), the dispatch never read it, and the post-dispatch report could disagree with the work items that were actually executed.

## Quick Answer

**v5.6.1 makes `aios work` plan-driven: when a structured plan is active, eligible plan tasks become the parallel work items.** Each work item keeps its dependencies, its owned paths (`targets` + `allowedWrites`), and its acceptance criteria from the plan, so parallel subagents work exactly the boundaries your plan drew. The `;`-separated `--context` fallback stays for no-plan runs, and a new `aios-work-dispatch` skill teaches agents when parallel dispatch is the right call — planned work with at least two independent items, disjoint file ownership, and no strict ordering — with a preview/approval boundary before anything goes live.

## What changed in v5.6.1

1. **Plan tasks become work items.** `aios work` decomposes the active structured plan: eligible plan tasks are lifted into work items with dependencies, owned paths (`targets` + `allowedWrites`), and acceptance criteria preserved from the plan.
2. **Semicolon context remains the fallback.** No active plan? `--context "mcp-server 重构; docs 更新; 测试补充"` still decomposes into work items as before — no-plan invocations are unchanged.
3. **The report matches the executed plan.** The post-dispatch report now preserves the plan-driven decomposition instead of recomputing work items, so the top-level `workItems` you see are the ones that ran.
4. **Agents learn when to dispatch.** The new canonical `aios-work-dispatch` skill encodes the entry criteria (planned disposition, at least two independent items, disjoint file ownership, no strict ordering), how to express decomposition, and the preview/approval boundary.
5. **The router sends parallel work to dispatch.** `aios-workflow-router` now routes parallel-capable planned work into the dispatch skill, so the loop from plan to parallel execution is a taught behavior, not a guess.

## How plan-driven decomposition works

- **Source of truth is the plan.** Eligible plan tasks carry their own dependencies, owned paths, and acceptance criteria — `aios work` reads them instead of re-guessing from free text.
- **Ownership is explicit.** Each work item's `targets` + `allowedWrites` keep parallel subagents inside their lanes; the merge gate still blocks overlapping file ownership.
- **Fallback stays predictable.** Without an active plan, decomposition uses the task title plus `;`-separated `--context` hints, exactly like v5.6.0.
- **Safety is unchanged.** Preflight readiness, capability guard, owned-path file policy, and the merge gate all still apply; `--dry-run` previews the decomposed plan and work items at zero cost.

## Examples

```bash
# Plan-driven: work items come from the active structured plan
aios work --task "Ship the release checklist"

# Preview the plan-driven decomposition before anything runs
aios work --task "Ship the release checklist" --dry-run --json

# No-plan fallback still works
aios work --task "Prepare the release" --context "update changelog; refresh docs; bump version"

# Force serial for coupled plan tasks
aios work --task "Refactor the auth module" --serial
```

## FAQ

### How do I know dispatch will read my plan?

`aios work --task "..." --dry-run --json` prints the decomposed work items, their dependencies, and their owned paths before anything executes. If the plan is active, the work items come from it.

### Does this replace my planning process?

No. The plan stays the single source of truth — dispatch just honors it. If your workflow uses a structured plan, `aios work` now executes its boundaries instead of inventing new ones.

### When should I *not* parallelize?

Parallel dispatch needs at least two independent work items, disjoint file ownership, and no strict ordering between them. Coupled changes belong on one lane (`--serial`), and the new `aios-work-dispatch` skill encodes exactly these gates so agents do not guess.

### Is the approval boundary still human-controlled?

Yes. The dispatch skill requires a preview before live execution; `--dry-run` is the zero-cost way to review the plan-driven work items, and live dispatch keeps the readiness, capability, ownership, and merge-gate guards from v5.6.0.

### My MCP servers broke after an upgrade or after moving the repo

MCP entries in client configs (for example `~/.config/opencode/opencode.json`) store absolute paths to this repository's `scripts/` launchers. After the project or install directory moves, those paths no longer exist and the servers fail to start. Fix from the new project root:

```bash
aios internal browser mcp-migrate
# or: aios update   (the browser component is in the default update set)
```

Then restart your client. `aios doctor` checks launcher paths without rewriting anything. Full details: [Troubleshooting](https://cli.rexai.top/troubleshooting/).

## Related

- [v5.6.0: Parallel Multi-Agent Coding with One Command — aios work](2026-08-v560-aios-work-concurrent-dispatch.md)
- [Orchestrate Live: Running Subagents in Production](orchestrate-live.md)
- [Parallel Coding Agents Are Not Free: Git Worktrees Isolate Files, Not State](2026-08-parallel-coding-agents.md)
- [Agent Governance: Make Team Runs Prove Themselves Before Going Live](2026-06-agent-governance.md)
- Docs: [Team Ops](https://cli.rexai.top/team-ops/) · [Route & Concurrency Profiles](https://cli.rexai.top/route-concurrency-profiles/)
