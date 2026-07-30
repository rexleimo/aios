# Context Lifecycle V1 Source-Ref Physical Containment Requirements

> Work item: `context-lifecycle-v1-source-ref-physical-containment`
> Status: implemented; external symlink targets are rejected before source reads and covered by focused regression tests
> Trigger: direct source-ref containment audit

## Problem

ExecutionContext source refs are lexically checked against `rootDir`, but the existing readers follow filesystem symlinks. A plan requirement such as `docs/policy.md` can therefore pass lexical containment while resolving to a file outside the workspace. `inspectSource()` hashes that external content and `assembleExecutionContext()` can inject its raw text into runtime context.

## Acceptance criteria

1. `buildExecutionContextPacket()` treats a source ref whose existing physical target is outside the resolved workspace root as `invalid_ref`, with no source hash/content accepted.
2. `assembleExecutionContext()` treats the same source ref as unavailable and never places external source text in `assembly.contextText`, packet, or receipt.
3. Both a direct file symlink and an in-workspace directory symlink/junction leading to an external source are rejected on supported platforms.
4. Existing regular in-workspace sources remain readable, hashable, and deliverable through the assembler.
5. Existing lexical external absolute paths and `../` traversal remain `invalid_ref`; contained missing paths remain `missing_source`.
6. The physical check is performed before normal source reading. It uses canonical root/target comparison rather than a path-string prefix.
7. Source ref normalization, CJK paths, custom state root behavior, packet decision schema, and direct caller-evidence fail-closed behavior remain intact.

## Non-goals

- Providing a complete hostile-local-filesystem race-free descriptor/no-follow protocol across all operating systems. A symlink swap after check and before open remains explicitly outside this stable-path slice.
- Changing plan artifact containment, state-root containment, MCP workspace selection, expected-hash persistence path, or Git reconciliation.
- Blocking all symlinks; in-workspace symlinks resolving inside the physical workspace remain valid.
- Implementing an external broker, signature attestation, hard admission enforcement, or Dream GC.

## First slice

1. Add a real external source-file symlink fixture under a temporary workspace plan.
2. Show current direct packet accepts and assembler injects external sentinel text.
3. Add a physical resolver shared by `inspectSource()` and `readAssemblySource()`; reject target realpaths outside root realpath.
4. Verify direct packet, assembled runtime context, existing safe source fixtures, source traversal, CJK/custom-root, real CLI/MCP orchestrate integration.
