# Context Lifecycle Review Findings Remediation - Minimal Construction Decision

## Reuse Ladder

1. Remove the requirement: rejected. The report identifies a production reachability gap and a stale derived-index bug; removing the behavior would leave the reported regressions unresolved.
2. Reuse existing repository behavior: selected. `normalizeTask()` and `updatePlanTask()` own structured task persistence; `readOrRebuildDreamArchiveIndex()` and `withMemoRootLock()` already own index freshness and concurrent rebuilds.
3. Use platform primitives: selected. Commander already parses the plan CLI, and Node filesystem APIs are sufficient for task declaration parsing, dependency ordering, and proposal file reads.
4. Add a dependency: rejected. No parser, graph, hash, or storage dependency is necessary.
5. Use only a local expression: rejected. Repeated option collection and deterministic dependency-topological ordering need named local helpers to remain testable and avoid duplicated policy.
6. Minimal new construction: extend the existing plan task parser and persistence boundary; add a small deterministic pending-task ordering helper beside orchestration selection; reuse `collectRecursiveFiles()` and `hashParts()` to sign proposal file paths and contents without persisting proposal bodies.

## Selected Implementation Shape

- Add repeatable `plan task` declarations for `--context <ref[:reason]>`, `--target <path>`, and `--allow-write <glob>`.
- Normalize and merge those declarations through the existing planning contract instead of adding a second state writer.
- Keep explicit `--context-task` precedence. Without it, select the first pending task from a stable dependency-topological ordering; retain deterministic fallback behavior for malformed dependency graphs.
- Replace only the proposals portion of the archive source token with an existing recursive-file/content digest. Keep governance tokening, root locking, retry, and atomic writes unchanged.
- Add a concise Unreleased changelog section rather than modifying release/version machinery.

## References

- `scripts/lib/planning/schema.mjs`
- `scripts/lib/planning/contract.mjs`
- `scripts/lib/lifecycle/orchestrate/context-lifecycle.mjs`
- `scripts/lib/lifecycle/dream/archive-index.mjs`
- `scripts/lib/memo/storage/fs-io.mjs`
- `docs/plans/2026-07-29-context-lifecycle-review-findings-remediation-test-scope.md`
