# Memory hygiene survey

> Scope: P5 / L8. Survey only. No Memory entry, workspace file, session log, Skill source, or external projection was deleted or rewritten.

## Sources surveyed

| Source class | Repository location/pattern | Hygiene risk | Recommended human action |
|---|---|---|---|
| Workspace memory runtime | `scripts/lib/memo/workspace-memory.mjs` and the resolved ContextDB root (`.workspace-memory.json`, `sessions/<id>/meta.json`, `state.json`, `pinned.md`, `l2-events.jsonl`) | stale running sessions, unbounded event history, sensitive content in pinned text | review session status/age and redact or archive only after owner approval |
| Memo CLI/provenance | `scripts/lib/cli/commander/specs/memory.mjs`, `scripts/tests/memo-*.test.mjs` | duplicate candidates or provenance that outlives the originating task | review provenance and retention policy; do not auto-promote candidates |
| Workflow state | `.aios/workflow-activations/` and `.rex-harness/` in project workspaces | stale tokens, incomplete commands, old evidence refs | use Rex resume/doctor and rollback rules; do not edit state by hand |
| Skill projection/evidence | `rex-harness/skill-sources/`, `rex-harness/src/clients/projection-history.json`, `docs/evidence/skill-training/` | stale projections or historical evidence mistaken for current certification | compare current digest to managed history and current certification state |
| Design/report history | `docs/plans/`, `docs/reports/`, `docs/superpowers/` | duplicate or superseded plans treated as active instructions | mark superseded documents after a human review; retain audit history |
| External/user memory | outside repository, including client-specific memory stores | not visible to this repository survey; possible cross-client duplication | survey each client owner-side before any deletion; require explicit approval |

## Findings

- No automatic cleanup was run.
- `agent-sources/skills/` was not touched.
- Node module `in-memory` implementation files were excluded as dependency internals, not memory records.
- Historical certification evidence is evidence, not active instruction; current gate output must be preferred.
- Workspace memory uses explicit session IDs and status fields, which allows age/status review without destructive scanning.

## Approval queue

1. Human owner identifies stale workspace-memory sessions.
2. Human owner confirms whether pinned content is still needed.
3. Human owner approves redact/archive/delete action per source class.
4. After approval, run a separate hygiene command with a dry-run and auditable diff.

This report intentionally stops at recommendations. It does not mutate Memory.
