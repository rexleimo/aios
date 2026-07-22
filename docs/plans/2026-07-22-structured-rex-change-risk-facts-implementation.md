# Structured Rex Change and Risk Facts Implementation

## Bounded Implementation

- Added `rex-harness/src/domain/change-risk-assessment.mjs`, the closed domain
  normalizer for all five assessment dimensions and their allowed values.
- Added the explicit evidence-bearing Observation kind
  `change.risk-assessed`. Only that structured observation validates and
  carries a `changeRisk` payload; unstructured request prose remains outside
  this classification.
- Added five stable Fact kinds and an optional, non-empty scalar `value` to the
  existing immutable Fact shape. Existing facts without `value` retain their
  prior serialized form.
- Reused `deriveSoftwareFacts()` to project one normalized assessment into five
  evidence-bearing facts. Conflicting values for the same fact kind fail closed.
- Added public-entry application tests for valid and invalid schemas,
  representative values, keyword false-positive prevention, routing neutrality,
  and workflow JSON round trips.

## Deliberate Boundary

No capability selector, Provider binding, client projection, or AIOS adapter
consumes these new facts in Phase 3. The paired decision test proves that an
otherwise identical request receives the same current Capability and portable
Provider hint. P4 owns any proportional policy that later consumes the facts.

## Verification

- Focused public scenario:
  `receipt:a8edf2ed-76a4-472e-8880-3411cefa8506` (`node --test
  rex-harness/tests/application/change-risk-facts.test.mjs`, exit 0).
- Adjacent application suites:
  `node --test rex-harness/tests/application/change-risk-facts.test.mjs
  rex-harness/tests/application/request-evaluation.test.mjs
  rex-harness/tests/application/software-workflow-runtime.test.mjs` passed
  23 tests.
- `git -C rex-harness diff --check` exited 0.
