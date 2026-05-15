---
name: verification-loop
description: Evidence-before-assertions workflow. Use before claiming work is done, before release, and after any behavior change in scripts/skills/MCP.
---

# Verification Loop

## Trigger
Use this skill when:
- You changed runtime behavior (scripts, wrappers, MCP server, install flows)
- You are about to say "done", "fixed", "works", or "passes"
- You are about to bump version / release

## Rules
- Prefer commands with deterministic exit codes over "it looks fine".
- If you cannot run verification, say exactly what you could not run and why.

## Baseline Checks (AIOS)
1. Run the verifier:
   - `aios doctor`
   - Or: `node scripts/aios.mjs doctor`
   - Compatibility wrappers: `scripts/verify-aios.sh` / `scripts/verify-aios.ps1`

2. MCP server changes (minimum):
   - `cd mcp-server && npm run typecheck`
   - `cd mcp-server && npm run build`
   - Manual smoke: `chrome.launch_cdp` -> `browser.connect_cdp` -> `page.goto` -> `page.extract_text`/`page.screenshot` -> `browser.close`

3. Install/wrapper changes:
   - Re-run install/update on a clean-ish shell session.
   - Confirm new commands are visible and resolve to `ROOTPATH` scripts.

## Evidence Capture
- Record the exact commands run and whether they succeeded.
- For failures: include the first actionable error line and the remediation you applied.
