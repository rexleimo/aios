---
title: Case Library: Reproducible Harness CLI Workflows
description: Follow evidence-first cases for setup, cross-client handoff, browser authentication, privacy-safe reads, and release verification.
---

# Case Library

## Quick Answer

Use these cases when you need a concrete workflow rather than a feature tour. Each case names prerequisites, commands, expected evidence, and the human decision that remains. Start with the case closest to your goal and then read the canonical page it links to.

## Case 1: Initialize a new project

**Goal:** create the current project marker and verify native integration.

Prerequisites: Node.js 24 LTS, Git, a supported client, and a project root.

~~~bash
cd /path/to/project
aios init --all
aios doctor --native --verbose
test -f .aios/context-db/index.json
~~~

Expected evidence: doctor reports the actual client checks, and the registry marker exists. Human decision: confirm the project is the intended workspace before allowing memory or configuration changes.

Canonical pages: [Quick Start](getting-started.md), [ContextDB](contextdb.md).

## Case 2: Cross-client handoff

**Goal:** analyze in one client, implement in another, and preserve the decision trail.

~~~bash
aios memo add "The auth API stays unchanged"
claude
codex
node scripts/aios.mjs search "auth API" --agent codex-cli --json
~~~

Expected evidence: the memo or checkpoint is found by unified search, and each client passes its own doctor checks. Human decision: review the changed files and provider boundaries before sharing work.

See the detailed [cross-CLI handoff case](case-cross-cli-handoff.md).

## Case 3: Browser CDP smoke flow

**Goal:** verify that the documented browser-use MCP path is available.

~~~bash
aios internal browser doctor
aios internal browser cdp-status
~~~

Expected evidence: browser profile and CDP status are reported. For an interactive run, launch a visible CDP browser, connect, read a semantic snapshot, perform one bounded action, and verify the resulting page state. Human decision: handle authentication walls manually.

See the [browser authentication-wall case](case-auth-wall-browser.md).

## Case 4: Privacy-safe configuration read

**Goal:** inspect a configuration file without exposing raw secrets.

~~~bash
aios privacy status
aios privacy read --file .env
~~~

Expected evidence: the output is redacted according to the local privacy boundary. Human decision: inspect the redacted result and decide whether the remaining fields are safe to share. Never paste raw cookies, tokens, private keys, or browser profiles.

See the [Privacy Guard case](case-privacy-guard.md).

## Case 5: Team governance smoke

**Goal:** prove the agent surface before a live team run.

~~~bash
node scripts/aios.mjs agents smoke --dry-run --json
node scripts/aios.mjs agents smoke --json
node scripts/aios.mjs skill certify --changed --base HEAD --json
node scripts/aios.mjs skill verify-training --changed --base HEAD --json
~~~

Expected evidence: smoke, provenance, and training artifacts are written under .aios/agents/ and .aios/interception/metrics/. Human decision: confirm the provider, client, and changed skill are appropriate for live work.

Canonical page: [Agent Team](team-ops.md).

## Case 6: Resumable long task

**Goal:** run one clear objective with a reviewable journal.

~~~bash
aios harness run \
  --objective "Prepare the release handoff" \
  --session release-handoff \
  --worktree \
  --max-iterations 20
aios harness status --session release-handoff --json
aios harness stop --session release-handoff --reason "review checkpoint"
aios harness resume --session release-handoff
~~~

Expected evidence: status, checkpoints, and iteration artifacts identify the current stage. Human decision: review the worktree diff and tests before merge.

Canonical page: [Solo Harness](solo-harness.md).

## Case 7: Dry-run versus live

**Goal:** distinguish local plan validation from provider execution.

~~~bash
aios team --provider codex --workers 2 --task "Review the release checklist" --dry-run --json
aios orchestrate bugfix --task "Fix the release check" --dispatch local --execute dry-run
~~~

Expected evidence: local dispatch and journal state without model calls. Human decision: only enable live after provider, credentials, worktree, and verification scope are ready.

## Case 8: Release verification

**Goal:** collect evidence before publishing a change.

~~~bash
aios doctor --native --verbose
aios quality-gate pre-pr --profile strict
npm run test:scripts
git diff --check
~~~

Expected evidence: each command exits successfully or identifies a concrete blocker. Human decision: review claims, links, privacy boundaries, and generated output before release.

## Submit a new official case

A useful case includes:

- one user intent and one primary action;
- exact commands and prerequisites;
- expected status, file, or test evidence;
- human-in-the-loop boundaries;
- one canonical documentation link and one related case.

Do not include credentials, cookies, private paths, or unredacted provider output.

## Next steps

- [Use Cases](use-cases.md) - choose a route.
- [Troubleshooting](troubleshooting.md) - recover symptoms.
- [Workflow Policy](workflow-policy.md) - understand the decision boundary.
