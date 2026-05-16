# Browser MCP Integration

Default browser MCP runtime is now browser-use (CDP) via `scripts/run-browser-use-mcp.sh`.
`mcp-server/` Playwright implementation is retained for legacy/compatibility workflows.

## Quick Start

macOS / Linux:

```bash
scripts/install-browser-mcp.sh
scripts/doctor-browser-mcp.sh
```

Windows (PowerShell):

```powershell
powershell -ExecutionPolicy Bypass -File .\\scripts\\install-browser-mcp.ps1
powershell -ExecutionPolicy Bypass -File .\\scripts\\doctor-browser-mcp.ps1
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
    "puppeteer-stealth": {
      "type": "stdio",
      "command": "bash",
      "args": ["/ABS/PATH/aios/scripts/run-browser-use-mcp.sh"],
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

1. `chrome.launch_cdp` `{"port":9222,"user_data_dir":"~/.chrome-cdp-profile"}`
2. `browser.connect_cdp` `{"cdp_url":"http://127.0.0.1:9222"}`
3. `page.goto` `{"session_id":"<id>","url":"https://example.com"}`
4. `page.screenshot` `{"session_id":"<id>"}`
5. `browser.close` `{"session_id":"<id>"}`

## Installer and Doctor Scripts

- `scripts/install-browser-mcp.sh`
  - checks browser-use launcher and runtime
  - installs browser-use runtime when needed (`uv sync` or `python -m venv + pip`)
  - prints ready-to-copy MCP config snippet
- `scripts/install-browser-mcp.ps1` (Windows PowerShell variant)
- `scripts/doctor-browser-mcp.sh`
  - checks Node/bash and browser-use runtime
  - checks launcher/bootstrap scripts and browser-use project path
  - validates `config/browser-profiles.json`
  - warns if default CDP endpoint is not reachable
- `scripts/doctor-browser-mcp.ps1` (Windows PowerShell variant)

## Available Tools (Default browser-use runtime)

- `chrome.launch_cdp`
- `browser.connect_cdp`
- `browser.close`
- `page.goto`
- `page.wait`
- `page.click`
- `page.type`
- `page.press`
- `page.scroll`
- `page.evaluate`
- `page.set_input_files`
- `page.screenshot`
- `page.extract_text`
- `page.get_html`
- `diagnostics.sannysoft`

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
2. `chrome.launch_cdp` with explicit `user_data_dir`

## Crash Troubleshooting (Google Chrome for Testing)

If CDP connection fails:

1. Start fingerprint browser with remote debugging on `9222` and keep it running.
2. Verify port status: `node scripts/aios.mjs internal browser cdp-status`
3. Use `chrome.launch_cdp` then `browser.connect_cdp`.

## Notes

- The server auto-detects workspace root by locating `config/browser-profiles.json`.
- For local persistent profiles, if `userDataDir` is locked by another browser process, server retries with an isolated runtime profile directory by default (`isolateOnLock=true`).
- Default toolchain is `chrome.launch_cdp` -> `browser.connect_cdp` -> `page.*` under the `puppeteer-stealth` alias.
- Recommended reasoning order: `page.extract_text` -> `page.get_html` -> `page.screenshot` (visual fallback only).
- For interactive agent work, prefer `chrome.launch_cdp {"port":9222,"user_data_dir":"~/.chrome-cdp-profile"}` and then `browser.connect_cdp`.
- Keep login/challenge/captcha as human-in-the-loop; resume automation only after manual completion.
- Legacy Playwright `browser_*` behavior (`browser_snapshot`, `browser_auth_check`, etc.) applies only when running `mcp-server/` directly as compatibility mode.
- Recommended policy: keep third-party account sign-in (Google/Meta/Jimeng auth walls) as human-in-the-loop.

## Action Pacing (Reliability)

Use optional pacing to reduce flaky fast-action races:

- `BROWSER_ACTION_PACING=true|false` (default: `true`)
- `BROWSER_ACTION_MIN_MS` (default: `400`)
- `BROWSER_ACTION_MAX_MS` (default: `1200`)
- `BROWSER_ISOLATE_ON_LOCK=true|false` (default: `true`, retries with isolated profile dir when the base `userDataDir` is in use)

## Filesystem Context DB (for Codex/Claude/Gemini)

This repo now includes a lightweight filesystem context DB under `.aios/context-db` to share memory across CLI tools, with a SQLite sidecar index at `.aios/context-db/index/context.db`. Legacy `memory/context-db` state is read only for compatibility when `.aios/context-db` is absent.

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
