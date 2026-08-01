---
title: "v5.4.0: Workflow Iteration v2.1 — Activation Safety, Typed Evidence Contracts, and Full Skill Audit"
description: "Harness CLI v5.4.0 ships atomic activation state, a concurrent-token lock, typed Wayfinder/Planning artifact schemas, strict evidence-ref validation, and a full S1–S5 Skill audit. Here is what changed and why it matters."
date: 2026-08-01
tags: ["Harness CLI", "rex-harness", "workflow", "evidence contracts", "activation store", "skill audit", "developer productivity"]
---

# v5.4.0: Workflow Iteration v2.1 — Activation Safety, Typed Evidence Contracts, and Full Skill Audit

> **Quick Answer:** v5.4.0 closes three classes of silent failure in the rex workflow runtime — split activation state after a crash, duplicate token advancement under concurrency, and placeholder evidence refs that passed schema validation. It also ships the first complete typed schemas for Wayfinder and Planning artifacts, and completes the S1–S5 Skill source and eval audit across all 13 canonical Skills.

## The problem this release solves

When a coding agent is interrupted mid-workflow — by a crash, a network drop, or a concurrent invocation — two things can go wrong silently:

1. The Workflow file and the Activation projection file can end up out of sync. The token rotated but the projection still shows the old command. The agent resumes on stale state.
2. Two concurrent calls can both receive the same Command token and both succeed, causing duplicate evidence acceptance without any lock violation.

Neither of these produced an explicit error before this release. They just silently advanced (or silently stalled) the workflow.

A third class of failure was structural: evidence `ref` fields on Wayfinder and Planning artifacts accepted any string, including `"TODO: fill in later"` and bare filenames without a protocol prefix. The validation gate passed; the agent moved on; the reviewer got unusable references.

## What changed

### Atomic activation store (write-ahead transaction)

The activation store now writes a pending transaction file before touching any live state:

```
.aios/workflow-activations/transactions/<activationId>.json.pending
```

If the process crashes between the Workflow write and the Activation projection write, the next startup detects the pending file and rolls the transaction forward. If both writes completed, the pending file is deleted as the final step. There is no roll-back: the design is roll-forward-only, so the store is always in a consistent forward state after recovery.

On read, the store now also validates that the projection's recorded Command token matches the Workflow's current token. If they diverge — the sign of a crash between the two writes in the old code — the read fails closed with `stale-activation-projection` instead of returning a mismatched state.

### Single-token serialization lock

A per-store file lock now prevents two concurrent callers from advancing the same Command token simultaneously. The second caller receives `AIOS_REX_STORE_BUSY` and must retry. The lock is held only for the duration of the atomic write, so ordinary sequential usage is unaffected.

### Typed Wayfinder and Planning artifact schemas

Two new domain modules ship with this release:

- `src/domain/wayfinder-artifact.mjs` — validates Navigation Map, Decision Graph, Decision Ticket, and Next Slice. A `partial` or `blocked` Wayfinder artifact cannot claim a Decision Ticket or declare a next slice.
- `src/domain/planning-artifact.mjs` — validates Delivery Ticket, Frontier (ready and blocked are mutually exclusive, no duplicates), Parallel Groups (a work item cannot appear in multiple groups), Convergence Gate, and Runtime Artifact Contract.

Both schemas feed through `normalizeEvidenceRefs()`, which rejects any `evidenceRef` that lacks a protocol prefix (`artifact:`, `receipt:`, `diff:`, `command:`, etc.) or matches a known placeholder pattern (`TODO`, `TBD`, `placeholder`, etc.).

### Trusted backup recovery

Client projection's `recoverInterruptedArtifacts` now re-validates the backup marker digest against the recorded `projection-history.json` before promoting the backup. A backup junction that was not created by a managed projection — or whose marker was tampered with — is rejected with `interrupted-backup-untrusted` instead of silently restored.

### Plan evidence mirror failure visibility

`syncEvidenceToMatchingPlan` previously threw when the plan file was missing or mismatched. This meant a committed Rex state could appear as an overall failure in the caller. It now returns `planEvidence.status = 'failed'` with a structured error code, so the caller can distinguish "Rex accepted the evidence" from "the plan mirror failed."

### S1–S5 Skill audit

All 13 canonical Skill sources completed the S1–S5 batched SkillOpt eval:

| Batch | Skills |
|---|---|
| S1 | `rex-requirements`, `rex-implement` |
| S2 | `rex-debug`, `rex-tdd` |
| S3 | `rex-wayfinder`, `rex-planning` |
| S4 | `rex-code-review` |
| S5 | `rex-design`, `rex-strict-tdd`, `rex-refactor-hardening`, `rex-minimal-construction`, `rex-test-design`, `rex-workflow` |

Each batch produced updated `evals/evals.json` and updated canonical `SKILL.md`. Current digests are appended to `projection-history.json`; prior digests are retained for rollback.

## Upgrade notes

- `rex-harness` bumps from `0.4.3` to `0.5.0`. If you use `recoverInterruptedArtifacts` directly, update call sites: the second argument is now a `plan` object `{ skillId, sourceDigest, historicalDigests }` instead of a bare `skillId` string.
- Existing `.aios/workflow-activations/` state is read-only compatible. No migration is required. Incomplete transactions from the old code will be detected and rolled forward on first access.
- Evidence refs already stored in workflow state are not re-validated retroactively. New evidence submissions through the updated runtime will enforce the protocol-prefix rule going forward.

## Verification

```bash
npm run test:rex
# rex 191/191  contract 38/38  integration 52/52  workflow-policy 74/74

npm --prefix rex-harness run doctor
# status: ready, 13 capabilities, 6 clients, 0 missing instructions
```

All test counts are fresh (run after the final edit), not carried forward from a previous session.
