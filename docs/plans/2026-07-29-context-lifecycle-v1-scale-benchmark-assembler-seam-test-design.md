# Context Lifecycle V1 Scale Benchmark Assembler-Seam Test Design

> Work item: `context-lifecycle-v1-scale-benchmark-assembler-seam`
> Status: implemented; positive scale fixtures use assembler delivery and direct unread fixtures remain fail-closed
> Requirements: `docs/plans/2026-07-29-context-lifecycle-v1-scale-benchmark-assembler-seam-requirements.md`

## Test scope contract

### User goal

The controlled scale benchmark must distinguish valid process-local delivery from a direct caller assertion. Positive `ready`, `stale`, and declared-mutation records must pass through `assembleExecutionContext()`, while unread records must continue to exercise the fail-closed direct packet path.

### In scope

- Public benchmark runner output for 20 tasks and 200 receipts.
- Positive assembler-created `ready`, `stale`, and `undeclared` cases.
- Direct-builder `required_context_unread` cases.
- CJK paths, custom state roots, temporary workspace cleanup, JSON/Markdown labels, and deterministic decision receipts.

### Out of scope

- Product preflight or authority changes.
- Remote brokers, independent production oracles, real-project samples, and enforcement readiness.
- Replacing canonical unit/integration tests with benchmark totals.

## Acceptance-to-test mapping

| Acceptance behavior | Public observation | Fixture and assertion |
| --- | --- | --- |
| Positive evidence comes from assembler | Scale case receipts | `ready`, `stale`, and declared-mutation records use `assembleExecutionContext()` and retain assembler evidence. |
| Direct unread remains fail-closed | Preflight reasons | Direct packet records without delivery evidence include `required_context_unread`. |
| Stale detection is additive | Case verdict | Stale cases include `required_context_stale`; they are not mislabeled as false positives. |
| Undeclared detection is independent | Case verdict | Undeclared cases include `undeclared_target` without an artificial unread reason. |
| Synthetic boundary remains explicit | Report metadata | JSON and Markdown retain `controlledSynthetic`, `productionWiringObserved: false`, `independentOracle: false`, `realProjectSamples: 0`, and `releaseGatePassed: false`/`NO-GO`. |
| Scale and cleanup remain stable | Runner summary | Assert 20 tasks, 200 receipts, expected paths, and removal of temporary workspaces. |

## Focused verification

```text
npm run benchmark:context-lifecycle-v1-scale
node --test --test-concurrency=1 scripts/tests/context-lifecycle-benchmark.test.mjs
```

The benchmark is a controlled engineering smoke only. Its passing result cannot establish production precision/recall or authorize pilot/default enforcement.
