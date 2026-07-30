# Context Lifecycle V1 Plan-Path Containment Requirements

> Work item: `context-lifecycle-v1-plan-path-containment`
> Status: implemented; lexical and physical workspace containment are covered by focused regression tests
> Authority: Context Lifecycle production-correction security audit

## Problem and trust boundary

`--plan <path>` reaches `runOrchestrate()` through CLI and MCP-compatible option parsing. Auto preflight calls `evaluatePlanEvidence()`, which currently accepts a caller-supplied absolute path or `../` traversal and passes it directly to `fs.readFile()`. This lets an external file become valid plan evidence outside the selected workspace.

A plan artifact used as orchestration evidence is workspace-owned input. A caller may provide either a workspace-relative spelling or an equivalent absolute in-workspace spelling, but neither spelling may cross the resolved workspace boundary.

## Terms

- **Workspace root**: the resolved `rootDir` passed to orchestration/preflight.
- **Lexically contained path**: a path whose resolved location is inside the resolved workspace root according to `path.relative()` containment, not a string prefix test.
- **Physically contained existing path**: a lexically contained path whose `realpath()` also remains beneath the workspace root `realpath()`. This rejects in-root symlinks to external files.
- **Invalid plan path**: an external absolute path, traversal that resolves outside the workspace, or an existing symlink-resolved path outside the workspace.

## Acceptance criteria

1. A workspace-relative plan path and its equivalent absolute in-workspace path produce identical `evaluatePlanEvidence()` readiness verdicts and normalized relative evidence path.
2. An absolute path outside the workspace fails closed with `verdict: 'blocked'` and `blockedReasons: ['invalid_plan_path']`; it must not be accepted as plan evidence even if its markdown has valid headings.
3. A `../` traversal that resolves outside the workspace fails closed with the same invalid-path result.
4. An apparently in-workspace plan path whose existing symlink target resolves outside the workspace fails closed with the same invalid-path result.
5. A missing path that is lexically contained remains a normal `missing_plan_artifact` result, preserving current user guidance.
6. The containment decision happens before any caller-controlled external plan file is read. The result and next action must not copy the external file content.
7. Inline markdown evaluation without a plan path remains unchanged. Inline markdown with an explicit invalid external plan path is blocked rather than emitting external-path evidence.
8. `runOrchestrate()` auto preflight and its CLI/MCP `--plan` route receive this behavior through the existing `evaluatePlanEvidence()` call; dispatch policy, plan schema parsing, authority, and execution mode remain unchanged.

## Explicit non-goals

- Implementing a hostile-local-filesystem race-free descriptor API, OS sandbox, broker, or credential boundary.
- Restricting valid in-workspace plan locations to `docs/plans/`; containment is the security boundary, not a naming convention.
- Changing inline markdown heading validation, plan schema requirements, ownership checks, dispatch behavior, or live admission policy.
- Changing execution-context source-ref containment, which already owns its own resolver.
- Rewriting external CLI workspace selection or all unrelated file APIs in this slice.

## First independently verifiable slice

1. Replace the lexical-only plan-path normalization with a workspace containment resolver used by `evaluatePlanEvidence()`.
2. Normalize equivalent in-root absolute and relative paths to a workspace-relative display/evidence ref.
3. Reject outside/traversal paths before read; resolve and reject existing symlink targets outside the physical workspace root.
4. Add focused public preflight tests using a valid in-root plan, a valid external plan, traversal, and an external symlink target.
5. Exercise `runOrchestrate()` with auto preflight so the public option route is covered without invoking live dispatch.
