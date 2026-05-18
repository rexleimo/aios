---
title: Find Commands By Scenario
description: Do not memorize concepts first. Pick the RexCLI command by what you want to do now.
---

# Find Commands By Scenario

This page answers one question: **which command should I run right now?**

<figure class="rex-visual">
  <img src="assets/visual-contextdb-memory-loop.svg" alt="ContextDB project memory loop: after .contextdb-enable, codex, claude, and gemini share local project memory">
  <figcaption>Most scenarios revolve around one core idea: enable ContextDB in the project root, then different CLIs can connect to the same local context.</figcaption>
</figure>

## I Want To Install And Check The Environment

```bash
aios
```

In the TUI, run these in order:

1. **Setup**: install shell wrappers, skills, browser components, and related pieces.
2. **Doctor**: check Node, MCP, skills, and native config.
3. **Update**: use this path for upgrades later.

Command-line path:

```bash
aios setup --components all --mode opt-in --client all
aios doctor --native --verbose
```

## I Want The Agent To Remember This Project

```bash
cd /path/to/project
touch .contextdb-enable
codex
```

After that, `codex`, `claude`, `gemini`, and `opencode` in the same project all connect to the same ContextDB.

## I Want Durable Operator Memory (Memo + Persona)

Use `aios memo` when you want lightweight memory without manually editing ContextDB files:

```bash
aios memo add "Need strict pre-PR checks #quality"
aios memo pin add "Avoid destructive git commands."
aios memo recall "quality gate" --limit 5
aios memo storage status
aios memo persona add "Response style: concise, direct, evidence-first"
aios memo user add "Preferred language: zh-CN + technical English terms"
```

Rule of thumb:

- `memo add/search/recall` -> canonical `.aios/memo` storage (legacy ContextDB mirror only for compatibility)
- `memo pin` -> canonical `.aios/memo` pinned file (legacy mirror only for compatibility)
- `memo persona/user` -> global identity files injected into the `ctx-agent` Memory prelude

Default storage is `file` (`.aios/memo/file/events.jsonl`). Use `aios memo storage use split` only if you want one JSON file per memo event. `storage rebuild` fully rebuilds derived query files only.

Persona is for the agent baseline ("how this AI should behave"). User profile is for stable operator preferences ("how this user wants work delivered"). Both are safety-scanned and capacity-limited before injection.

## I Want Cross-CLI Handoff

```bash
claude   # analyze first
codex    # implement next
gemini   # review or compare last
```

As long as all three run in the same project directory, ContextDB saves events and checkpoints so switching tools is less likely to lose context.

## I Want One Agent To Keep Working Overnight

Good fit: one clear objective, one provider, resumable overnight work, and no need for parallel workers.

```bash
aios harness run --objective "Draft tomorrow handoff" --session nightly-demo --worktree --max-iterations 20
aios harness status --session nightly-demo --json
aios hud --session nightly-demo --json
```

If you need the run to stop cleanly or continue later:

```bash
aios harness stop --session nightly-demo --reason "morning handoff"
aios harness resume --session nightly-demo
```

If you want lifecycle hook evidence, keep default hooks on or set them explicitly:

```bash
aios harness run --objective "Draft tomorrow handoff" --session nightly-demo --hooks
aios harness resume --session nightly-demo --no-hooks
```

Use [Solo Harness](solo-harness.md) when you want one agent to stay on one objective. Use [Agent Team](team-ops.md) when the work is truly parallel-friendly.

Tip: if you start from wrapped `codex` / `claude` / `gemini` / `opencode` and ask for explicit overnight/resumable work, the startup route prompt tells the agent to self-trigger the same `aios harness run ... --workspace <project-root>` command instead of asking you to remember it manually.

## I Want To Start Agent Team

Good fit: independent modules, splittable work, and acceptable token cost.

```bash
# Dry-run preview (safe, no model calls)
aios team 3:codex "Implement X, run tests before finishing, and summarize changes"

# Live GroupChat execution (round-based, shared conversation)
AIOS_EXECUTE_LIVE=1 AIOS_SUBAGENT_CLIENT=codex-cli aios team 3:codex "Implement X"

# Monitor progress
aios team status --provider codex --watch
```

In live mode, Agent Team uses the **GroupChat Runtime**: agents run in rounds with a shared conversation thread. The planner analyzes the task, implementers work in parallel per round, and reviewers validate. Blocked agents trigger automatic re-plan rounds.

Bad fit: fuzzy requirements, one-off bugs, or multiple workers likely editing the same file. Use normal `codex` first in those cases.

## I Want To See Progress And History

```bash
aios hud --provider codex
aios team status --provider codex --watch
aios team history --provider codex --limit 20
```

To quickly see recent failures:

```bash
aios team history --provider codex --quality-failed-only
```

## I Want A Quality Gate

```bash
aios quality-gate pre-pr --profile strict
```

Use this before a PR or after a large change. It includes ContextDB, native/sync, and release-health checks.

If you want the RL release gate status and trend report directly:

```bash
aios release-status --recent 12
aios release-status --strict
```

## I Want RexCLI To Orchestrate Stages

Preview first, without model calls:

```bash
aios orchestrate feature --task "Ship X" --dispatch local --execute dry-run
```

Enable live execution explicitly only when you are ready:

```bash
export AIOS_EXECUTE_LIVE=1
export AIOS_SUBAGENT_CLIENT=codex-cli
aios orchestrate --session <session-id> --dispatch local --execute live
```

New users should prefer `aios team ...`. `orchestrate live` is for maintainers who already understand sessions, plans, and preflight gates.

For focused single-change tasks, use the `bugfix` blueprint (3 rounds: plan → implement → review):

```bash
AIOS_EXECUTE_LIVE=1 AIOS_SUBAGENT_CLIENT=codex-cli \
  aios orchestrate bugfix --task "Fix X" --execute live --preflight none
```

## I Want To Diagnose Browser Automation

```bash
aios internal browser doctor --fix
aios internal browser cdp-status
```

If page actions fail, read [Troubleshooting](troubleshooting.md) before reinstalling everything.

## I Want To Protect Secrets And Config

```bash
aios privacy read --file .env
```

Do not paste `.env`, cookies, tokens, or browser profiles directly into a model. RexCLI Privacy Guard tries to redact before read output is shared.

## Selection Mnemonic

- **Daily development**: `codex` / `claude` / `gemini` / `opencode`
- **Install/update**: `aios`
- **Solo overnight run**: `aios harness run --objective "Draft tomorrow handoff" --worktree`
- **Agent Team (GroupChat)**: `aios team 3:codex "task"` (round-based shared conversation)
- **Progress**: `aios team status --watch`
- **Before delivery**: `aios quality-gate pre-pr --profile strict`
- **Browser issue**: `aios internal browser doctor --fix`
