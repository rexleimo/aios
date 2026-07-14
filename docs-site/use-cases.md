---
title: Use Cases: Choose a Harness CLI Route
description: Pick the right Harness CLI command for memory, search, parallel work, resumable runs, browser automation, privacy, and verification.
---

# Find Commands By Scenario

## Quick Answer

Choose the command by the work you need now: aios init and doctor for setup, memo and unified search for project facts, aios team for independent work, aios harness for one long objective, and aios orchestrate for ordered phases. Use the Workflow Policy page when the route is unclear.

## Start with setup

~~~bash
aios init --all
aios doctor --native --verbose
~~~

Run these from the project root. The marker points to .aios/context-db/index.json, and ContextDB recalls relevant sources on demand.

## Choose a route

| I want to... | Use |
| --- | --- |
| ask or inspect without changing files | direct |
| make a small, clear local change | guarded |
| coordinate a multi-step or resumable objective | planned / Solo Harness |
| split independent work packages | Agent Team |
| execute ordered phases with gates | Orchestrate |
| understand the decision first | [Workflow Policy](workflow-policy.md) |

## Project memory and search

~~~bash
aios memo add "Keep authentication tests strict"
aios memo search "authentication"
node scripts/aios.mjs search "release readiness" --agent codex-cli --json
node scripts/aios.mjs search "browser MCP" --source docs,code --limit 8
~~~

ContextDB stores project sessions, checkpoints, exports, and canonical memos locally. Unified search can search memory, plans, docs, and code before a broad read.

## Cross-client handoff

Run supported clients from the same project when their integrations are synchronized:

~~~bash
claude
codex
gemini
~~~

Use explicit memos and checkpoints for important decisions. Shared project storage does not mean every client has identical route or MCP support; confirm with aios doctor.

## One long objective

~~~bash
aios harness run \
  --objective "Draft tomorrow's handoff" \
  --session nightly-demo \
  --worktree \
  --max-iterations 20
aios harness status --session nightly-demo --json
aios harness stop --session nightly-demo --reason "morning review"
aios harness resume --session nightly-demo
~~~

Use [Solo Harness](solo-harness.md) for the full lifecycle. A dry run creates local journal state but does not test a provider.

## Independent parallel work

Preview and then run a team only when files and ownership are independent:

~~~bash
aios team --provider codex --workers 3 --task "Implement X and update its tests" --dry-run --json
AIOS_EXECUTE_LIVE=1 AIOS_SUBAGENT_CLIENT=codex-cli \
  aios team 3:codex "Implement X and update its tests"
aios team status --provider codex --watch
~~~

See [Agent Team](team-ops.md) for governance, history, blocked-job recovery, and evidence.

## Staged orchestration

Preview a blueprint:

~~~bash
aios orchestrate bugfix --task "Fix X" --dispatch local --execute dry-run
~~~

Enable live execution only after preflight and provider checks:

~~~bash
AIOS_EXECUTE_LIVE=1 AIOS_SUBAGENT_CLIENT=codex-cli \
  aios orchestrate bugfix --task "Fix X" --execute live --preflight none
~~~

Use Orchestrate when phase order and quality gates are more important than parallel breadth. Dry-run is not a live-provider test.

## Browser automation

Use browser-use MCP over CDP as the default documented route:

~~~bash
aios internal browser doctor
aios internal browser cdp-status
~~~

For interactive browser work, launch a visible CDP browser, connect it, read a semantic snapshot or targeted text, then act and verify. Keep authentication walls human-controlled. Playwright MCP remains a compatibility path.

## Protect secrets

~~~bash
aios privacy read --file .env
aios privacy status
~~~

Do not paste .env files, cookies, tokens, private keys, or browser profiles into a model. Redaction is a boundary check, not permission to share every file.

## Verify before delivery

~~~bash
aios quality-gate pre-pr --profile strict
aios doctor --native --verbose
npm run test:scripts
~~~

Select the project-specific tests too. A status line or dry-run output is not a substitute for the command that proves the claim.

## Next steps

- [Workflow Policy](workflow-policy.md) - route semantics and continuation.
- [ContextDB](contextdb.md) - memory and unified search.
- [Agent Team](team-ops.md) - parallel operations.
- [Solo Harness](solo-harness.md) - resumable operations.
- [Troubleshooting](troubleshooting.md) - symptom-based recovery.
