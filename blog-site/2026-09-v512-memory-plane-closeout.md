---
title: "v5.12.0 — Memory Closeout: Hygiene, Reports, Import"
date: 2026-09-09
description: "v5.12.0 closes the memory backlog: hygiene, one-command memory reports, imports from Claude/Continue/Roo as governed candidates, and T0-T3 tiered loading."
---

# v5.12.0 — Memory System Closeout: From Storing to Managing — Hygiene, Reports, Migration Import, Tiered Loading

> 2026-09-09 · All 13 memory-optimization backlog items closed: 10 implemented, 3 verified closed (two of which had shipped long ago, with nobody backfilling the status). Full regression 1106 cases / 0 failures.

## Quick answer (30 seconds)

v5.11.0 solved "how memory gets in". v5.12.0 solves "how it is managed once it is in": an oversized pinned block now warns you and offers a cleanup entry point (**archive only, never delete**); one `aios memory report` shows the whole memory surface; `aios import` brings old Claude/Continue/Roo memory in as governed candidates (for users migrating off dead competitors); four AgentView tiers make sub-agent context budgets observable; and Autodream gains an opt-in automatic trigger. The upgrade is non-breaking — pull and use it.

```bash
aios memo hygiene          # read-only checkup: sessions / pinned / event volume + cleanup proposals
aios memory report         # size / invalidation ratio / candidate backlog / adoption rate / pinned budget per space
aios import --format claude --file ~/MEMORY.md --dry-run   # preview before moving old memory in
```

## Why this release

The previous release (v5.11.0) set the write gate: five-element extraction and verified semantics. But writing is only half of a memory system — the other half is **management**: after storing 171 facts, which space is bloating? Is the pinned block over its limit? How many candidates are queued? Has recall quality regressed? Before v5.12 none of those questions had an answer short of reading files by hand.

More interesting were the findings from the verification pass: three backlog "to-dos" were false reports. C2's tool-log offload plus Mermaid canvas (`aios refs` / `aios canvas`) shipped back in May after the design approval, but nobody backfilled the status — the same root cause as Context Lifecycle V1 once being wrongly marked "done then reverted". **That is why we insist on a single-source backlog with status backfilled on completion.**

## Core changes

### 1. memo hygiene: a read-only checkup with zero-delete cleanup

`aios memo hygiene` is read-only by default: it lists every session (staleness verdict plus state), the budget triple of every pinned block, and the line count / bytes / time span of each `l2-events.jsonl`, then proposes cleanup. Acting requires explicit flags: `--archive-stale-sessions` **moves** stale historical sessions into `context-db/archive/` (refuses on target conflicts, reversible); `--rotate-events --max-events N` keeps the newest N events in the log and moves the older lines into an archive file, with `moved + kept == before` and a before/after sha256 reconciliation. Three hard rules: never delete; a live session in a space with the `workspace-memory--` prefix is never archived (its meta may be 41 days stale while still serving `pin show` fallback); and memo storage's `events.jsonl` is the primary recall store and never rotates.

The first run on the real repository caught: a pinned block of 21,424 characters (limit 5000 — four times over) and a default event log of 1.4MB / 2495 lines. The `truncated` semantics of `pin status` proved itself on real data on the very first run.

### 2. aios memory report: the whole memory surface in one command

Per space: event count, character volume, invalidation ratio (share superseded), candidate count, feedback adoption rate, and time span, plus the four-state candidate tally and the pinned budget. Everything is derived read-only, with no overlap with doctor (which manages storage health). `--json` emits a machine-readable version.

### 3. aios import: old memory into the governance queue

`aios import --format claude|continue|roo|conventions --file <path>` supports four sources: Claude `MEMORY.md`, Continue rules, `.roomodes`, and `CONVENTIONS.md`. One line could not be crossed by design: **the importer writes with a runtime identity that has no publish capability, so authority-at-write lands every fact as a `candidate`** — B1's "verified cannot be forged" takes no exception for imports. It is idempotent and re-runnable (existing text is skipped), always traceable via the `#import-<format>` tag, and promotion runs through the existing `memo candidate list/inspect/promote`. Landing page: `docs/import-migration.md`.

### 4. Progressive disclosure plus pinned budget (C3+C4)

`memo search --level summary` costs roughly 100 tokens per line (consecutive repeated tokens are squeezed to two occurrences before the 400-character cut — degenerate looping text is the real risk for a summary layer, and a naive prefix cut does not stop it), and a final `pack: N entries, M chars, level=X` line makes pack size observable. `full` and the default behavior are unchanged. `memo pin status` prints the pinned block's `chars/limit, remaining` triple and flags `truncated` when over limit.

### 5. AgentView's four tiers (H1)

`buildAgentView({ tier })`: T0 = meta + project context; T1 = plus skill summaries filtered by taskType and continuity pointers (without reading the whole package); T2 = plus full text of activated skills; T3 = plus the full continuity package, lineage, and knowledge. Every tier carries a per-section character ledger in `budget.sections`, making cost measurable. The production entry point is `node scripts/ctx-agent.mjs workspace-view --session <id> [--tier T1]` — pull-based reads that respect the "never auto-inject into startup prompts" policy. The default is T3, so existing callers break nothing.

### 6. Autodream Phase B: opt-in automatic triggering (E1)

With `AIOS_AUTODREAM_AUTO=1`, two triggers are active: a session-close hook (wrapped, never blocking close) and an idle threshold (`AIOS_AUTODREAM_IDLE_MINUTES`, 30 by default). A trigger only runs `preview`; proposals go through the existing governed apply. The honest conclusion: the dream engine itself is zero-LLM and deterministic — 0 tokens is the cheapest possible route, and there is nothing left to "route".

### 7. Local embedding pre-ranking (off by default) plus a real-corpus baseline (A4+G1)

`AIOS_MEMO_EMBEDDER=hash-lexical` enables an in-process deterministic embedder. Pre-ranking is **union-only**: it adds nearest neighbors to the token-match set and never removes any, so enabling it cannot lose results — the fifth AB arm's top-1 matched the baseline exactly (76.9% = 76.9%), which is the empirical proof. The real-corpus eval set (`real-corpus.mjs`) derives queries from live corpus at run time and never commits corpus text: this repository's baseline is **top-1 98% / top-5 100%** (171 events / 50 queries). From now on, any retrieval change can be measured by running it before and after.

### 8. Three items verified closed (C1/C2/F2)

C1's budget-degradation projection is verified **shipped** (three tiers full → summary+ref → ref-only, hardConstraint items always kept in full, and wired into the orchestrate production call chain — the note about a "disconnected projector and execution chain" is outdated); C2 is judged **built** (see above); and F2's premise was corrected — `generatedTargets` is **derived** from each client's `agents` capability rather than hardcoded to four, and after real installs the gap shrank to "one unproven directory for workbuddy". F1 also closed a real optimistic-locking gap: when a stale write is rejected, a `conflicts/{ts}.json` audit marker is left behind automatically.

## Upgrade notes

No breaking changes and fully backward compatible (default tiers, `full` output, and existing callers are unchanged). Pull and use it; `workspace-view` and `memo hygiene` are new commands with no migration cost. Gate evidence: full regression 1106 cases / 1100 pass / 0 fail / 6 skip (101 files, including 9 new suites from this batch), zero drift across the five AB arms, and green neighboring suites for workspace/handoff/ctx-agent/dream.

## FAQ

**Q: Will an oversized pinned block be cleared automatically?**
A: Never. Hygiene only archives and rotates; deleting or editing pinned content is always an explicit owner action (`memo pin set`). That is the design of a survey-report-approval queue: the machine supplies evidence, the human decides.

**Q: Does `--level summary` lose facts?**
A: The summary layer is a lossy projection — that is its purpose (~100 tokens per line); use the default `full` when you need complete content. The `pack` footer lets you make an informed choice between the two.

**Q: Why is import not importing directly as verified facts?**
A: Because an importer cannot present credible provenance. By protocol, only three paths reach verified (manual local trust, attested publish identity, governed promotion), and an import taking any of them would be forgery. Facts land as candidates in the governance queue, and the review decision is yours.

**Q: Why is embedding off by default?**
A: hash-lexical is a lexical approximation, and the payoff depends on the corpus; it only adds candidates and never drops results, so it cannot regress, but whether it is worth enabling depends on your data. A real model (such as a local MiniLM) can plug into the same interface.

## Related links

- Project: `https://github.com/rexleimo/aios` (use the repository's actual URL)
- Changelog: `docs-site/changelog.md` / `docs-site/zh/changelog.md`
- Migration guide: `docs/import-migration.md`
- Optimization backlog (single source of truth): `docs/plans/2026-09-08-memo-optimization-backlog.md`
