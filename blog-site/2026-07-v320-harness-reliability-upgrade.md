---
title: "v3.2.0 — Harness Reliability and Skill Lifecycle"
date: 2026-07-01
description: "v3.2.0 tightens harness reliability and skills: auto-abort on repeated failures, a third compression tier, readiness checks, and file-level rollback."
---

# v3.2.0 — Harness Reliability and Skill Lifecycle Upgrade

> 2026-07-01 · Six improvements from a source-level competitor gap analysis, directly raising agent collaboration quality

## Why this release

The previous release (v3.1.0) completed the integration of Hermes Agent as a first-class client. But in real long-run usage we found several reliability gaps:

1. when an agent kept failing, the harness retried forever and burned tokens
2. long sessions let canvas nodes grow until they overflowed
3. the harness had no environment pre-check at start, so an unreachable provider surfaced halfway through a run
4. each iteration's prompt lacked a consistent directive injection
5. the memory system had no cleanup mechanism, so old memos accumulated forever
6. skill workshop rollback restored metadata but not file content

v3.2.0 fixes each of these. Every improvement comes from source-level competitor analysis (gnhf / OpenHarness / TencentDB / the-pair / OpenClaw), not from README inference.

## Improvement list

### A1: consecutiveFailures auto-abort

**Files**: `scripts/lib/harness/solo-runtime/backoff.mjs` + `loop.mjs`

Two new counters:

- `consecutiveFailures` — every non-success outcome counts (blocked/failed/infra-retry/human-gate)
- `consecutiveInfraFailures` — only infra-retry plus runtime-error/tool-error count

When `consecutiveFailures >= 5`, the harness aborts the session automatically and records the `consecutive-failures-abort` reason. A success or noop resets all counters. Backoff stays at 30s×2ⁿ with a 300s cap.

**Competitor reference**: the `consecutiveFailures` counter in gnhf `orchestrator.ts:361-368`. gnhf's uncapped backoff is a bug; our 300s cap is the correct approach.

### A2: Emergency — a third compression tier

**File**: `scripts/lib/offload/mermaid-canvas.mjs`

On top of the existing mild (20 nodes) and aggressive (50 nodes) tiers, an emergency tier is added:

| Tier | Trigger threshold | Recent nodes kept |
|------|-------------------|-------------------|
| mild | 20 | 10 |
| aggressive | 50 | 10 |
| **emergency** | **100** | **5** |

The summary node in emergency mode is tagged `offload:compact-emergency` and keeps fewer recent nodes, so the canvas itself cannot grow large enough to overflow the context.

**Competitor reference**: the emergency tier in TencentDB `l3.ts` (triggers at 0.95, targets 0.6).

### A3: Dry-run readiness pre-check

**Files**: `scripts/lib/harness/solo-runtime/dry-run-readiness.mjs` (new) + `loop.mjs`

Before a harness starts, four dimensions are checked:

| Dimension | What is checked | blocked | warning |
|-----------|-----------------|---------|---------|
| ContextDB | whether `.aios/context-db/index.json` exists and is readable | — | missing or corrupt |
| Git | whether a `.git` directory exists | required in worktree mode | degrades outside worktree mode |
| Provider | whether the provider field is non-empty | — | empty with no AIOS_MODEL_ROUTER |
| Session | whether the session directory exists when resuming | — | starts fresh when missing |

A `blocked` verdict stops the harness from starting, so an environment problem surfaces before an agent is halfway through a run.

**Competitor reference**: `_evaluate_dry_run_readiness()` in OpenHarness `cli.py:333-393`.

### B1: Runtime directive injection

**Files**: `scripts/lib/lifecycle/harness/directive-inject.mjs` (new) + `prompt.mjs`

The `default_mode` from `.aios/config.json` selects the matching `systemPromptAdditions`, which are prepended to every harness iteration prompt. Three built-in presets plus custom `mode_presets` are supported.

```json
{
  "default_mode": "strict-primary"
}
```

After injection the prompt contains:

```
--- Runtime Directive ---
You must follow the superpowers workflow before any implementation action.
Invoke verification-before-completion before claiming a task is done.
--- End Runtime Directive ---
```

This is an original directive system, not a copy of oh-my-openagent's ULTRAWORK keyword detection (that is a runtime hook, not a config field).

### B2: Auto-dream manual CLI

**File**: `scripts/lib/memo/autodream.mjs` (new)

A manual memory-cleanup CLI:

```bash
# preview mode — print the plan only, change nothing
node scripts/lib/memo/autodream.mjs --root /path/to/workspace --mode preview

# apply mode — actually clean expired and duplicate memos
node scripts/lib/memo/autodream.mjs --root /path/to/workspace --mode apply
```

It wraps the existing `runDream` pipeline (taxonomy classification + Jaccard dedupe + TTL expiry). Phase A is manual triggering; Phase B adds scheduled automatic triggering.

### B3: Skill workshop stale detection plus file-level rollback

**File**: `scripts/lib/skills/skill-workshop.mjs`

**Stale detection**: before applying, the filesystem hash of the target `SKILL.md` is compared with the `computedHash` in the lock. A mismatch means the skill was modified externally, so the apply is refused rather than overwriting the user's manual edits.

**File-level rollback**: before applying, the full `SKILL.md` content is stored in `lock.rollbackSnapshot.previousContent`, so a rollback restores the actual file content instead of metadata alone.

```json
{
  "rollbackSnapshot": {
    "previousContent": "# Full original SKILL.md content...",
    "computedHash": "abc123...",
    "path": "skill-sources/my-skill/SKILL.md"
  }
}
```

**Competitor reference**: `SkillProposalRollback.previousContent` in OpenClaw `workshop/types.ts:86-99`.

## Verification

All changes pass 37/37 unit and integration tests:

| Module | Tests | Scenarios covered |
|--------|-------|-------------------|
| A1 backoff.mjs | 13 | success reset / infra-retry / blocked / human-gate / abort threshold / cap |
| A2 mermaid-canvas.mjs | 8 | none/mild/aggressive/emergency threshold boundaries |
| A3 dry-run-readiness.mjs | 10 | blocked/warning/ready / context-db / git / provider / resume |
| B1 directive-inject | 8 | built-in presets / custom presets / prompt injection / null rootDir / corrupt config |
| B2 autodream | 5 | preview / apply / CLI --help / CLI preview execution |
| B3 skill-workshop | 3 | apply / rollback / import verification |

## Competitor analysis reports

These improvements come from the following source-level reports (see `docs/reports/`):

- `2026-07-01-source-level-gap-analysis.md` — source-level gap analysis across six competitors
- `2026-07-01-enhancement-value-assessment.md` — value reassessed and reordered by agent collaboration impact

## Upgrade advice

```bash
# update to the latest version
aios self-update

# verify dry-run readiness
node scripts/lib/harness/solo-runtime/dry-run-readiness.mjs

# configure the runtime directive (optional)
echo '{"default_mode":"strict-primary"}' > .aios/config.json

# try auto-dream manually
node scripts/lib/memo/autodream.mjs --root . --mode preview
```
