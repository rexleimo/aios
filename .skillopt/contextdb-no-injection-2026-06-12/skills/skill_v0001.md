---
name: contextdb-autopilot
description: "Automatic ContextDB session lifecycle — init, session events, checkpoints, and continuity artifacts. Use when you need AIOS context persistence without prompt injection. NOT for general task execution — only for ContextDB session management. TRIGGER: contextdb、session persist、checkpoint save."

installCatalogName: contextdb-autopilot
clients: [codex, claude]
scopes: [global, project]
defaultInstall:
  global: true
  project: false
tags: [aios, contextdb]
repoTargets: [codex, claude, gemini, antigravity, opencode, crush]
---

# ContextDB Autopilot

Working directory: project root. Commands assume repo root; `npm run contextdb` runs from `mcp-server/`.

## Overview
Use this skill only to persist and retrieve ContextDB state. ContextDB is no longer a prompt-injection layer.

Runtime rules:
- Do not auto-inject ContextDB packets, continuity summaries, persona overlays, user overlays, route guides, or handoff prompts into model prompts.
- Interactive startup may show a short local unfinished-task summary to the user; it must not pass that summary as model input.
- One-shot mode sends only the explicit `--prompt` text to the selected client.
- Durable workflow constraints belong in checked-in instruction files (`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`) and repo-local skills.

Deprecated prompt-loading flags are intentionally unsupported:
- `--startup-mode inject`
- `--context-mode`
- `--limit`
- `CTXDB_AUTO_PROMPT`

If old docs, scripts, or user requests mention these as ways to preload memory, treat them as removed behavior. Use explicit search/timeline retrieval instead.

Script path: `scripts/ctx-agent.sh`

## When to Use
- You want cross-CLI memory continuity (`codex`, `claude`, `gemini`, `opencode`) in the same project.
- You need automatic session creation, event logging, checkpoints, and continuity/handoff artifact writes.
- You want to retrieve prior facts explicitly before continuing work.

Do not use this skill just to execute a normal coding task. Use the project workflow/superpowers skills for task execution.

## Required Pattern
Use one-shot mode (`--prompt`) when you want automatic logging around a single explicit request. The prompt is not augmented with ContextDB state.

```bash
scripts/ctx-agent.sh --agent codex-cli --project rex-cli --prompt "继续上次任务，先列出你会读取哪些 handoff 文件"
scripts/ctx-agent.sh --agent claude-code --project rex-cli --prompt "记录这个检查点并总结下一步"
scripts/ctx-agent.sh --agent gemini-cli --project rex-cli --prompt "基于我明确给出的文件继续分析"
scripts/ctx-agent.sh --agent opencode-cli --project rex-cli --prompt "执行这个明确请求，不自动加载历史"
```

## Session Control
- Continue same session: `--session <session_id>`
- Mark terminal step: `--status done`
- Disable auto bootstrap for current run: `--no-bootstrap`
- Disable checkpoint (rare): `--no-checkpoint`
- Disable auto bootstrap globally: `export AIOS_BOOTSTRAP_AUTO=0`
- `CODEX_HOME` can be relative; wrappers normalize it against current working directory at runtime.

Interactive wrapper behavior:
- Direct `codex`/`claude`/`gemini`/`opencode` startup routes through AIOS wrappers without prompt injection.
- Startup prints only a local unfinished-task summary when tasks/handoffs exist.
- To resume, the user must explicitly name the task/handoff to continue; the user must explicitly name the task/handoff to continue before any ContextDB detail is loaded.
- Route execution defaults to live for team/subagent command templates.
- Override subagent runtime for routed commands with `CTXDB_ROUTE_SUBAGENT_CLIENT=<codex-cli|claude-code|gemini-cli|antigravity-cli|opencode-cli|crush-cli>`.

Bootstrap note:
- On first run in a workspace, `ctx-agent` may auto-create `tasks/pending/task_<timestamp>_bootstrap_guidelines/*` and `tasks/.current-task` if both are empty.

Example:
```bash
scripts/ctx-agent.sh \
  --agent codex-cli \
  --project rex-cli \
  --session codex-cli-20260303T010101-abcd1234 \
  --status done \
  --prompt "所有改动完成，写入检查点并给最终总结"
```

## Verification
- Session files: `.aios/context-db/sessions/<session_id>/`
- Continuity artifact: `.aios/context-db/sessions/<session_id>/continuity.json`
- Handoff artifact: `.aios/context-db/sessions/<session_id>/handoff.json`
- Manual report export, when requested: `.aios/context-db/exports/<session_id>-context.md`

## Retrieval Workflow

When retrieving from ContextDB, run search first and then inspect the timeline only for the matching session. Search finds relevant events by keyword; timeline provides chronological context that explains when and why those events occurred.

1. `npm run contextdb -- search --query "<term>" --project <project>` — find relevant events
2. `npm run contextdb -- timeline --session <session_id> --limit 30` — see chronological context

Only then drill into specific events with `event:get`. If retrieval returns empty, run `index:rebuild` once and retry both commands.

Optional semantic rerank:

```bash
export CONTEXTDB_SEMANTIC=1
export CONTEXTDB_SEMANTIC_PROVIDER=token
npm run contextdb -- search --query "issue auth" --project rex-cli --semantic
```

Recovery:
- If retrieval returns empty unexpectedly, run `index:rebuild` once.
- Source-of-truth remains `.aios/context-db/sessions/*`; sidecar is rebuildable cache.

## Manual Report Export

Use `context:pack` only for explicit inspection/debug export. Do not feed the report into a model prompt by default. Never paste a full ContextDB Report into a model prompt; if a model needs historical evidence, retrieve only the specific event, checkpoint, or ref the user chose.

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
- Event dedupe in report view is enabled.
- `--token-strategy` supports `legacy|balanced|aggressive` (recommended: `balanced`).
- You can disable with `--no-dedupe` when needed for debugging.
