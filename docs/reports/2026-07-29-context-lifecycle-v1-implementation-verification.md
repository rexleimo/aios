# Context Lifecycle V1 Implementation Verification

Date: 2026-07-29

## Decision

**S0-S2 observe/shadow implementation is complete. S3 selective enforcement, opt-in pilot, and default hard enforcement remain NO-GO.**

The supported `aios orchestrate` / `aios_orchestrate` paths are reachable and verified through controlled integration fixtures. This does not mean every default plan produces non-empty context: scaffold tasks without persisted targets or context requirements may remain `not_applicable` or deliver zero units until a planner or human declares and confirms the relevant context. The producer path is wired, but it is not an out-of-the-box intelligence guarantee, and controlled fixtures do not become real-project evidence.

## Completed implementation boundaries

| Boundary | Current behavior | Primary verification |
|---|---|---|
| Runtime context delivery | `assembleExecutionContext()` renders the exact delivery text; packet and receipt persist `deliveryUnits` and `deliveryDigest`. | `execution-context-packet.test.mjs`, `runtime-context-delivery.test.mjs` |
| Dispatch lifecycle | Orchestrate snapshots workspace metadata before and after dispatch, records actual changed files, finalizes reconciliation after success or throw, then rethrows dispatch failures. | `context-lifecycle-orchestrate-integration.test.mjs` |
| CLI/MCP reachability | Supported CLI and MCP lifecycle paths produce packet/receipt metadata while direct/read-only paths remain lightweight. | `context-lifecycle-orchestrate-integration.test.mjs`, `context-lifecycle-mcp-integration.test.mjs` |
| Trust boundary | Direct caller `readRefs` are fail-closed; only the controlled assembler can establish read evidence. CLI candidate/Dream paths do not treat `AIOS_RUNTIME_*` as authority. | `context-lifecycle-production-correction.test.mjs`, `memo-provenance.test.mjs` |
| Path/state safety | Relative/absolute paths, Windows case semantics, CJK, symlink containment, and custom state root behavior are covered. | Context Lifecycle production-correction and S2 tests |
| Memo storage | Append uses the canonical lock root including injected environment; destructive Dream GC remains disabled without a concurrent trusted authority protocol. | `memo-storage-locking.test.mjs`, `dream-governance.test.mjs` |
| Untrusted control text | Tool/web/handoff-like text cannot change authority, capability, claim status, or publish decision; governance receipts do not copy it. | `context-lifecycle-untrusted-control-text.test.mjs` |

## Controlled validation evidence

- Post-change S2 profile: **12/12** expected scenarios pass.
- 20-task / 200-receipt controlled engineering smoke: **PASS**.
  - constructed false positive: 0
  - constructed false negative: 0
  - absolute-path equivalence: PASS
  - delivered-budget accounting: PASS
  - p95 latency remained below the controlled 50 ms smoke threshold
- Local same-runner comparison remains a development diagnostic only. It is not an immutable release comparison.
- `context-lifecycle-v1-differential.mjs` now performs immutable same-runner comparison only from a clean evaluator checkout and two distinct committed subject refs.
- `context-lifecycle-v1-evidence-gate.mjs` verifies detached Ed25519 oracle and observation signatures, requires evidence refs, and can only return `REVIEW_REQUIRED`.

## Named controlled verification

- Expected-hash persistence path: verified by `scripts/tests/execution-context-packet.test.mjs`, including caller-selected path rejection, legacy metadata fail-closed behavior, and custom state-root resolution.
- Scale benchmark assembler seam: verified by `scripts/benchmarks/context-lifecycle-v1-scale.mjs` and `scripts/tests/context-lifecycle-benchmark.test.mjs`; positive cases use the assembler while direct unread cases remain fail-closed.
- CLI/MCP reachability: verified through controlled integration fixtures only.
- Production precision/recall, real-project false-positive rate, trusted authority, and enforcement readiness remain unproven.

## Non-negotiable evidence boundary

The controlled results above do **not** demonstrate any of the following:

- real-project validation;
- production precision or recall;
- real-task false-positive rate;
- a trusted human/OS/IPC authority broker;
- permission to turn on pilot or default enforcement.

A valid release/pilot review still requires all of:

1. a clean committed candidate and an immutable differential run;
2. a separately signed oracle and signed observations;
3. at least 20 independently reviewed real planned tasks and 200 mutation/receipt samples;
4. human review of false positives and unexplained block reasons;
5. a trusted broker or other non-self-asserted authority boundary before shared-canonical mutation or destructive GC is enabled.

## Commands

```powershell
npm run test:scripts
npm run benchmark:context-lifecycle-v1-scale
node scripts/benchmarks/context-lifecycle-v1.mjs --profile s2 --json-out temp/context-lifecycle-v1/s2.json --markdown-out temp/context-lifecycle-v1/s2.md
node scripts/benchmarks/context-lifecycle-v1-differential.mjs --baseline <immutable-baseline-sha> --post <immutable-candidate-sha> --output-dir temp/context-lifecycle-v1/differential
```

The differential command intentionally fails against a dirty worktree. That is expected and prevents development-only observations from being mislabeled as release evidence.
