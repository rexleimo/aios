---
title: Solo Harness: Resumable Long-Running Work
description: Run one clear objective with journals, stop and resume controls, verification evidence, and optional git worktree isolation.
---

# Solo Harness

## Quick Answer

Use Solo Harness for one explicit objective that may outlast an interactive session but does not need parallel workers. It records a run journal and checkpoints, supports status, stop, and resume, and can isolate changes in a git worktree. Use Agent Team for independent modules and Orchestrate for ordered quality-gated phases.

## Do it now

Start a bounded run in an isolated worktree:

~~~bash
aios harness run \
  --objective "Refactor the auth module and write integration tests" \
  --session nightly-auth \
  --worktree \
  --max-iterations 20
~~~

Inspect it:

~~~bash
aios harness status --session nightly-auth --json
aios hud --session nightly-auth --json
~~~

## Choose Solo Harness when

| Situation | Route |
| --- | --- |
| one clear goal, one provider, long-running | Solo Harness |
| independent modules with separate ownership | [Agent Team](team-ops.md) |
| staged phases and gates | aios orchestrate |
| unclear requirements or a small fix | interactive client with Workflow Policy |

Write the objective so another person can tell whether it is complete. Include scope, exclusions, and expected verification.

## Worktree isolation

The --worktree option runs the objective in a separate git worktree seeded from the selected base ref. Review the worktree and its diff before merging or copying anything back. Worktree isolation does not make unsafe commands safe and does not bypass repository policies.

## Dry run before live

Create the journal without invoking a provider:

~~~bash
aios harness run \
  --objective "Draft tomorrow's handoff" \
  --session test-run \
  --worktree \
  --max-iterations 3 \
  --dry-run --json
~~~

A dry run proves argument parsing and local journal creation. It does not prove that the provider, client, credentials, or live route work.

## Stop, inspect, and resume

~~~bash
aios harness stop --session nightly-auth --reason "morning review"
aios harness status --session nightly-auth --json
aios harness resume --session nightly-auth --max-iterations 10
~~~

Resume only after reading the last status, checkpoint, and failing command. Keep the same objective unless you intentionally start a new session.

## Hooks and provider controls

Lifecycle hooks are enabled by default and record stage evidence. You can opt out for a specific run:

~~~bash
aios harness run --objective "task" --session demo --hooks
aios harness resume --session demo --no-hooks
~~~

The provider can be selected explicitly:

~~~bash
aios harness run --objective "task" --provider codex --profile strict
~~~

Provider availability and route support still need a live check. Do not infer them from a dry-run result.

## What gets written

Run artifacts are stored under the project ContextDB session:

~~~text
.aios/context-db/sessions/<session-id>/artifacts/solo-harness/
  objective.md
  run-summary.json
  control.json
  hook-events.jsonl
  iteration-0001.json
  iteration-0001.log
~~~

Treat logs and checkpoints as project data. Redact credentials and private provider output before sharing them.

## Recovery checklist

1. Read status and the latest iteration log.
2. Identify the first failure, not only the last symptom.
3. Run the smallest diagnosis command.
4. Stop or resume with an explicit reason.
5. Verify the resulting diff and tests before merge.

## FAQ

### Does Solo Harness guarantee an overnight result?

No. It provides a resumable loop and evidence. Provider limits, credentials, tests, and task complexity can still stop a run.

### Should I use --worktree every time?

Use it when you want isolation or the objective may edit code. A documentation-only or read-only run may not need it, but review the workspace boundary explicitly.

### Can a wrapped client trigger a harness run?

Native route prompts can suggest a harness route when supported. Treat the resulting command as a normal run: inspect status, provider, and evidence.

## Next steps

- [Agent Team](team-ops.md) - split independent work.
- [HUD Guide](hud-guide.md) - monitor session details.
- [Workflow Policy](workflow-policy.md) - decide whether the task is planned.
- [Troubleshooting](troubleshooting.md) - recover a failed runtime.
