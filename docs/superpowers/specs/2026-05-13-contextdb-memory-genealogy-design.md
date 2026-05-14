# ContextDB Memory Genealogy Design

Date: 2026-05-13
Status: Draft for user review
Scope: Product/UI design for a user-facing ContextDB memory genealogy view

## Goal

Let users inspect ContextDB's "memory genealogy" as a visual, explainable map instead of raw session folders, JSONL files, or flat timelines.

The view should answer four user questions:

1. Where did this memory come from?
2. Which sessions, checkpoints, or handoffs inherited it?
3. What evidence supports it?
4. Is it still trustworthy or stale?

## Selected Direction

Use a "Memory Galaxy" / knowledge-map interface.

The user approved the C direction from the visual companion:

- Center: project / workspace memory root.
- Middle ring: sessions and durable memos.
- Outer ring: checkpoints, events, refs, artifacts, and handoff links.
- Detail panel: selected node explanation, source, descendants, evidence, trust, risks, and actions.

This direction is more memorable and exploratory than a flat timeline. To reduce confusion, the default mode must be an explainable graph, not a raw force-directed data dump.

## Data Model Mapping

ContextDB already has enough structure to build the genealogy without a storage migration.

### Node Types

| Node type | Source | Meaning | Visual role |
|---|---|---|---|
| Project root | `memory/context-db/manifest.json`, workspace root | Current memory universe | Center node |
| Workspace memory | `workspace-memory--<space>`, `pinned.md`, memo events | Stable operator/project facts | Green durable node |
| Session | `sessions/<sessionId>/meta.json` | A run or branch of work | Blue branch node |
| Checkpoint | `l1-checkpoints.jsonl` | Durable state summary / milestone | Yellow milestone node |
| Event | `l2-events.jsonl` | Raw user/model/tool memory | Purple detail node |
| Continuity | `continuity.json`, `continuity-summary.md` | Compact handoff state | Pink bridge node |
| Handoff | `handoff.json` | Explicit cross-agent/session inheritance | Pink bridge node |
| Ref / artifact | `refs`, `artifacts`, `workItemRefs`, `nextStateRefs` | Evidence and external anchors | Small satellite node |

### Edge Types

| Edge type | Source | Meaning |
|---|---|---|
| contains | project -> session -> checkpoint/event | Structural containment |
| summarizes | checkpoint -> event window | Checkpoint summarizes recent events |
| inherits | continuity/handoff parent -> child session | Memory transferred into a later run |
| references | event/checkpoint -> ref/artifact | Evidence link |
| relates | search/recall similarity or shared refs | Non-parent semantic relationship |
| risk | failed quality gate / stale checkpoint / blocked status | Relationship needing attention |

## Information Architecture

### Entry Points

1. `aios hud --memory-map` or a future TUI route for current session context.
2. `aios memo genealogy` for workspace memory and durable notes.
3. `aios contextdb genealogy --project <name>` for full project-level inspection.
4. Docs-site demo page for public explanation of ContextDB memory.

### Screen Layout

Use a two-panel layout:

- Left/main: interactive Memory Galaxy.
- Right: inspector panel for the selected node.

Main canvas includes:

- project center,
- ring grouping by hierarchy level,
- color-coded node types,
- edge filters,
- search box,
- zoom controls,
- mode tabs: `Lineage`, `Trust`, `Failures`, `Refs`.

Inspector panel includes:

- node title and type,
- session/project/agent metadata,
- summary,
- parent and child links,
- evidence refs/artifacts,
- trust/staleness signals,
- raw JSON/event expansion,
- actions.

### Modes

#### Lineage

Default mode. Shows ancestry and descendants.

Use this when a user asks:

- "Where did this memory come from?"
- "What remembered this?"
- "Which session inherited this context?"

#### Trust

Ranks memories by confidence.

Signals:

- latest checkpoint status,
- verification telemetry,
- quality gate outcome,
- freshness / updatedAt,
- number and quality of evidence refs,
- whether descendants contradicted or repaired it.

#### Failures

Highlights blocked or failed branches.

Signals:

- checkpoint status `blocked`,
- quality-gate failures,
- dispatch hindsight repeated failures,
- failed handoff or missing continuation.

#### Refs

Shows evidence connectivity.

Useful for answering:

- "Which docs or files made this memory?"
- "What code paths are mentioned repeatedly?"
- "Which memories depend on this artifact?"

## Interaction Design

### Default View

On first load:

1. Show the current project root.
2. Show only the top 20-40 high-signal nodes.
3. Collapse raw events behind session/checkpoint summaries.
4. Prefer recent checkpoints, pinned memos, handoffs, failed quality gates, and high-ref-count artifacts.

This avoids overwhelming users with JSONL noise.

### Node Click

Clicking a node updates the inspector:

- summary,
- origin path,
- parents,
- descendants,
- evidence,
- raw event expansion,
- suggested actions.

Suggested actions:

- Open raw event.
- Expand ancestors.
- Expand descendants.
- Compare with sibling sessions.
- Mark stale.
- Pin as canonical memory.
- Export lineage packet.

### Search

Search should use existing ContextDB retrieval before graph expansion:

- `search` for direct event/checkpoint hits,
- `recall:sessions` for session-level candidates,
- `timeline` for localized chronological context,
- `event:get` only when the user expands a raw event.

Search result behavior:

1. Highlight matching nodes.
2. Dim unrelated graph areas.
3. Offer "show ancestry" and "show descendants" quick actions.

### Progressive Disclosure

Use three levels:

1. Overview: clusters and high-signal memories only.
2. Explain: selected node with parent/child/evidence summary.
3. Raw: exact JSONL event/checkpoint details.

Raw mode should never be the default.

## Visual Language

The visual direction should be distinctive but readable.

- Background: dark star-map surface with subtle radial clusters.
- Typography: technical/editorial rather than generic SaaS.
- Colors:
  - Green: root, workspace memory, pinned facts.
  - Blue: sessions.
  - Yellow: checkpoints.
  - Purple: events and refs.
  - Pink/red: handoff, risk, stale, failed quality gate.
- Edges:
  - Solid: direct containment/inheritance.
  - Dashed: inferred relation.
  - Red/pink: risk or contradiction.
  - Brighter/thicker: stronger evidence or more recent use.

Accessibility requirements:

- color cannot be the only indicator,
- every node type needs label/icon/shape distinction,
- keyboard navigation should traverse selected graph neighborhoods,
- inspector must be screen-reader-friendly.

## Technical Shape

### Aggregation Layer

Add a read-only graph builder that converts ContextDB files/indexes into a compact graph payload.

Candidate API output:

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-05-13T00:00:00.000Z",
  "project": "aios",
  "root": "project:aios",
  "nodes": [
    {
      "id": "session:codex-cli-...",
      "type": "session",
      "label": "codex-cli · memory optimization",
      "summary": "Layered memory with agent views",
      "trust": 0.82,
      "risk": "none",
      "refs": ["docs/superpowers/specs/..."]
    }
  ],
  "edges": [
    {
      "source": "project:aios",
      "target": "session:codex-cli-...",
      "type": "contains",
      "strength": 1
    }
  ]
}
```

### Data Sources

Use current sources first:

- filesystem session files as source of truth,
- SQLite sidecar for indexed search/timeline retrieval,
- existing `search`, `recall:sessions`, `timeline`, `event:get`,
- HUD state helpers where dispatch/quality/hindsight context is useful.

No migration is required for the first version.

### Performance

For a large workspace:

- load top-level graph with capped nodes,
- lazy-expand sessions and raw events,
- cache graph summaries by session mtime,
- reuse SQLite sidecar for filtering,
- cap edge count in the browser payload.

Recommended default limits:

- initial sessions: 40,
- checkpoints per expanded session: 10,
- raw events per expanded checkpoint: 20,
- refs/artifacts per node: 8.

## Empty, Error, and Safety States

### Empty State

If no sessions exist:

"No ContextDB memory yet. Start a session or add a memo to grow the first branch."

Actions:

- Create session.
- Add memo.
- Open ContextDB docs.

### Sparse State

If sessions exist but no checkpoints:

"This branch has raw events but no durable checkpoint. Add a checkpoint to make it inheritable."

### Stale State

If facade or latest pack is stale:

"This map may not include the latest memory packet."

Actions:

- Rebuild index.
- Refresh context pack.

### Privacy/Safety

The graph must not expose secrets by default.

Rules:

- redact credential-looking text before rendering snippets,
- show raw event text only on explicit expand,
- do not render cookies, tokens, `.env`, or auth logs,
- preserve existing AIOS privacy gates when exporting or sending graph context to a model.

## MVP Recommendation

Build in this order:

1. Graph data command/API: `contextdb genealogy --project <name> --limit <n> --json`.
2. Text/TUI fallback: compact tree/star summary for terminal users.
3. Browser/TUI graph view with inspector panel.
4. Trust and failures overlays.
5. Pin/stale/canonical actions.

The first version should prioritize explainability over graph complexity:

- default to `Lineage`,
- show only high-signal nodes,
- put raw details in the inspector,
- make search the main way to focus the graph.

## Acceptance Criteria

- A user can identify a selected memory's parent, children, source file, evidence refs, and latest status.
- The default view is understandable without reading raw JSONL.
- Search can focus the graph around a query or session.
- Raw event text is available but hidden behind explicit expansion.
- Trust/risk indicators distinguish current, stale, failed, and handoff-derived memories.
- The first implementation can be generated from existing ContextDB files and indexes without schema migration.

## Open Decisions

- Whether the first UI ships inside the existing Ink TUI, a local browser page, or docs-site demo.
- Whether "trust" is initially a simple heuristic or a persisted score.
- Whether users can edit graph-derived state in v1, or only inspect and export it.
