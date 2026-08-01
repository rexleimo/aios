# Rex Skill S1-S5 quality/training/projection matrix

> Scope: L7 / P4. This report records the completed canonical Skill batches, deterministic certification, projection history, and rollback references. It does not claim model fine-tuning.

## Batch matrix

| Batch | Canonical Skills | Source/eval work | Certification | Projection/rollback |
|---|---|---|---|---|
| S1 | `rex-requirements`, `rex-implement` | typed decision boundary, self-check, no-op/scope/rollback eval | accepted, score 1 | current digests appended to `src/clients/projection-history.json`; previous digests retained |
| S2 | `rex-debug`, `rex-tdd` | observation/hypothesis/falsifier/receipt loop, RED/GREEN receipt boundary | accepted, score 1 | current digests appended; previous digests retained |
| S3 | `rex-wayfinder`, `rex-planning` | map/ticket and vertical delivery artifact contracts | accepted, score 1 | current digests appended; previous digests retained |
| S4 | `rex-code-review` | Standards/Spec verdict contract and blocked empty-diff boundary | accepted, score 1 | current digest appended; previous digests retained |
| S5 | `rex-design`, `rex-strict-tdd`, `rex-refactor-hardening`, `rex-minimal-construction`, `rex-test-design`, `rex-workflow` | no-op, negation, sediment, completion and replan boundaries | accepted, score 1 | current digests appended; previous digests retained |

## Fresh evidence

The latest changed-Skill certification run returned `status: verified` and `accepted` for all 13 canonical Rex Skills:

```text
node scripts/aios.mjs skill certify --changed --base HEAD --json
node scripts/aios.mjs skill verify-training --changed --base HEAD --json
```

The detailed timestamped certification run directories are intentionally ignored by `.gitignore` and remain local or CI artifact uploads; they are not source files for the repository. The stable acceptance summary is this report, while a reviewer who needs raw deterministic traces should receive the corresponding CI artifact bundle separately.

Source/eval and packaged-source checks:

```text
node --test rex-harness/tests/skills/skill-sources.test.mjs
```

The current source contract suite passed. Projection history is append-only and contains the prior digest plus the new digest for every changed Skill; no client target was hand-edited.

## Rollback contract

Rollback is source/projection history based:

1. restore the prior canonical Skill source/eval pair from the worktree or the prior approved revision;
2. restore the prior `projection-history.json` entry (the old digest remains recorded here);
3. rerun source/eval contract, certification gate, and client projection contract;
4. only then regenerate a managed projection.

No `agent-sources/skills/` content was copied or modified. No automatic Memory cleanup was performed.
