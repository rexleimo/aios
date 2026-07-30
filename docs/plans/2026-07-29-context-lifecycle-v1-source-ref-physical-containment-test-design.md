# Context Lifecycle V1 Source-Ref Physical Containment Test Design

> Work item: `context-lifecycle-v1-source-ref-physical-containment`
> Status: test scope designed; implementation has not started
> Requirements: `docs/plans/2026-07-29-context-lifecycle-v1-source-ref-physical-containment-requirements.md`

## Test scope contract

### User goal

A workspace plan may refer to files inside its selected workspace, but it must not use a workspace-local symlink or junction to read and inject an external file as execution context.

### In scope

- Public `buildExecutionContextPacket()` source inspection and `assembleExecutionContext()` runtime delivery.
- Real source file symlink and directory symlink/junction fixtures targeting a separate temporary directory.
- Stable physical `realpath()` containment and direct/assembler invalid-ref observations.
- In-workspace regular source and in-workspace symlink behavior.

### Out of scope

- Hostile local filesystem symlink-swap races after resolution.
- State-root symlink containment, plan artifact containment, packet-path persistence, MCP workspace selection, or broker authority.
- Live dispatch and hard admission enforcement.

### Allowed test seams

1. Public ContextDB APIs `buildExecutionContextPacket()` and `assembleExecutionContext()`.
2. `buildStructuredPlanState()` with a real temporary workspace plan.
3. Actual Node `symlink()` and actual file content; no mocked file reader, source hash, or delivery text.

### Completion criteria

- An external file symlink inside `docs/` is `invalid_ref` through both APIs; the external sentinel never appears in `assembly.contextText`.
- A directory symlink/junction inside the workspace leading external is also invalid.
- An in-workspace symlink to an in-workspace source remains deliverable.
- Existing regular source, traversal-invalid, missing-source, CJK, custom state-root and real orchestrate/MCP paths remain green.
- If a platform cannot create symlinks, the test explicitly skips with the platform error rather than returning a false pass.

## Acceptance-to-test mapping

| Behavior | Public observation | Fixture / assertion |
| --- | --- | --- |
| File symlink escape rejected | Direct packet and assembled receipt | `docs/external.md` links to external sentinel; both output `invalid_ref`, no external hash or context text. |
| Directory symlink escape rejected | Direct packet and assembled receipt | `docs/external/` links to external directory containing sentinel; `docs/external/policy.md` is invalid. |
| Internal symlink still works | Assembled context | `docs/internal.md` links to a real file under the same root; assembled text includes its internal sentinel. |
| Existing ordinary behavior | Existing public tests | Run direct packet, S2, orchestrate, MCP, and production correction tests. |

## First vertical RED/GREEN slice

1. Add an external-file symlink test to `scripts/tests/execution-context-packet.test.mjs`.
2. Assert the current direct packet has an external source hash and assembled text includes the sentinel; current code should fail the desired invalid-ref assertions.
3. Add physical containment shared by direct inspection and assembly read.
4. Repeat the same public test after implementation; then add directory/internal symlink cases.

## Verification commands

```text
node --test scripts/tests/execution-context-packet.test.mjs
node --test scripts/tests/context-lifecycle-s2.test.mjs scripts/tests/context-lifecycle-orchestrate-integration.test.mjs scripts/tests/context-lifecycle-mcp-integration.test.mjs scripts/tests/context-lifecycle-production-correction.test.mjs
```
