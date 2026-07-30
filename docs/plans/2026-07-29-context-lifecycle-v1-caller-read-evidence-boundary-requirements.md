# Context Lifecycle V1 Caller Read-Evidence Boundary Requirements

> Work item: `context-lifecycle-v1-caller-read-evidence-boundary`
> Status: implemented; direct caller assertions are fail-closed and assembler delivery is covered by focused regression tests
> Authority: Context Lifecycle production-correction trust-boundary audit

## Problem and boundary

`buildExecutionContextPacket()` accepts `readRefs` and `readEvidenceSource` from its caller. Existing behavior converts a matching caller string into `decision.read: true`, `required_context_read`, and receipt evidence metadata. A caller can therefore self-attest that it read/delivered required context.

The production orchestration path already uses `assembleExecutionContext()`, which reads the source itself, computes matching source hashes, selects a representation, and constructs `orchestrator_assembler` process-local delivery observation. The direct packet builder cannot independently prove delivery and must fail closed.

## Acceptance criteria

1. Legacy callers may still pass `readRefs` and `readEvidenceSource` without throwing, but these values cannot mark any packet/receipt decision as read or included.
2. For every existing source requirement built through `buildExecutionContextPacket()`, the direct receipt records no trusted delivery evidence: `read: false`, an excluded representation, and an unread reason appropriate to required/optional policy.
3. A caller that claims any source, all sources, or a value such as `broker_verified` in `readEvidenceSource` cannot make `evaluateExecutionContextPreflight()` report required context as read or ready.
4. Direct packet construction still performs source containment and hashes readable in-workspace sources; it does not copy source text into packet or receipt sidecars.
5. `assembleExecutionContext()` remains the sole current path that produces `evidenceSource: 'orchestrator_assembler'`, delivery representations, and real runtime context text.
6. Existing orchestrate/MCP lifecycle integration remains observed/dry-run and preserves its real assembler evidence behavior.
7. The receipt states the evidence boundary truthfully: no caller assertion is accepted as delivery proof, and no broker is claimed.

## Explicit non-goals

- Implementing a trusted broker, signature verification, OS credential boundary, remote attestation, or enabling governance mutations.
- Blocking legacy callers merely for supplying deprecated arguments; their assertions are ignored rather than honored.
- Changing source ref containment, packet storage path, source hash computation, context budget selection, dispatch modes, or live admission behavior.
- Treating an in-process assembler observation as an external hostile-agent security boundary.

## First independently verifiable slice

1. Retain the packet-builder signature but remove caller `readRefs` / `readEvidenceSource` from decision-making.
2. Add a real fixture where a caller claims a required source and `broker_verified`; assert its packet receipt remains unread/excluded and preflight warns.
3. Keep the existing assembler integration test as the contrasting positive path: it still produces `orchestrator_assembler` evidence and observed lifecycle metadata.
4. Run direct packet, S2/production-correction, orchestrate, and MCP tests to prove no fallback reintroduces caller self-attestation.
