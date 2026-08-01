# Rex Planning vertical-slice audit

> Scope: P3 / L6 Planning artifact contract.
> Status: implementation complete for this batch; release approval remains gated by the parent P4/P5/L9 matrix.

## Contract reviewed

- Canonical source: `rex-harness/skill-sources/rex-planning/SKILL.md`
- Eval source: `rex-harness/skill-sources/rex-planning/evals/evals.json`
- Runtime validator: `rex-harness/src/domain/planning-artifact.mjs`
- Domain tests: `rex-harness/tests/domain/planning-artifact.test.mjs`

## Completion checks

- Delivery Ticket references a separate `artifact:decision-ticket:*` Decision Ticket.
- Each work item is a vertical observable outcome with completion criteria, verification, evidence refs, and real dependencies.
- Dependencies are checked for unknown nodes, self-dependencies, and cycles.
- Frontier places every work item exactly once in ready or blocked; duplicate and contradictory membership is rejected.
- Parallel groups are explicit and cannot contain duplicate/unknown work items or repeat one work item across groups.
- Convergence Gate records protocol-scoped required evidence, verification, and the join condition.
- Nested evidence refs reject unscoped and TODO/TBD/placeholder values.
- Hard completion requires `rex.runtime-artifact-contract.v1` with a declared consumer and an `artifact:` reference.
- The planning Skill does not start Team/Harness or another Provider.

## Verification commands

```text
node --test tests/domain/planning-artifact.test.mjs
node --test tests/skills/skill-sources.test.mjs
```

The validator does not create plans or mutate planning state; it only normalizes and rejects invalid artifacts.
