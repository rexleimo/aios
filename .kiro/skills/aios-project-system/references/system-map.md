# AIOS System Map

## Purpose
AIOS is a browser-automation assistant for Xiaohongshu operations plus related content tooling (including Jimeng image generation).

## End-to-End Flow
User intent -> skill retrieval (`memory/skills`) -> MCP browser-use/CDP actions -> platform result -> evidence capture -> memory/docs updates.

## Main State Surfaces
- Process memory: `memory/skills`, `memory/specs`, `memory/history`, `memory/knowledge`
- Task lifecycle: `tasks/pending`, `tasks/done`, `tasks/failed`
- Artifact output: `images/`, `temp/`
- Automation engine: default browser-use MCP launcher (`scripts/run-browser-use-mcp.sh`) + legacy `mcp-server/` Playwright compatibility server

## Automation Contract
- Launch/attach fingerprint browser profile with `chrome.launch_cdp`.
- Establish browser session with `browser.connect_cdp`.
- Navigate and act with `page.goto` / `page.click` / `page.type`.
- Capture text/DOM evidence with `page.extract_text` / `page.get_html`.
- Use `page.screenshot` only when visual fallback is required.
- Detect auth/challenge markers and branch (retry/manual handoff).
- Record final status and artifact path.

## High-Risk Drift Zones
- Dynamic CSS class names on target websites.
- Alias mismatch (`puppeteer-stealth` server name vs browser-use tool namespace `chrome.*` / `browser.*` / `page.*`).
- Skill JSON assumptions that are no longer valid for latest UI.
