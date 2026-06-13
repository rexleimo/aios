# Browser MCP Migration to Browser-Use (CDP)

Date: 2026-04-10
Repo: `aios`

## Goal
- Replace the default browser MCP launch path with the browser-use MCP implementation from `/Users/molei/codes/ai-browser-book/mcp-browser-use`.
- Keep CDP-based fingerprint browsing behavior by preserving dedicated profile startup and CDP lifecycle tooling.

## Decisions
- Use `mcp-browser-use` as the only browser MCP alias.
- Route alias startup to `scripts/run-browser-use-mcp.sh`.
- Keep `internal browser cdp-*` controls, but switch CDP launch agent to real Chrome/Chromium executable discovery and profile persistence.

## Changes
1. Added browser-use MCP launcher script:
   - `scripts/run-browser-use-mcp.sh`
   - `scripts/browser-use-bootstrap.py`
   - Resolves browser-use repo path (`AIOS_BROWSER_USE_REPO` or default).
   - Resolves default `BROWSER_USE_CDP_URL` from `config/browser-profiles.json`.
   - Includes import shims for optional `xhs/ins` modules when missing in upstream checkout.

2. Switched default MCP config to browser-use launcher:
   - `.mcp.json`
   - `mcp-server/.mcp.json`

3. Updated browser install/doctor lifecycle:
   - `scripts/lib/components/browser.mjs`
   - Install now prepares browser-use runtime (`uv sync` or `python3 -m venv + pip install -e .[dev]`).
   - Doctor now validates launcher path and browser-use runtime instead of Playwright artifacts.
   - CDP launch service now uses real Chrome/Chromium discovery with persistent user data dir.

4. Updated CLI help text wording for legacy install flags:
   - `scripts/lib/cli/help.mjs`

5. Added one-command MCP config migration:
   - `node scripts/aios.mjs internal browser mcp-migrate [--dry-run]`
   - Writes `mcp-browser-use` to the browser-use launcher and removes old browser MCP aliases instead of preserving compatibility names.

## Validation Plan
- `npm run test:scripts`
- `node scripts/aios.mjs internal browser doctor --fix --dry-run`
- MCP smoke:
  1. `chrome.launch_cdp`
  2. `browser.connect_cdp`
  3. `page.goto`
  4. `page.screenshot`
  5. `browser.close`
