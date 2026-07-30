# Context Lifecycle V1 Independent Validation Evidence Gate

> Status: validation gate implemented; no independently signed real-task evidence has been submitted.
> Scope: evidence verification only. This command never enables enforcement.

## Purpose

`context-lifecycle-v1-evidence-gate.mjs` verifies a detached-signature evidence bundle supplied by an independent reviewer. It closes the mechanical part of the final validation gate without treating synthetic fixtures as real-project evidence.

A passing bundle produces `REVIEW_REQUIRED`, not an automatic pilot or enforcement decision.

## Required inputs

1. An independently authored oracle JSON:

```json
{
  "schemaVersion": 1,
  "kind": "context-lifecycle-v1-independent-oracle",
  "cases": [
    {
      "id": "fresh-required-context",
      "wouldBlock": false,
      "reasons": []
    },
    {
      "id": "undeclared-mutation",
      "wouldBlock": true,
      "reasons": ["undeclared_target"]
    }
  ]
}
```

2. A JSONL observation file. Each real-task row must reference an oracle case and durable evidence:

```json
{
  "observationId": "task-001",
  "taskKind": "real_task",
  "oracleCaseId": "undeclared-mutation",
  "wouldBlock": true,
  "reasons": ["undeclared_target"],
  "evidenceRefs": ["contextdb:reconciliation/session/receipt.json"]
}
```

3. Detached base64 Ed25519 signatures for both files, made with the independent review key, plus the reviewer public-key PEM.

## Verification command

```powershell
node scripts/benchmarks/context-lifecycle-v1-evidence-gate.mjs `
  --oracle path/to/oracle.json `
  --oracle-signature path/to/oracle.sig `
  --observations path/to/observations.jsonl `
  --observations-signature path/to/observations.sig `
  --public-key path/to/reviewer-public.pem `
  --min-real-samples 20 `
  --json-out temp/context-lifecycle-v1/evidence/result.json `
  --markdown-out temp/context-lifecycle-v1/evidence/result.md
```

## Decision semantics

- Invalid signatures, unknown oracle cases, mismatched outcomes, missing evidence refs, or insufficient real-task samples return `NO-GO`.
- A complete verified bundle returns `REVIEW_REQUIRED`.
- The tool cannot activate selective or default enforcement.
- A human release review must evaluate false positives, authority boundaries, and rollback readiness separately.

## Related validation

Use the immutable differential runner before submitting evidence. It rejects dirty evaluator worktrees and mutable subject refs:

```powershell
node scripts/benchmarks/context-lifecycle-v1-differential.mjs `
  --baseline bfb9ce239339715bea330a6e2e2719ead5a16784 `
  --post <full-committed-candidate-sha> `
  --output-dir temp/context-lifecycle-v1/differential
```

`context-lifecycle-v1-compare.mjs` remains available for local development comparisons, but a dirty worktree result is not immutable release evidence.
