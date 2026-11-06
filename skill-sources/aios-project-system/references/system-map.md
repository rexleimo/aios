# AIOS System Map

## Purpose
AIOS is a local orchestration control plane for coding clients: project memory, workflow routing, resumable tasks, teams and evidence. Browser automation is one legacy component.

## End-to-End Flow
Explicit task declaration -> workflow disposition -> current Rex Capability Command when required -> bounded execution -> verification evidence -> project memory/checkpoint.

## Main State Surfaces
- Canonical skills: `skill-sources/`; client skill roots contain generated projections.
- Runtime specs: `scripts/lib/tooling/specs/`; project-local sessions and generated state: `.aios/`.
- Durable memo records: `.aios/memo/`; memo paths can be overridden through the state-root resolver, so do not scan a fixed path as a complete project inventory.
- Plans: `docs/plans/`; task queues: `.aios/tasks/`; temporary evidence: `temp/`.
- Browser engine: `scripts/run-local-browser-mcp.mjs`, using `mcp-browser-use` with local or external CDP profiles.

## Current Console
- `apps/shell/ui/` is the local AI tool manager. `/` is the default; tools, MCP, memory, activity and settings share one interface.
- `src/lib/console-navigation.ts` owns current paths and old-bookmark redirects. `/prototype` is a redirect, not another interface.
- `src/components/console/demo-data.ts` supplies explicit example data. UI operations change page state; real project memory and configuration writes are not wired to the new interface.
- Existing API, CLI, configuration, session and memo storage remain available. Removing a UI does not authorize deleting their data or widening memory scopes.

## MCP Configuration
- `scripts/lib/clients/mcp/landing-schema.mjs` owns client-specific paths, formats and allowed fields.
- `server-writer.mjs` computes all file edits before one atomic write; format modules preserve unmanaged bytes.
- The ownership ledger distinguishes owned, external and conflicting entries. Adopt is explicit; force cannot claim an external entry.
- `scripts/mcp-landing-evidence.mjs` previews by default. Applied probes record write/read-back, ownership and original-hash restoration; evidence cards live under `docs/evidence/2026-11-05-mcp-landing/`.
- A verified landing card is historical evidence, not proof of a currently working MCP connection.

## Browser Contract
Use `browser_launch`, then `browser_navigate` and `browser_snapshot` before targeted HTML/screenshots. Use `browser_click` / `browser_type` for interaction. Preserve auth-wall handoffs and record the observed result with its evidence path.
