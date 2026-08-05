# Browser MCP Integration

[![Parent project](https://img.shields.io/badge/parent-harness--cli-0ea5e9)](https://github.com/rexleimo/harness-cli)

> Browser automation surface for Harness CLI / AIOS.
> **Default path:** repository-local Node/Playwright MCP (`scripts/run-local-browser-mcp.mjs`).
> **Browser mode:** Playwright can launch a local browser or attach to an externally started CDP browser.

The repository-local MCP server is the only supported browser runtime. `mcp-server/` contains its implementation and build entrypoint.

## Quick Start

Run from the repository root on Windows, macOS, or Linux:

```bash
node scripts/aios.mjs internal browser install
node scripts/aios.mjs internal browser doctor
```
Migrate/refresh client MCP config:

```bash
node scripts/aios.mjs internal browser mcp-migrate --dry-run
node scripts/aios.mjs internal browser mcp-migrate
```

Expected MCP block:

```json
{
  "mcpServers": {
    "mcp-browser-use": {
      "type": "stdio",
      "command": "node",
      "args": ["/ABS/PATH/aios/scripts/run-local-browser-mcp.mjs"],
      "env": {
        "BROWSER_USE_CDP_URL": "http://127.0.0.1:9222"
      }
    }
  }
}
```

## Streamable HTTP (Bearer Token)

Optional: expose the MCP server over Streamable HTTP at `/mcp` with `Authorization: Bearer <token>`.

Environment:
- `MCP_HTTP=1` enable HTTP server
- `MCP_HTTP_HOST` (default: `127.0.0.1`)
- `MCP_HTTP_PORT` (default: `43110`)
- `MCP_HTTP_TOKEN` (required)
- `MCP_HTTP_SESSION_TTL_MS` (default: `1800000`)

Start (dev):

```bash
cd mcp-server
export MCP_HTTP=1
export MCP_HTTP_TOKEN="$(openssl rand -hex 16)"
npm run dev
```

Smoke test initialize:

```bash
curl -sS -X POST "http://127.0.0.1:43110/mcp" \
  -H "Authorization: Bearer $MCP_HTTP_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"curl","version":"0.0.0"}}}'
```

Then restart your client and smoke test:

1. `browser_health`
2. `browser_launch` with the `local` profile or a configured CDP profile
3. `browser_navigate` to `https://example.com`
4. `browser_snapshot` and `browser_screenshot`
5. `browser_close`

## Installer and Doctor

Use the AIOS commands from the repository root:

```bash
node scripts/aios.mjs internal browser install
node scripts/aios.mjs internal browser doctor
```

The installer installs `mcp-server` dependencies, installs Playwright Chromium unless skipped, migrates client MCP configuration, and prints a local `node` server block.

## Available Tools

- `browser_health`
- `browser_launch`
- `browser_navigate`
- `browser_click`
- `browser_type`
- `browser_set_input_files`
- `browser_snapshot`
- `browser_auth_check`
- `browser_challenge_check`
- `browser_screenshot`
- `browser_close`
- `browser_list_tabs`

## Profile Config

Use `config/browser-profiles.json` (project root):

```json
{
  "profiles": {
    "default": {
      "name": "default",
      "cdpPort": 9222
    },
    "local": {
      "name": "local",
      "userDataDir": ".browser-profiles/local",
      "isolateOnLock": true
    }
  }
}
```

Priority for launch mode:
1. `cdpUrl` / `cdpPort` from `config/browser-profiles.json`
2. local Playwright launch through `browser_launch`

## Crash Troubleshooting (Google Chrome for Testing)

If CDP connection fails:

1. Start the external browser with remote debugging on `9222` and keep it running.
2. Verify port status: `node scripts/aios.mjs internal browser cdp-status`
3. Use `browser_launch` with the configured CDP profile, then `browser_navigate`.

## Notes

- The server auto-detects workspace root by locating `config/browser-profiles.json`.
- For local persistent profiles, if `userDataDir` is locked by another browser process, server retries with an isolated runtime profile directory by default (`isolateOnLock=true`).
- The default toolchain is `browser_health` -> `browser_launch` -> `browser_navigate` -> `browser_snapshot` under the `mcp-browser-use` alias.
- Prefer `browser_snapshot` before `browser_screenshot` when page state is sufficient from accessibility data.
- Keep login/challenge/captcha as human-in-the-loop; resume automation only after manual completion.
- Recommended policy: keep third-party account sign-in (Google/Meta/Jimeng auth walls) as human-in-the-loop.

## Action Pacing (Reliability)

Use optional pacing to reduce flaky fast-action races:

- `BROWSER_ACTION_PACING=true|false` (default: `true`)
- `BROWSER_ACTION_MIN_MS` (default: `400`)
- `BROWSER_ACTION_MAX_MS` (default: `1200`)
- `BROWSER_ISOLATE_ON_LOCK=true|false` (default: `true`, retries with isolated profile dir when the base `userDataDir` is in use)

## Filesystem Context DB (for Codex/Claude/Gemini)

This repo now includes lightweight project-local runtime state under `.aios/`: ContextDB lives in `.aios/context-db`, workspace metadata/active skill indexes live in `.aios/workspace`, and bootstrap task queues live in `.aios/tasks`. Legacy `memory/context-db`, `memory/workspace`, and `tasks` state is read only for compatibility when the matching `.aios/` state is absent.

### Commands

```bash
cd mcp-server
npm run contextdb -- init
npm run contextdb -- session:new --agent claude-code --project rex-cli --goal "stabilize browser automation"
npm run contextdb -- event:add --session <session_id> --role user --text "Need retry and checkpoint strategy"
npm run contextdb -- checkpoint --session <session_id> --summary "Auth wall found; waiting human login" --status blocked --next "wait-login|resume-run"
npm run contextdb -- context:pack --session <session_id> --out .aios/context-db/exports/<session_id>-context.md
npm run contextdb -- context:pack --session <session_id> --limit 60 --token-budget 1200 --token-strategy balanced --out .aios/context-db/exports/<session_id>-context.md
npm run contextdb -- search --query "auth race" --project rex-cli
npm run contextdb -- search --query "auth race" --scope all --explain
npm run contextdb -- hygiene:status
npm run contextdb -- hygiene:prune-noise --dry-run
npm run contextdb -- hygiene:compact --dry-run
npm run contextdb -- timeline --session <session_id> --limit 30
npm run contextdb -- event:get --id <session_id>#<seq>
npm run contextdb -- index:sync --force --stats --jsonl-out .aios/context-db/exports/index-sync-stats.jsonl
npm run contextdb -- index:rebuild
```

`context:pack --token-strategy` supports `legacy|balanced|aggressive` (`balanced` is the default when `--token-budget` is set). This is AIOS-native input compression: it does not require RTK, shell hooks, or any external token-compression CLI. The strategy engine compresses repeated lines, stack runs, and low-signal event text while preserving errors, paths, command signals, and the latest execution state.

`search --explain` adds retrieval mode, query tokens, matched tokens, score parts, and suppression reasons to each result. `hygiene:*` commands expose ContextDB maintenance checks; mutation-oriented hygiene operations require `--dry-run` in this conservative first version.

`index:sync` is an incremental sidecar refresh command (fast path).  
Use `--stats` for detailed counters (`scanned/upserted` sessions/events/checkpoints), and `--jsonl-out` to append each run to a JSONL history file for trend analysis.

Optional semantic rerank:

```bash
export CONTEXTDB_SEMANTIC=1
export CONTEXTDB_SEMANTIC_PROVIDER=token
npm run contextdb -- search --query "issue auth" --project rex-cli --semantic
```

Unknown or unavailable providers fall back to lexical query automatically.

### Refs Query Benchmark

Run local refs query performance benchmark:

```bash
cd mcp-server
npm run bench:contextdb:refs -- --events 2000 --refs-pool 200 --queries 300 --warmup 30 --json-out test-results/contextdb-refs-bench.local.json
```

The benchmark emits JSON metrics for two scenarios:
- `refs-only`: exact ref filtering latency profile
- `refs+query`: ref filtering combined with lexical query

CI baseline gate commands:

```bash
cd mcp-server
npm run bench:contextdb:refs:ci
npm run bench:contextdb:refs:gate
```

### Feed context to each CLI

- Claude Code:
  ```bash
  claude --append-system-prompt "$(cat .aios/context-db/exports/<session_id>-context.md)"
  ```
- Gemini CLI:
  ```bash
  gemini -i "$(cat .aios/context-db/exports/<session_id>-context.md)"
  ```
- Codex CLI (example pattern):
  use the generated context packet as the first prompt in the session.

### One-command launcher (shared context session)

From repository root:

```bash
# Claude interactive (loads latest session context)
scripts/ctx-agent.sh --agent claude-code --project rex-cli

# Gemini one-shot (auto logs prompt/response into context-db)
scripts/ctx-agent.sh --agent gemini-cli --project rex-cli --prompt "继续上一次任务，先给我下一步计划"

# Codex one-shot (auto logs prompt/response/checkpoint into context-db)
scripts/ctx-agent.sh --agent codex-cli --project rex-cli --prompt "根据现有上下文继续实现"
```

For full automation, use one-shot mode (`--prompt`) so the script performs all five steps automatically:
`init -> session:new/latest -> event:add -> checkpoint -> context:pack`.

Each checkpoint now also maintains compact continuity files under
`.aios/context-db/sessions/<session_id>/continuity-summary.md` and
`.aios/context-db/sessions/<session_id>/continuity.json`. `context:pack` includes
the latest continuity summary, and `ctx-agent` lazy startup surfaces it through the
facade prompt for fast resume after `/new`, `/clear`, or a fresh CLI launch.
