# Context Lifecycle V1 Caller Read-Evidence Boundary Test Design

> Work item: `context-lifecycle-v1-caller-read-evidence-boundary`
> Status: test scope designed; implementation has not started
> Requirements: `docs/plans/2026-07-29-context-lifecycle-v1-caller-read-evidence-boundary-requirements.md`

## Test scope contract

### User goal

A direct caller cannot convert a string such as `readRefs: ['policy.md']` into trusted context-delivery evidence. Only the production orchestrator assembler may report process-local delivery after reading and selecting the actual source representation.

### In scope

- Direct `buildExecutionContextPacket()` receipt/decision behavior for caller-supplied `readRefs` and `readEvidenceSource`.
- `evaluateExecutionContextPreflight()` behavior when the direct packet has required unread context.
- Preservation of source hash, source containment, no raw source-text sidecar behavior, and legacy argument compatibility.
- Existing real `assembleExecutionContext()` / `runOrchestrate()` observed path as the contrasting positive evidence producer.

### Out of scope

- Broker implementation, remote signature verification, agent identity, Candidate/Dream mutation authorization, or hard admission enforcement.
- Removing legacy function parameters or changing structured plan/context source schema.
- Replacing the process-local assembler trust statement with a stronger security claim.

### Allowed test seams

1. Public ContextDB APIs: `buildExecutionContextPacket()`, `evaluateExecutionContextPreflight()`, and existing `assembleExecutionContext()` behavior through `runOrchestrate()` integration.
2. Real temporary workspace files and structured plan fixtures; no source/read evidence policy is mocked.
3. The direct API caller passes `readRefs` and a forged `readEvidenceSource: 'broker_verified'` to prove that strings cannot elevate evidence.

### Completion criteria

- Direct packet construction with any claimed refs produces no `read: true` or included decision and states `readEvidenceSource: 'none'` / `brokerVerified: false`.
- Direct preflight reports `required_context_unread` even if the caller claims all required refs and a broker-like source name.
- Direct packet still stores normalized refs/hashes only, without source text.
- Existing assembler/orchestrate integration retains `orchestrator_assembler` evidence and dry-run observed lifecycle status.
- Existing stale-hash and mutation declaration checks remain visible in S2 preflight results alongside the new unread reason.

## Acceptance-to-test mapping

| Acceptance behavior | Public observation | Real fixture and assertion |
| --- | --- | --- |
| Caller read refs are ignored | Direct packet receipt | Pass a required ref and `broker_verified`; assert all decisions are excluded/unread and no included list is created. |
| Caller cannot make preflight ready | Direct preflight result | Build a direct packet with claimed required ref, then run preflight; assert `required_context_unread` remains. |
| Source inspection remains non-leaking | Serialized packet/receipt | Keep existing source hash and no-secret-text assertions under the direct fixture. |
| Stale detection remains additive | S2 preflight fixture | Modify a source after direct packet construction; assert both unread and stale reasons are reported. |
| Assembler remains sole delivery producer | Existing orchestrate integration | Assert actual orchestrate receipt still reports `orchestrator_assembler` and observed dry-run lifecycle. |

## First vertical RED/GREEN slice

The first test extension is `scripts/tests/execution-context-packet.test.mjs`.

1. Use its existing real source fixture and call `buildExecutionContextPacket()` with a required `readRefs` entry plus `readEvidenceSource: 'broker_verified'`.
2. Assert caller input cannot create an included/read decision and the evidence boundary is `none` / not broker verified.
3. Run the existing file against the current implementation. It should fail because direct caller assertion currently produces `required_context_read` and `read: true`.
4. Implement only direct builder fail-closed evidence handling until this test turns green.
5. Update S2 expected preflight reasons and verify orchestrate assembler coverage stays green.

## Verification commands

```text
node --test scripts/tests/execution-context-packet.test.mjs
node --test scripts/tests/context-lifecycle-s2.test.mjs scripts/tests/context-lifecycle-orchestrate-integration.test.mjs scripts/tests/context-lifecycle-production-correction.test.mjs
```
