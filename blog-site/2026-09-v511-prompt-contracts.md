---
title: "v5.11.0 — Prompt Contracts: Models Report Their Own State"
date: 2026-09-06
description: "v5.11.0 is prompt-only: seven contracts covering memory extraction, stall reporting, tiered compression, model pinning, node recipes. Zero runtime change."
---

# v5.11.0 — Prompt Contract Hardening: Let Models Report Their Own State

> 2026-09-06 · A prompt-only release: seven skill contracts upgraded, zero runtime change, no breaking changes.

## Quick answer (30 seconds)

v5.11.0 ships the half of a 16-repo competitor audit that was only worth copying as prompts: how memory should be written, how verification should be judged, how stalls should be reported, how context should be compressed, and how cheap models should be pinned — all expressed as structured contracts the model self-reports, while the runtime validates objective facts only (exit codes, schema, hashes) and never guesses semantics. Upgrading takes two lines: pull, then re-run the install sync so the `rex-planning` projection refreshes.

```bash
git pull
node scripts/sync-skills.mjs
# the rex-planning projection refreshes with aios setup / aios update
```

## Why this release

The v5.10.0 audit left seven improvements that the prompt layer alone could absorb (the non-runtime half of the competitor report's P0–P2). Verdicts were one-shot, memory writes had no gate, long loops stalled silently, compression had no tiers, dispatch had no budget — these were not missing code, they were missing contracts. This release adds them one by one, each aligned with the north star: the model self-reports semantics, code validates objective facts. Four forbidden moves stay untouched: auto-selecting models by content, extracting entities with regexes, using an LLM to detect infinite loops, and matching message semantics with rules.

## Core changes

### 1. memo: five-element extraction contract

Stored entries carry five elements: `fact` / `entities[]` / an absolute date / `evidence_ref` / `confidence`, one fact per entry. Small talk, half-finished work, and evidence-free assertions stay out; corrections use exact replacement plus `--supersedes`, and the log is append-only. The harness stores but does not validate — schema validation is code work, scheduled for the next batch.

### 2. verification-loop: a scoring loop

`VALIDATION` gains `score` / `complete` / `missing[]`, and rejected `missing` items feed straight into the next round; the retry budget defaults to 3, after which work stops and hands off; a parse failure (a missing or empty section) goes through a structured re-ask template that fixes format only, never skips checks. The four section header names are unchanged, so the machine validator needed zero edits.

### 3. aios-long-running-harness: stall self-reporting

Each round's observations self-report `progress_made` plus `blocked_reason`; three consecutive false rounds switch approach or escalate; two identical calls in a row mark the round as no-progress; `planning_interval` defaults to 5, re-issuing the frontier and a checkpoint every five steps. LLM loop detection and keyword matching are explicitly not used.

### 4. contextdb-autopilot: tiered compression

Four tiers — `FULL` / `PARTIAL` / `SUMMARY` / `EXCLUDED` — applied oldest-first with the tier declared by the model; the most recent two rounds never drop below `PARTIAL`; summaries stay agent-visible and evidence-addressable while the raw transcript stays in the session; every compression writes an audit event (range + tier + refs).

### 5. model-router: pin weak models and declare budgets

Summaries, titles, and memory extraction pin to DeepSeek-V4; docs and routine reviews pin to Sonnet; fallbacks only downgrade, never upgrade. Only four hard constraints may break the pin: browser work, long context, security, and production recovery. Dispatch declares `budget` / `quota_scope` / `downgrade|fail-fast`; with no declaration there is no circuit breaker.

### 6. aios-work-dispatch: node recipe header

Parallel nodes first declare seven things — `tools` allowlist, `model` plus `task-type`, `max_turns`, `budget`, `output_schema`, `retry`, and `subflow`; no header means no dispatch. Downstream work triggers on schema artifacts instead of reading prose handoffs.

### 7. rex-planning: progress ledger (submodule)

Each round emits `{is_complete, in_progress[], facts[], assignment}`, reporting empty facts honestly; over-limit or failed nodes return partial output plus a continuation handle; `parallelGroups` never overlap and never fake dependencies. `projection-history.json` is pinned to LF, with new digests appended and old digests kept for rollback.

## Upgrade notes

No breaking changes and zero runtime edits. After pulling: `node scripts/sync-skills.mjs`, verified across 8 projections; the `rex-planning` projection refreshes with the next `aios setup` / `aios update`. Gate evidence: the submodule's skills/contract/scenarios/architecture suites are green with a zero-error doctor, and the parent `agents-source-tree` check is 10/10.

## FAQ

**Q: Do prompt changes produce measurable gains?**
A: Honest answer: we did not measure them. What is verified is "no regression" (the green suites above). The expected gain comes from the mapping in the 16-repo competitor audit, which is reasoning rather than evidence; a definitive answer needs a SkillOpt eval or an online comparison.

**Q: Why did the P0 runtime work (hook gates, CheckpointSaver, the four-piece memory stack on the code side) miss this release?**
A: Behavior-changing work needs its own plan, provider contract review, and skill certification; per the 2026-09-06 review it lands in 5.12 and later. This release only takes the prompt half.

**Q: My local `rex-planning` projection still looks old?**
A: That is expected. The parent repo only bumps the submodule pointer, and client projections refresh through the install lifecycle — run `aios setup` or `aios update` once.

**Q: Which files changed?**
A: Five `skill-sources/*/SKILL.md` files plus the CHANGELOG mirror and this post in the parent repo; `rex-planning/SKILL.md`, `projection-history.json`, and one `.gitattributes` line in the submodule. Generated directories are all rebuild artifacts and stay out of the tree.

## Related links

- Project: `https://github.com/rexleimo/aios` (use the repository's actual URL)
- Changelog: `docs-site/changelog.md` / `docs-site/zh/changelog.md`
- Competitor audit source: `docs/reports/2026-09-05-competitor-orchestration-analysis.md`
