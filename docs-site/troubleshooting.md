---
title: Troubleshooting
description: Common setup/runtime issues and direct fixes.
---

# Troubleshooting

## Quick Answer (AI Search)

Most failures are setup-scope issues (missing MCP runtime, wrapper not loaded, or wrong wrap mode). Start with doctor scripts, then check wrapper scope.

## ContextDB fails after switching Node

Harness CLI targets **Node 24 LTS** and uses Node's built-in `node:sqlite` for ContextDB, so there is no external SQLite native addon to rebuild.

If a command exits with `Unable to resolve a Node runtime matching .nvmrc=24` or `[node-version] AIOS requires Node 24.x LTS`, install/use Node 24 first, then retry.

Quick fix:

```bash
node -v
source ~/.nvm/nvm.sh
nvm install 24
nvm use 24
cd mcp-server && npm run test:contextdb
```

Then retry:

```bash
npm run test:scripts
```

## Browser MCP tools unavailable

Run (macOS / Linux):

```bash
scripts/doctor-browser-mcp.sh
```

Run (Windows PowerShell):

```powershell
powershell -ExecutionPolicy Bypass -File .\\scripts\\doctor-browser-mcp.ps1
```

If doctor reports missing dependencies, run installer:

```bash
scripts/install-browser-mcp.sh
```

```powershell
powershell -ExecutionPolicy Bypass -File .\\scripts\\install-browser-mcp.ps1
```

## `EXTRA_ARGS[@]: unbound variable`

Cause: old `ctx-agent.sh` with `bash set -u` empty-array expansion edge case.

Fix:

1. Pull latest `main`.
2. Re-open shell and retry `claude`/`codex`/`gemini`.

Latest versions use a unified runtime core (`ctx-agent-core.mjs`) for both shell and Node wrappers to avoid this drift.

## `search` returns empty after sidecar loss

If `.aios/context-db/index/context.db` is missing or stale:

1. Run `cd mcp-server && npm run contextdb -- index:rebuild`
2. Retry `search` / `timeline` / `event:get`

## `contextdb context:pack failed`

AIOS wraps `codex`/`claude`/`gemini` by generating a ContextDB “context packet” (`context:pack`) first.

If packing fails, `ctx-agent` will **warn and continue** (it runs the CLI without injected context rather than crashing).

To make packing failures fatal (strict mode):

```bash
export CTXDB_PACK_STRICT=1
```

Note: shell wrappers (`codex`/`claude`/`gemini`) default to fail-open even if `CTXDB_PACK_STRICT=1` is set, to avoid bricking interactive sessions. To enforce strict packing for wrapped CLI runs too:

```bash
export CTXDB_PACK_STRICT_INTERACTIVE=1
```

If this keeps happening, run the quality gate (includes ContextDB regression checks):

```bash
aios quality-gate pre-pr --profile strict
```

## Context disappears after `/new` (Codex) or `/clear` (Claude/Gemini)

`/new` and `/clear` reset the **in-CLI conversation state**. ContextDB is still stored on disk, but the wrapper only injects a context packet when the CLI process starts.

Fix:

1. Preferred: exit the CLI and re-run `codex` / `claude` / `gemini` from your shell.
2. If you must stay in the same process: in the new conversation, ask the agent to read:
   - `@.aios/context-db/exports/latest-codex-cli-context.md`
   - `@.aios/context-db/exports/latest-claude-code-context.md`
   - `@.aios/context-db/exports/latest-gemini-cli-context.md`

If `@file` mentions are not supported, paste the file contents as your first prompt.

## `aios orchestrate --execute live` is blocked or fails

Live orchestration is opt-in.

1. Enable live execution gate:

```bash
export AIOS_EXECUTE_LIVE=1
```

2. Set the codex-only subagent client (required):

```bash
export AIOS_SUBAGENT_CLIENT=codex-cli
```

3. Ensure `codex` exists on `PATH` and is authenticated (for example, `codex --version`).

Windows quick check (PowerShell):

```powershell
powershell -ExecutionPolicy Bypass -File .\\scripts\\doctor-contextdb-shell.ps1
codex --version
codex
```

Expected: no TTY errors like `stdout is not a terminal`, and the interactive `codex` session attaches to the terminal correctly.

Tip (codex-cli): Codex CLI v0.114+ supports `codex exec` structured outputs (`--output-schema`, `--output-last-message`, stdin). AIOS uses them when available for more reliable JSON handoffs. Codex child workers also run with `--dangerously-bypass-approvals-and-sandbox` by default to prevent unattended live runs from waiting on approval or sandbox prompts; set `AIOS_SUBAGENT_CODEX_UNATTENDED=0` only for manual debugging.

If routed startup is still looking for `scripts/aios.mjs` inside the current non-AIOS repo, pull latest `main`; recent builds make routed `ctx-agent` startup workspace-aware instead of assuming the source-repo layout.

Tip: to validate the DAG without any model calls, use `--execute dry-run` (or set `AIOS_SUBAGENT_SIMULATE=1` for the live runtime adapter simulation).

Common failure signatures:

- `type: upstream_error` / `server_error`: upstream instability. Retry later (AIOS retries a couple times automatically).
- `Timed out after 600000 ms`: increase `AIOS_SUBAGENT_TIMEOUT_MS` (for example `900000`) or shrink the context packet via `AIOS_SUBAGENT_CONTEXT_LIMIT` / `AIOS_SUBAGENT_CONTEXT_TOKEN_BUDGET`.
- `invalid_json_schema` (`param: text.format.schema`): the backend rejected the structured output schema. Pull latest `main` and retry; AIOS will also retry without `--output-schema` when it detects schema rejection.

Minimal structured-output smoke check (macOS/Linux):

```bash
printf '%s' 'Return a JSON object matching the schema.' | codex exec --output-schema scripts/lib/specs/agent-handoff.schema.json -
```

## Commands not wrapped

Check these conditions:

- You are inside a git repo (`git rev-parse --show-toplevel` works).
- `ROOTPATH/scripts/contextdb-shell.zsh` exists and is sourced.
- `CTXDB_WRAP_MODE` allows current repo (`opt-in` requires `.contextdb-enable`).

Run wrapper doctor first:

```bash
scripts/doctor-contextdb-shell.sh
```

```powershell
powershell -ExecutionPolicy Bypass -File .\\scripts\\doctor-contextdb-shell.ps1
```

## `CODEX_HOME points to ".codex"` error

Cause: `CODEX_HOME` is set to a relative path.

Fix:

```bash
export CODEX_HOME="$HOME/.codex"
mkdir -p "$CODEX_HOME"
```

Latest wrapper scripts also auto-normalize relative `CODEX_HOME` during command execution.

## Wrapper loaded but should be disabled

Set in shell config:

```zsh
export CTXDB_WRAP_MODE=off
```

## Skills unexpectedly shared across projects

Skill loading scope is separate from ContextDB wrapping:

- Global skills: `~/.codex/skills`, `~/.claude/skills`, `~/.gemini/skills`, `~/.config/opencode/skills`, `~/.hermes/skills`, `~/.grok/skills`
- Project-only skills: `<repo>/.codex/skills`, `<repo>/.claude/skills`

If you need isolation, keep custom skills in repo-local folders.

## `--scope project` fails inside the Harness CLI source repo

This is expected after the canonical skill-source migration.

- `skill-sources/` is the authoring tree
- repo-local `.codex/skills` / `.claude/skills` / `.agents/skills` are sync-owned generated outputs
- installing `--scope project` into the source repo is blocked on purpose

Use this instead:

```bash
node scripts/sync-skills.mjs
node scripts/check-skills-sync.mjs
```

If you want to install skills into some other repo, run `aios ... --scope project` from that target workspace.

## Repo skills are not available globally

Wrappers and skills are separate by design. Install skills explicitly:
`--client all` installs for `codex`, `claude`, `gemini`, `opencode`, `hermes`, and `grok`.

```bash
scripts/install-contextdb-skills.sh --client all
scripts/doctor-contextdb-skills.sh --client all
```

```powershell
powershell -ExecutionPolicy Bypass -File .\\scripts\\install-contextdb-skills.ps1 -Client all
powershell -ExecutionPolicy Bypass -File .\\scripts\\doctor-contextdb-skills.ps1 -Client all
```

## GitHub Pages `configure-pages` Not Found

This usually means Pages source is not fully enabled.

Fix in GitHub settings:

1. `Settings -> Pages -> Source: GitHub Actions`
2. Re-run `docs-pages` workflow.

## FAQ

### What is the first command to run when browser tools fail?

Run `scripts/doctor-browser-mcp.sh` (or PowerShell variant) before reinstalling.

### Why is context not injected after I type `codex`?

Usually because the wrapper is not loaded, wrapper scope (`CTXDB_WRAP_MODE`) excludes the current workspace, or the command is a passthrough management subcommand.


## Skills were saved into the wrong repo directory

Canonical repo skill sources now live in:

- `<repo>/skill-sources`

Generated repo-local discoverable outputs live in:

- `<repo>/.codex/skills`
- `<repo>/.claude/skills`

If you save a `SKILL.md` under a parallel directory such as `.baoyu-skills/`, Codex / Claude will not discover it as a repo-local skill.

- Use `.baoyu-skills/` only for extension config such as `EXTEND.md`
- Move real canonical skill source files to `skill-sources/<name>/SKILL.md`
- Rebuild generated client roots with `node scripts/sync-skills.mjs`
- Run `scripts/doctor-contextdb-skills.sh --client all` to detect unsupported repo skill roots
