# Context Lifecycle V1 Scale Benchmark Assembler-Seam Requirements

> Work item: `context-lifecycle-v1-scale-benchmark-assembler-seam`
> Status: implemented; positive benchmark fixtures use assembler delivery and direct unread fixtures remain fail-closed

## Problem

The controlled scale benchmark currently creates its positive `ready`, `stale`, and declared-mutation records through `buildExecutionContextPacket({ readRefs })`. Caller read assertions are now intentionally fail-closed, so this benchmark setup no longer models a valid delivery path and would count correct `required_context_unread` warnings as false positives.

## Acceptance criteria

1. Benchmark positive records use `assembleExecutionContext()` to create actual process-local delivery evidence, rather than `readRefs` passed to direct packet construction.
2. Benchmark unread records continue to use the direct builder with no delivery evidence and must observe `required_context_unread`.
3. Ready records observe no block reasons; stale records observe `required_context_stale`; undeclared records observe `undeclared_target` without an artificial unread reason.
4. Existing task count, record count, CJK paths, custom project state roots, temporary-workspace cleanup, JSON/Markdown outputs, and `controlledSynthetic` / `NO-GO` labels remain intact.
5. The benchmark remains a synthetic engineering smoke. It must not claim production wiring, an independent oracle, real-project samples, precision/recall, or release readiness.

## Non-goals

- Changing product preflight, packet, assembler, memo, Dream, or authority behavior.
- Reclassifying the fail-closed direct packet as ready.
- Adding real dispatch or a remote broker to the benchmark.
- Using benchmark output as a substitute for canonical suite or production validation.

## First slice

1. Run the current benchmark to record the expected behavior delta after fail-closed caller evidence.
2. Replace only the positive fixture construction with `assembleExecutionContext()`.
3. Re-run the same 20-task/200-record temporary-fixture benchmark and assert its internal smoke checks pass.
4. Inspect output metadata to ensure its synthetic / no-production boundary remains explicit.
