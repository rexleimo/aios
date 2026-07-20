# Rex Migration Public Documentation Regression Repair Plan

## Objective

Restore the focused public release-documentation regression without weakening
the ownership-safe Rex-only migration contract or reverting the intended
Markdown rendering.

## Dependency graph

1. **Align the assertion with the public Markdown contract**
   - Input: the standards/spec review and the observed focused-test failure
     (`receipt:e051da5b-bfca-466f-bd3f-1fbfdb2fd957`).
   - Owner: `scripts/tests/release-pipeline.test.mjs`.
   - Completion: the test explicitly recognizes the inline-code form
     `` `rex-harness` is the only default software-engineering workflow ``.
   - Boundary: do not relax any ownership, migration command, client coverage,
     navigation, or localized-guide assertions.

2. **Verify the one public scenario**
   - Depends on step 1.
   - Command: `node --test --test-name-pattern "public release documentation
     describes ownership-safe Rex-only migration"
     scripts/tests/release-pipeline.test.mjs`.
   - Completion: exit code 0; it must still check normal-update conflict
     preservation, explicit adoption, client coverage, and localized routes.

3. **Review the final focused diff**
   - Depends on step 2.
   - Command: `git diff --check -- docs-site/superpowers.md
     scripts/tests/release-pipeline.test.mjs`.
   - Completion: no whitespace errors and no change outside the migration-guide
     rendering or its public regression assertion.

## Critical path and rollback

The critical path is 1 -> 2 -> 3. No independent work item exists. If the
focused test stays red, stop the release documentation work and retain the
failure receipt; do not reintroduce malformed Markdown or weaken the remaining
acceptance checks to force a pass.
