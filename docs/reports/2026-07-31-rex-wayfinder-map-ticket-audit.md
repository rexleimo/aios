# Rex Wayfinder map/ticket audit

> Scope: P2 / L5 Wayfinder artifact contract.
> Status: implementation complete for this batch; release approval remains gated by the parent P4/P5/L9 matrix.

## Contract reviewed

- Canonical source: `rex-harness/skill-sources/rex-wayfinder/SKILL.md`
- Eval source: `rex-harness/skill-sources/rex-wayfinder/evals/evals.json`
- Runtime validator: `rex-harness/src/domain/wayfinder-artifact.mjs`
- Domain tests: `rex-harness/tests/domain/wayfinder-artifact.test.mjs`

## Completion checks

- Destination contains name, success signal, bounded scope, and evidence refs.
- Decision Graph has stable node ids and edges cannot point at unknown nodes.
- Unknowns retain question, impact, and evidence refs.
- Decision Ticket has stable `decision-*` id, facts, decision, consequences, and evidence refs.
- Complete artifacts contain exactly one `nextSlice` object.
- Partial/blocked artifacts cannot claim a Decision Ticket or next slice.
- Every nested `evidenceRefs` entry requires a protocol prefix and rejects TODO/TBD/placeholder values at the runtime validator.
- Tracker/assignee/child-issue output remains prohibited by the canonical Skill.

## Verification commands

```text
node --test tests/domain/wayfinder-artifact.test.mjs
node --test tests/skills/skill-sources.test.mjs
```

The validator is provider-neutral and does not start implementation, Team, Harness, or another Provider.
