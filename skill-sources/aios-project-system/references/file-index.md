# File Index by Intent

## Understand architecture and routing
- `AGENTS.md`
- `docs/adr/0008-console-is-the-local-agent-stack-control-plane.md`
- `scripts/lib/tooling/specs/`
- `skill-sources/aios-workflow-router/SKILL.md`

## Change the current Console
- `apps/shell/README.md`
- `apps/shell/ui/src/components/console/`
- `apps/shell/ui/src/lib/console-navigation.ts`
- `apps/shell/ui/src/app/api/`
- `docs/plans/2026-11-06-console-retire-legacy-ui.md`

## Change MCP configuration and evidence
- `scripts/lib/clients/mcp/`
- `scripts/mcp-landing-evidence.mjs`
- `apps/shell/ui/src/lib/data/mcp.mjs`
- `scripts/tests/clients/mcp-formats/`
- `scripts/tests/tooling/io-safety/mcp-landing-evidence.test.mjs`

## Edit browser automation
- `scripts/run-local-browser-mcp.mjs`
- `mcp-server/src/index.ts`
- `mcp-server/src/browser/`
- `config/browser-profiles.json`
- `skill-sources/skill-constraints/SKILL.md`

## Adjust skills, memory and verification
- `skill-sources/` (edit canonical sources, then run `node scripts/sync-skills.mjs`)
- `scripts/lib/environment/aios/state-root.mjs`
- `scripts/lib/memory/memo/`
- `scripts/tests/tooling/shell/`
- `docs/plans/`
