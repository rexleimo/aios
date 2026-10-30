# ADR 0005: Short harness name and upstream workflow handoffs

## Status

Accepted for the requested host-skill integration, 2026-10-30.

## Decision

Use `aios-harness` as the canonical skill name, aligned with `/harness` and
`aios harness`. Keep the old `aios-long-running-harness` catalog selector as an
explicit alias. After a successful canonical install, move a proven AIOS-owned
legacy copy/link into `.aios-retired-skills/` beside the skill root. Preserve
unmanaged paths and archive all contents rather than deleting possible notes.
Generated repository projections use the existing orphan cleanup and short-name
canonical source. Historical training evidence retains its original identity.

Absorb the two Matt Pocock Beta skills as host guidance at existing boundaries:

```text
loop-me workflow spec -> accepted requirements/spec -> aios-harness run/evidence
chief-of-staff notes  -> source-linked Memo / decision brief / improvement candidate
```

`grill` remains the explicit requirements entry. The harness supplies operating
contract fields and consumes accepted requirements; it cannot select software
Providers. Rex retains stage selection and Evidence acceptance. `/retro` and
existing skill governance remain the environment-improvement/application path.
The upstream skills are reference designs, not newly installed Providers.

Definitions/revisions and individual runs are distinct. A human decision point
requires a brief and an actual decision; a recovery checkpoint only saves state.
Contracts, source refs, and execution records reuse existing spec/work items,
Memo, ContextDB, and the run journal.

## Limits and tradeoffs

This change delivers guidance, catalog compatibility, and install migration.
It does not implement a scheduler, cross-run deduplication engine, automatic
contract hashing/validation, or new resource gates. Those remain separate
runtime work and must not be claimed as guarantees from a skill document.
Existing quota, cadence, timeout, and operator gates retain their current owners.

Global unmanaged collisions remain visible and require owner resolution; the
installer never replaces them just to finish a rename. Archives are recoverable
but no longer discoverable skills. This is a reversible host change with no
submodule change or release/publication action.

## Rejected alternatives

- Two additional orchestration skills: duplicate ownership and extra handoffs.
- Rename only the heading: discovery, installation and learn-eval would still use
  the long identity.
- Treat wiki/spec text as executable proof: it cannot enforce runtime guarantees.

## Sources and validation

- `docs/architecture/adr/0003-external-skill-adoption-landing.md`.
- `skill-sources/aios-harness/references/workflow-integration.md`.
- https://github.com/mattpocock/skills/blob/v1.3.2/skills/in-progress/loop-me/SKILL.md
- https://github.com/mattpocock/skills/blob/v1.3.2/skills/in-progress/chief-of-staff/SKILL.md
- Public-entry tests: `scripts/tests/foundation/skills/install/harness-rename.test.mjs`.
- Execution evidence and final checks: `docs/plans/2026-10-30-shorten-harness-skill-and-integrate-workflow-authoring.md`.
