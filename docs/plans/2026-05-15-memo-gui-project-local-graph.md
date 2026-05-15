# Memo GUI Project-Local Graph Optimization Plan

Route: implementation + frontend UI + ContextDB workflow.

## Objective

Make `aios memo gui` usable from any project directory to inspect that project's ContextDB memory genealogy, while improving graph interactions with XYFlow instead of the current awkward node-click experience.

## Deliverables

1. `aios memo gui` subcommand launches the Memory Galaxy server from the current project directory.
2. GUI static assets are served from the installed AIOS root, while graph data comes from the target project workspace.
3. Non-AIOS projects with only `memory/context-db` can be viewed; they do not need `scripts/lib/genealogy-gui` in their own repo.
4. CLI help documents the new command and options.
5. XYFlow interactions are cleaned up: stable selection, focus/fit behavior, clickable parent/child navigation, clearer empty/error states, and less confusing default workspace/project handling.
6. Default graph layout is relationship-first instead of a strict hierarchy; a Timeline layout remains available for sequential reading.
7. GUI has bilingual English/Chinese labels, a language toggle, and a top-right Tips glossary explaining filters and node terms like `CP` and `Ref`.
8. Tests cover parser/help, project-local launch wiring, GUI interaction affordances, and ContextDB genealogy server asset/data root separation.
9. Browser-facing GUI APIs stay scoped to the launched workspace and only expose graph-referenced files.

## Research Evidence

- Local code already has `mcp-server/src/contextdb/genealogy.ts` graph builder and `scripts/lib/genealogy-gui/index.html` using `@xyflow/react`.
- Current `genealogy:serve` incorrectly resolves GUI assets from `workspaceRoot/scripts/lib/genealogy-gui`, which fails in arbitrary projects.
- Context7 XYFlow docs confirm `ReactFlow`, `useNodesState`, `useEdgesState`, `Controls`, `MiniMap`, `Background`, `onNodeClick`, `fitView`, and custom nodes are the right primitives.
- `npm view @xyflow/react version` returned `12.10.2`; current page loads `12.4.0`, so update the CDN pin.

## Implementation Notes

- Add a `memo gui` branch in `scripts/lib/memo/memo.mjs` that uses the current workspace root by default and blocks on the local server process.
- Pass `AIOS_ROOT_DIR` / `--assets-root` to ContextDB CLI so the server can load GUI assets from AIOS installation, independent of project workspace.
- Keep ContextDB graph APIs read-only.
- Restrict `genealogy:serve` browser API to same-origin requests, the launched workspace root, and graph-referenced relative files to avoid turning the local server into a broad file reader.
- Prefer TDD additions before editing runtime behavior.
- Use a clustered relationship layout by default: project root in the center, sessions around it, and CP/Event/Ref nodes orbiting their owning session.
- Keep the legacy DAGRE hierarchy as an explicit Timeline mode for users who prefer parent-to-child progression.
- Store UI language preference in local storage and detect `zh` browser locales on first load.

## Verification

- Targeted root CLI tests: `node --test scripts/tests/aios-cli.test.mjs`.
- Targeted ContextDB tests: `cd mcp-server && npm run test:contextdb` or focused `tsx --test tests/contextdb.test.ts`.
- Runtime smoke: create temp project, choose a free positive TCP port, then run `node scripts/aios.mjs memo gui --no-open --port <port>` or server API smoke if non-blocking test path is available.
- Security regression: server test verifies unreferenced files, other workspaces, and foreign origins are denied.
