# Workflow Iteration v2.1 release / rollback gate

> Scope: L9. Commit and version bump authorized by architect review (2026-08-01). `npm publish` is deferred pending registry confirmation.

## Gate status

| Gate | Result | Evidence |
|---|---|---|
| Rex full suite | PASS | `npm run test:rex`: Rex 191/191, contract 38/38, integration 52/52, workflow policy 74/74 |
| Doctor | PASS | `@rexleimo/rex-harness doctor`: `status=ready`, 13 capabilities, 6 clients, no missing instructions |
| P2/P3 artifact runtime | PASS | capability-runtime 14/14, artifact CLI + client compatibility 4/4; typed artifact and nested evidence refs fail closed at the current capability boundary |
| AIOS state durability | PASS | activation-store 9/9; write-ahead transaction recovery, projection/workflow consistency, and single-token serialization verified |
| P4 Skill S1-S5 | PASS | 13 canonical Skills accepted, score 1, training gate verified; matrix in `2026-08-01-rex-skill-quality-training-matrix.md` |
| P5 client compatibility | PASS | six-client invocation 2/2 plus workspace-scoped artifact CLI 2/2; matrix in `2026-08-01-client-invocation-compatibility.md` |
| Memory hygiene | SURVEY ONLY | survey generated; no automatic cleanup or rewrite |
| Rex child package | PASS | from `rex-harness/`: `npm pack --dry-run --json`; `@rexleimo/rex-harness@0.5.0`, 102 entries |
| Root package | NOT A PACKAGE BY DESIGN | root manifest is `private: true` and has no publish name/version; `npm pack --dry-run` correctly rejects it |
| Manifest/diff hygiene | PASS | `git diff --check` and `git -C rex-harness diff --check` returned no whitespace errors |
| Rollback rehearsal | PASS | client projection contract 20/20 plus `rex-release-gate.test.mjs` 4/4 |

## Rollback rehearsal

The rehearsal verifies the rollback inputs without mutating a client projection:

1. Current canonical digest is present in managed `projection-history.json`.
2. Every changed Skill retains at least one prior digest.
3. Client projection tests preserve user-modified targets, reject forged markers and junctions, and refuse unsafe writes.
4. Restoring a prior source/digest pair must be followed by source contract, certification, projection contract, and full Rex verification before republishing.

The following tests passed in the current worktree:

```text
node --test rex-harness/tests/contract/client-install.test.mjs
node --test scripts/tests/rex-release-gate.test.mjs
```

## Release decision

Implementation and verification gates are green. Commit and version bump authorized by architect review. `npm publish` is deferred until registry target and access token are confirmed with the user.
