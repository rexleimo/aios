# AIOS System Map

## Purpose
AIOS is a browser-automation assistant for Xiaohongshu operations plus related content tooling (including Jimeng image generation).

## End-to-End Flow
User intent -> skill retrieval (repo-local skill roots) -> repository-local Node/Playwright MCP actions -> platform result -> evidence capture -> memory/docs updates.

## Main State Surfaces
- Process memory: repo-local skills, runtime specs in `scripts/lib/specs`, memo records in `.aios/memo`, and ContextDB state in `.aios/context-db`
- Task lifecycle: `.aios/tasks/pending`, `.aios/tasks/done`, `.aios/tasks/failed`
- Artifact output: `images/`, `temp/`
- Automation engine: repository-local Node/Playwright MCP launcher (`scripts/run-local-browser-mcp.mjs`) with local launch and external CDP attachment modes

## Automation Contract
- Use `browser_launch` for a local Playwright browser or a configured external CDP profile.
- Navigate and act with `browser_navigate` / `browser_click` / `browser_type`.
- Capture accessible page state with `browser_snapshot` and visual evidence with `browser_screenshot`.
- Detect auth/challenge markers and branch (retry/manual handoff).
- Record final status and artifact path.

## High-Risk Drift Zones
- Dynamic CSS class names on target websites.
- Browser MCP alias drift: keep `mcp-browser-use` as the only active browser MCP alias.
- Skill JSON assumptions that are no longer valid for latest UI.
