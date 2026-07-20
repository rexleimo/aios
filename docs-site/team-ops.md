---
title: Agent Team: Parallel Work with Evidence
description: Choose independent work packages, start an Agent Team, monitor HUD status, and recover blocked jobs safely.
---

# Agent Team

## Quick Answer

Use Agent Team when a task can be split into two or more independent work packages with clear ownership and acceptance criteria. Use one client for a small or coupled change, Solo Harness for one long objective, and Orchestrate for staged quality-gated execution. A dry run checks local dispatch state; it does not prove that a live provider is available.

## Do it now

Preview the dispatch first:

~~~bash
aios team --provider codex --workers 3 --task "Review auth, tests, and docs" --dry-run --json
~~~

When the task and live provider are ready:

~~~bash
AIOS_EXECUTE_LIVE=1 AIOS_SUBAGENT_CLIENT=codex-cli \
  aios team 3:codex "Review auth, tests, and docs"
~~~

## Choose the right route

| Need | Route |
| --- | --- |
| Answer, inspect, or one small local change | direct or guarded |
| One clear long-running objective | [Solo Harness](solo-harness.md) |
| Two or more independent work packages | Agent Team |
| Ordered phases with explicit gates | aios orchestrate |
| Requirements are still unclear | interactive client first |

## Before starting

Write one sentence that includes the goal, boundary, and acceptance evidence:

~~~text
Goal: update the login form
Boundary: do not change the auth API
Evidence: focused tests pass and the changed docs link to the new behavior
~~~

Confirm that workers will not edit the same files. If the files overlap, keep ownership sequential or use one agent.

## Monitor and review

~~~bash
aios team status --provider codex --watch
aios hud --provider codex
aios team history --provider codex --limit 20
aios team history --provider codex --quality-failed-only
aios quality-gate pre-pr --profile strict
~~~

Review changed files and quality categories before merging any worker output. Status is operational evidence, not proof that the code is correct.

## Governance evidence

When adding agents, changing routing, or updating workflow skills, run the smoke and training checks before relying on a live team:

~~~bash
node scripts/aios.mjs agents smoke --dry-run --json
node scripts/aios.mjs agents smoke --json
node scripts/aios.mjs skill certify --changed --base HEAD --json
node scripts/aios.mjs skill verify-training --changed --base HEAD --json
~~~

These checks write evidence under .aios/agents/ and .aios/interception/metrics/. Keep sensitive provider output out of public issues.

## Recovery

Inspect the latest session before retrying:

~~~bash
aios team history --provider codex --limit 5
aios team --resume <session-id> --retry-blocked --provider codex --workers 2
~~~

Reduce worker count when jobs conflict. Use --force only when you understand the safety guard that would otherwise stop the retry.

## How the runtime is organized

A normal live team uses rounds:

~~~text
planner -> independent implementers -> reviewer
                 |
                 +-> blocked work can cause a replanning round
~~~

Blueprints are selected by the runtime: feature, bugfix, refactor, or security. Choose the smallest blueprint that matches the work and keep the task artifact available when preflight needs it.

## FAQ

### Is Team always faster?

No. It adds coordination and provider work. It is useful when ownership is truly independent, not for a single-file fix.

### Does dry-run test the provider?

No. It tests local parsing and planned dispatch. A live smoke task is required to test a provider and client route.

### How many workers should I use?

Start with two for uncertain boundaries and three for clearly independent daily work. More workers increase coordination and overlap risk.

### Can I resume a blocked run?

Yes. Read history, identify the blocked job, then use resume with retry-blocked. Do not restart the whole team blindly.

## Next steps

- [HUD Guide](hud-guide.md) - inspect detailed session evidence.
- [Workflow Policy](workflow-policy.md) - understand planned and team route hints.
- [Solo Harness](solo-harness.md) - run one long objective.
- [Use Cases](use-cases.md) - compare commands by intent.
