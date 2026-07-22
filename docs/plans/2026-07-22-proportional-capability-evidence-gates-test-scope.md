# Proportional Capability and Evidence Gates Test Scope

## User Goal

Use the P3 structured change-risk facts to choose the existing proportional
delivery controls: ordinary local/reversible work remains on baseline TDD,
while elevated-risk or external-effect work uses the existing strict-TDD safety
and evidence contract. The workflow must still expose exactly one current Rex
Command as the sole Provider authority.

## Explicit Non-Goals

- Do not introduce prompt-length routes, a Fast/Balanced/Deep request router,
  a parallel workflow state machine, a second current Command, or Provider IDs
  in Facts.
- Do not change legacy `HIGH_RISK_BOUNDARY` or regression behavior.
- Do not add an external-effect agent role, perform external actions, or infer
  P3 risk facts from keywords.
- Do not change P5 API/outcome semantics, P6 persistence, P7 adapters, or P8
  rollout behavior.

## Proportional Decision Table

| Structured assessment (after scope + honest RED) | Expected Capability | Expected additional contract |
| --- | --- | --- |
| `local`, `none`, `reversible`, `low` | `software.testing.tdd` | Baseline RED/GREEN/REFACTOR; no strict test-strength receipt. |
| `external` or `destructive` effect | `software.testing.strict-tdd` | Strict RED/GREEN/REFACTOR plus `test-strength-check-recorded`. |
| `system` blast radius, `irreversible` change, or `high` uncertainty | `software.testing.strict-tdd` | Strict RED/GREEN/REFACTOR plus `test-strength-check-recorded`. |
| Same structured facts before scope or without a behavior change | Existing precondition result | No risk fact may bypass test design or create a command by itself. |

After a completed bounded diff, the existing independent standards/spec review
remains the review gate. Strict TDD therefore adds stronger safety and test
evidence without adding a second provider chain; any specialty-domain review
continues to require its separate explicit risk fact.

## Observable Behavior Contract

1. Low-risk facts select baseline TDD after the existing test-scope and honest
   RED preconditions, and retain its smaller evidence contract.
2. Each elevated condition in the table selects strict TDD through the current
   capability selector, with its stronger test-strength evidence requirement.
3. Before the normal preconditions are met, an elevated assessment neither
   bypasses test design nor fabricates a current command.
4. Legacy high-risk/regression Facts retain strict-TDD selection unchanged.
5. A strict-TDD refactor submission missing `test-strength-check-recorded`
   cannot advance to review; valid evidence advances to the single ordinary
   standards/spec review Command.
6. Every decision path exposes one current Command only, and execution-profile
   labels remain derived from completed Activations rather than request risk or
   prompt length.

## Acceptance-Test Mapping

| Behavior | Observable assertion | Public test seam |
| --- | --- | --- |
| Low-risk proportion | Decision is baseline TDD with no strict evidence kind. | `evaluateSoftwareRequest()` / `decideNextCapability()`. |
| Elevated proportion | Table-driven external/system/irreversible/high facts select strict TDD. | `evaluateSoftwareRequest()` / `decideNextCapability()`. |
| Preconditions | Same assessment before scope stays at test design; no-behavior input has no delivery command. | `evaluateSoftwareRequest()` / `startSoftwareWorkflow()`. |
| Legacy compatibility | Existing high-risk Fact still selects strict TDD. | Existing adaptive-routing scenario plus paired assertion. |
| Evidence rejection | Strict refactor lacks required test-strength evidence and cannot advance. | `advanceActivation()` or `advanceSoftwareWorkflow()`. |
| Single-command/review continuity | Completed strict path returns exactly one standards/spec review Command. | `startSoftwareWorkflow()` / `advanceSoftwareWorkflow()`. |
| Analytics boundary | Labels depend only on completed activation IDs. | `analyzeExecutionProfile()`. |

## Test Seam and Minimal Vertical Slice

Add a focused scenario test that creates public Fact collections containing the
existing behavior/scope/honest-RED prerequisites plus P3 value-bearing facts.
It asserts the decision table and strict evidence rejection through exported
Rex APIs. The smallest independent slice is one external-effect Fact selecting
strict TDD rather than baseline TDD; it needs no Provider invocation, client
adapter, or external side effect.

## Completion Judgment

P4 is ready only when the table is deterministic and explainable, low-risk
work retains the baseline path, elevated work is stronger through the existing
strict evidence contract, invalid/missing strict evidence is rejected, and no
test can observe more than one current Command or a Provider selected by a
Fact.

Tests must not obtain a pass by deleting preconditions, treating request prose
as structured risk, weakening strict evidence, or asserting a private helper
instead of the public decision and workflow result.
