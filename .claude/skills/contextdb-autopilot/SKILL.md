---
name: contextdb-autopilot
description: Use when running tasks in Codex CLI, Claude Code, Gemini CLI, or opencode and you need automatic context persistence (init/session/event/checkpoint/context-pack) plus interactive auto-routing without manual contextdb commands.
---

# ContextDB Autopilot

## Overview
Use this skill to run a task with full filesystem context DB automation in one command.

Script path: `scripts/ctx-agent.sh`
Runtime core: `scripts/ctx-agent-core.mjs` (single source for sh/mjs wrappers)

## When to Use
- You want cross-CLI memory continuity (`codex`, `claude`, `gemini`, `opencode`) in the same project.
- You need zero-manual context DB operations per task run.
- You want each run to auto-write user event, assistant event, checkpoint, and refreshed context packet.
- You want interactive wrappers to auto-seed route-aware startup prompts so the agent can classify `single/subagent/team` and trigger AIOS route commands without user-entered trigger commands.

## Required Pattern
Use one-shot mode (`--prompt`) for full automation.

```bash
scripts/ctx-agent.sh --agent codex-cli --project rex-cli --prompt "继续上次任务，先做最小变更"
scripts/ctx-agent.sh --agent claude-code --project rex-cli --prompt "延续当前会话并输出下一步"
scripts/ctx-agent.sh --agent gemini-cli --project rex-cli --prompt "基于已有上下文继续执行"
scripts/ctx-agent.sh --agent opencode-cli --project rex-cli --prompt "继续当前任务并执行下一步"
```

## Session Control
- Continue same session: `--session <session_id>`
- Mark terminal step: `--status done`
- Disable auto bootstrap for current run: `--no-bootstrap`
- Disable checkpoint (rare): `--no-checkpoint`
- Disable auto bootstrap globally: `export AIOS_BOOTSTRAP_AUTO=0`
- `CODEX_HOME` can be relative; wrappers normalize it against current working directory at runtime.

Interactive wrapper route defaults:
- Direct `codex`/`claude`/`gemini`/`opencode` startup now injects an auto-route prompt (`single/subagent/team`) by default.
- Route execution defaults to live for team/subagent command templates.
- `opencode` interactive flow falls back to a supported subagent runtime (`codex-cli` by default).
- Override subagent runtime for routed commands with `CTXDB_ROUTE_SUBAGENT_CLIENT=<codex-cli|claude-code|gemini-cli>`.

Bootstrap note:
- On first run in a workspace, `ctx-agent` may auto-create `tasks/pending/task_<timestamp>_bootstrap_guidelines/*` and `tasks/.current-task` if both are empty.

Example:
```bash
scripts/ctx-agent.sh \
  --agent codex-cli \
  --project rex-cli \
  --session codex-cli-20260303T010101-abcd1234 \
  --status done \
  --prompt "所有改动完成，给最终总结"
```

## Verification
- Context packet output: `memory/context-db/exports/<session_id>-context.md`
- Session files: `memory/context-db/sessions/<session_id>/`

## New ContextDB Retrieval Commands

Use these for index-first retrieval before full packet expansion:

```bash
cd mcp-server
npm run contextdb -- search --query "auth race" --project rex-cli --kinds response --refs auth.ts
npm run contextdb -- timeline --session <session_id> --limit 30
npm run contextdb -- event:get --id <session_id>#<seq>
npm run contextdb -- index:rebuild
```

Optional semantic rerank:

```bash
export CONTEXTDB_SEMANTIC=1
export CONTEXTDB_SEMANTIC_PROVIDER=token
npm run contextdb -- search --query "issue auth" --project rex-cli --semantic
```

Recovery:
- If retrieval returns empty unexpectedly, run `index:rebuild` once.
- Source-of-truth remains `memory/context-db/sessions/*`; sidecar is rebuildable cache.

## Packet Budget and Filters

Use token-aware packet export to control cost:

```bash
cd mcp-server
npm run contextdb -- context:pack \
  --session <session_id> \
  --limit 60 \
  --token-budget 1200 \
  --token-strategy balanced \
  --kinds prompt,response,error \
  --refs core.ts,cli.ts
```

Defaults:
- Event dedupe in packet view is enabled.
- `--token-strategy` supports `legacy|balanced|aggressive` (recommended: `balanced`).
- You can disable with `--no-dedupe` when needed for debugging.
- For orchestrate/subagent runtime, you can set `AIOS_SUBAGENT_CONTEXT_TOKEN_STRATEGY=balanced`.
