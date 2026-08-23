---
title: "v5.8.0: AIOS Learns Safely — Session Memory, Evidence Gates, and Governed Self-Evolution"
description: "AIOS v5.8.0 closes the broken memo trigger chain and adds a governed self-evolution pipeline with deterministic acceptance checks, canary promotion, rollback, and version update notices."
date: 2026-08-22
tags: ["AIOS", "release", "self-evolution", "memory", "governance", "memo", "dream"]
---

# v5.8.0: AIOS Learns Safely — Session Memory, Evidence Gates, and Governed Self-Evolution

AIOS v5.8.0 is the release where the workflow layer starts learning from completed work without being allowed to rewrite production behavior on its own.

## The problem: memo existed, but the trigger chain was open

AIOS already had `aios memo`, session-close candidates, and `dream` consolidation. But normal session exit only saved a checkpoint. It did not call `autoMemoSessionClose()`, so candidates were rarely generated unless someone manually ran `aios session close`. Dream was also a manual, rule-driven consolidation command rather than a daemon.

That made the system look like it had self-evolution while the actual path was disconnected.

## The new closed loop

v5.8.0 connects the lifecycle explicitly:

```text
session end
  -> reviewable candidate
  -> trigger/status policy
  -> dream proposal
  -> deterministic verdict
  -> approval and canary
  -> telemetry
  -> rollback or stable promotion
```

Every session-close candidate remains a candidate. It does not silently enter active shared memory.

## What changed

### 1. Session close now produces an auditable candidate

Normal completion, abort, timeout, and exception paths use one idempotent finalizer. Repeated exit hooks produce the same `candidateId` and do not publish directly to active recall.

```bash
aios evolution status
```

The status command explains the pending candidate count, last consolidation, cooldown, and why no run was triggered.

### 2. Consolidation is explicit, not hidden

The trigger policy supports:

- `manual`: an explicit evolution run;
- `threshold`: default five pending candidates;
- `schedule`: default 24-hour cooldown after a successful run.

The default is conservative: no LLM call, no automatic promotion, and preview/proposal-first behavior.

### 3. Acceptance is a contract, not a model opinion

Candidates are checked against deterministic dimensions:

- schema and provenance;
- safety and prompt-injection patterns;
- scope and trusted-core boundaries;
- base hash freshness;
- replay of the original task;
- holdout tasks;
- regression and cost metrics;
- memory conflicts and supersession.

The result is a JSON verdict whose decision can be reproduced later.

### 4. Promotion is versioned and reversible

Evolution assets move through:

```text
candidate -> reviewing -> validated -> proposed -> approved
          -> canary -> active -> stable
          -> rejected | degraded | rolled_back
```

Every transition writes an audit event. Canary versions retain the previous stable version and can roll back when functionality, safety, quality, or cost degrades. Trusted components such as the evaluator, promotion broker, and rollback controller are protected from candidate edits.

### 5. AIOS can explain compatible updates

The release also adds a version notice layer. It distinguishes patch, minor, and major updates; stable/beta/dev channels; dirty worktrees; active tasks; security updates; and failed network checks. Notices are deduplicated, and a security update can override dismissal.

"Update allowed" means the policy permits entering the update flow. It never means an agent may install an update without an explicit user command or approval.

## Upgrade

```bash
aios update --check
aios evolution status
```

No migration is required for existing memo data. Existing candidates remain reviewable; the new lifecycle finalizer starts generating candidates on future session exits.

## Verification

The release includes deterministic fixtures for failed trajectories, replay and holdout tasks, malicious content, conflicting and superseding memories, stale base hashes, and trusted-core mutations. The release test set covers the complete candidate-to-rollback lifecycle.

AIOS does not learn by silently changing itself. It learns by collecting evidence, proposing a bounded change, validating it, and keeping a reversible versioned record of what happened.
