# Context Lifecycle V1 Plan-Path Containment Test Design

> Work item: `context-lifecycle-v1-plan-path-containment`
> Status: test scope designed; implementation has not started
> Requirements: `docs/plans/2026-07-29-context-lifecycle-v1-plan-path-containment-requirements.md`

## Test scope contract

### User goal

A caller-selected plan artifact may contribute orchestration readiness evidence only when it belongs to the selected workspace. Equivalent in-root relative and absolute spellings are allowed; paths escaping the workspace must be rejected before their markdown can be used.

### In scope

- Public `evaluatePlanEvidence()` behavior used by `runOrchestrate()` auto preflight.
- Lexical path normalization with `path.resolve()` / `path.relative()` containment.
- Existing-file `realpath()` containment to reject symlink escapes.
- Exact readiness verdict, blocked reason, evidence path normalization, and no external-plan acceptance.

### Out of scope

- Live dispatch, external workspace selection, plan-heading policy, ownership policy, or broker authority.
- Arbitrary hostile-filesystem TOCTOU mitigation beyond the existing-file realpath check.
- Rewriting all file readers outside this plan-evidence entrypoint.

### Allowed test seams

1. `evaluatePlanEvidence()` is the public readiness policy seam; it reads actual temporary plan files through the same code used by orchestration auto preflight.
2. Real temporary workspace and external directories, actual files, and an actual symlink are used. No filesystem/read policy is mocked.
3. Existing `runOrchestrate()` source call site is covered by the policy seam; separate live dispatch is intentionally excluded.

### Completion criteria

- Relative and equivalent in-root absolute path both return `ready` and evidence path `docs/plans/ready.md`.
- Valid-looking external markdown and traversal return `blocked` / `invalid_plan_path`, never `ready`.
- An in-root symlink whose resolved target is external returns `blocked` / `invalid_plan_path`; if the platform forbids symlink creation, the test reports that environment limitation explicitly rather than treating it as a pass.
- Missing contained paths retain `missing_plan_artifact`.
- Inline markdown without a plan path still returns its existing heading verdict.

## Acceptance-to-test mapping

| Acceptance behavior | Public observation | Real fixture and assertion |
| --- | --- | --- |
| In-root relative/absolute equivalence | `evaluatePlanEvidence()` verdict and evidence | Write one valid workspace plan; call with relative and absolute forms; both are ready and evidence uses the normalized relative ref. |
| Outside absolute plan fails closed | `evaluatePlanEvidence()` result | Write valid headings in a separate external temp directory; result is blocked with only `invalid_plan_path`. |
| Traversal fails closed | `evaluatePlanEvidence()` result | Use `../external/valid.md` resolving outside the workspace; result is blocked with `invalid_plan_path`. |
| Existing symlink escape fails closed | `evaluatePlanEvidence()` result | Create workspace `docs/plans/link.md` that targets the external valid plan; result is blocked with `invalid_plan_path`. |
| Missing contained plan behavior preserved | `evaluatePlanEvidence()` result | Existing missing-path test remains green with `missing_plan_artifact`. |
| Inline markdown behavior preserved | `evaluatePlanEvidence()` result | Existing inline markdown heading test remains green when no external plan path is supplied. |

## First vertical RED/GREEN slice

The first test extension is `scripts/tests/preflight-contracts.test.mjs`.

1. Create one valid in-root plan and one valid external plan in real temporary directories.
2. Assert the external absolute path is `blocked` with `invalid_plan_path`; current code returns `ready`, creating an honest RED.
3. Add the in-root absolute normalization assertion to prevent a security fix from rejecting safe equivalent paths.
4. Implement only plan-path containment in `evaluatePlanEvidence()` until these assertions turn green.
5. Add traversal and symlink coverage before final verification.

## Verification commands

```text
node --test scripts/tests/preflight-contracts.test.mjs
node --test scripts/tests/context-lifecycle-production-correction.test.mjs scripts/tests/context-lifecycle-mcp-integration.test.mjs
```
