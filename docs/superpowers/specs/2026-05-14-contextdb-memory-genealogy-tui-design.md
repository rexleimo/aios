# ContextDB Memory Genealogy TUI Design

## Status

Approved for implementation planning on 2026-05-14.

## Goal

Add a terminal UI entry for browsing ContextDB memory genealogy from the existing AIOS Ink TUI. Users should be able to launch `npm run aios`, choose `Memory Genealogy`, inspect the current project's memory graph, expand node details, refresh the view, and opt in to raw event visibility only when needed.

## Non-Goals

- Do not build a browser UI or HTTP service in this phase.
- Do not mutate ContextDB data.
- Do not replace the existing `contextdb genealogy --json` CLI output.
- Do not attempt a dense graph layout in the first TUI version.

## Entry Point

The existing root Ink TUI remains the primary launch path:

```bash
cd /Users/molei/codes/aios
npm run aios
```

The main menu will add a `Memory Genealogy` item. Selecting it opens a new screen in `scripts/lib/tui-ink/screens/`.

## User Experience

The first version is a list-style memory genealogy browser optimized for terminal reliability.

The screen has three areas:

1. Header and summary
   - project name
   - node count
   - edge count
   - session count
   - checkpoint count
   - hidden raw event count
   - risk counts

2. Navigable memory list
   - groups graph nodes by their natural hierarchy
   - starts from the project root
   - emphasizes `session`, `checkpoint`, and `ref` nodes
   - shows compact labels, trust, status, risk, and timestamp where available

3. Detail panel
   - shows the selected node's summary
   - shows type, id, source path, refs, risk, trust, and metadata highlights
   - keeps raw events hidden by default

## Keyboard Controls

- `Up` / `Down`: move selection
- `Enter`: toggle detail focus or expanded details for the selected row
- `E`: toggle raw event inclusion
- `R`: reload genealogy data from disk
- `B`: return to the main menu
- `Q`: quit the TUI through existing global behavior where applicable

## Data Flow

The TUI should call the TypeScript builder directly instead of shelling out to `npm run contextdb`.

```text
MemoryGenealogyScreen
  -> buildMemoryGenealogyGraph({ workspaceRoot, project, limit, includeEvents, eventsPerSession })
  -> formatGenealogyRows(graph)
  -> render summary, row list, and selected node details
```

Direct builder use avoids npm output headers and keeps JSON parsing out of the UI path.

## Defaults

- `workspaceRoot`: `AIOS_PROJECT_ROOT` when available, otherwise current project root passed to the TUI session.
- `project`: inferred from the current workspace, defaulting to `aios` for this repository.
- `limit`: `40` sessions.
- `includeEvents`: `false`.
- `eventsPerSession`: `10` when events are enabled from the TUI.

## Privacy and Safety

The TUI inherits the genealogy builder's privacy posture:

- raw event nodes are hidden by default
- sensitive snippets are redacted by existing builder logic
- event visibility requires an explicit `E` key toggle
- the screen is read-only and must not write to ContextDB

The UI copy should make the event toggle explicit, for example: `Events: hidden (press E to reveal redacted raw events)`.

## Error Handling

The screen should render recoverable errors instead of crashing the TUI.

Expected errors include:

- missing `memory/context-db` directory
- malformed JSON or JSONL rows
- no sessions for the selected project
- unexpected builder exception

When warnings are returned by the graph builder, the screen should show a compact warning count and expose warning text in the detail area or footer.

## Implementation Components

- `scripts/lib/tui-ink/screens/MemoryGenealogyScreen.tsx`
  - loads graph data
  - owns selected row, include-events toggle, loading state, and error state
  - renders summary, list, details, and controls

- `scripts/lib/tui-ink/genealogy-view.ts`
  - pure formatter helpers for converting graph nodes and edges into terminal rows
  - keeps data formatting testable without Ink terminal interactions

- `scripts/lib/tui-ink/App.tsx`
  - adds route for the memory genealogy screen

- `scripts/lib/tui-ink/screens/MainScreen.tsx`
  - adds `Memory Genealogy` menu item

- `scripts/lib/tui-ink/tests/tui-ink.test.ts`
  - verifies the new screen and formatter module import cleanly

- Optional focused test file for formatter behavior if the implementation becomes non-trivial.

## Testing Strategy

Minimum verification:

```bash
npm run test:scripts
cd mcp-server && npm run test:contextdb && npm run typecheck
```

Additional focused checks:

- import test for `MemoryGenealogyScreen`
- formatter test for hierarchy rows and selected-node details
- smoke run of `npm run aios` when an interactive TTY is available

## Acceptance Criteria

- `npm run aios` main menu contains `Memory Genealogy`.
- Selecting the menu item opens a read-only genealogy browser.
- The browser renders graph summary and navigable rows from ContextDB.
- Raw events are hidden by default and can be toggled with `E`.
- `R` refreshes data without restarting the TUI.
- `B` returns to the main menu.
- Missing or empty memory data shows a friendly empty/error state.
- Existing ContextDB genealogy CLI behavior remains unchanged.
- Automated tests pass for scripts and ContextDB type/test coverage.
