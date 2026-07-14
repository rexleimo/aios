---
title: "ContextDB Search Upgrade: FTS5/BM25 + Incremental Index Sync"
description: "How ContextDB combines SQLite FTS5, BM25 ranking, exact refs filtering, and observable incremental index sync for reliable agent memory search."
date: 2026-06-18
tags: ["ContextDB", "FTS5", "BM25", "agent memory", "search"]
---

# ContextDB Search Upgrade: FTS5/BM25 + Incremental Index Sync (P1.5)

> **Quick Answer:** ContextDB uses SQLite FTS5 and BM25 for ranked memory search, then applies exact normalized refs filtering and incremental sidecar synchronization. Use `--stats` to inspect index freshness and `--jsonl-out` when a CI or operations pipeline needs machine-readable history.

## Search is a workflow dependency

Agent memory is useful only when the next task can retrieve the right evidence without scanning an unbounded transcript. FTS5 provides the matching index, BM25 ranks the candidates, exact refs filtering removes substring ambiguity, and sync metrics make freshness visible.

ContextDB search moved to SQLite FTS5 + BM25 as the default path (P1), and now adds P1.5 operational upgrades:

- incremental sidecar sync with observability (`index:sync --stats`),
- JSONL run history output (`--jsonl-out`),
- normalized refs table for exact refs filtering (`event_refs`),
- refs-query benchmark and CI gate scripts.

## Why We Extended It

After the FTS5/BM25 migration, we still had two practical gaps:

- operators needed per-run sync metrics to track index freshness and drift;
- refs filtering still needed stronger precision guarantees at scale.

P1.5 addresses both without changing existing workflow contracts.

## What Is Live Now

`contextdb search` and index maintenance now behave as:

1. SQLite FTS5 `MATCH`
2. BM25 ranking (`bm25(...)`) over `kind/text/refs`
3. Lexical fallback when FTS is unavailable
4. Exact refs filtering via normalized `event_refs` (no substring ambiguity)
5. Incremental sidecar refresh via `index:sync` (full rebuild remains available)

## Commands

```bash
cd mcp-server
npm run contextdb -- search --query "auth race" --project demo --refs auth.ts
npm run contextdb -- index:sync --stats
npm run contextdb -- index:sync --stats --jsonl-out memory/context-db/exports/index-sync-stats.jsonl
npm run bench:contextdb:refs:ci
npm run bench:contextdb:refs:gate
```

For local tuning, run:

```bash
npm run bench:contextdb:refs -- --events 2000 --refs-pool 200 --queries 300 --warmup 30 --json-out test-results/contextdb-refs-bench.local.json
```

## Practical Impact

- Better observability for index sync quality and cost (`scanned/upserted`, elapsed time, throttle skips).
- More stable refs filtering under large datasets due to normalized exact matching.
- Enforced latency/hit-rate guardrails in CI for refs queries.
- Safer long-session and cross-CLI handoff behavior without forcing full rebuild each run.

## FAQ

### Does BM25 replace exact refs filtering?

No. BM25 ranks text matches; normalized `event_refs` filtering enforces the exact reference constraint afterward.

### Should every run rebuild the whole index?

No. Use incremental `index:sync` for routine maintenance and a full rebuild when recovery or a deliberate migration requires it.

### Where is the canonical implementation guide?

Read [ContextDB docs](https://cli.rexai.top/contextdb/), [Token Intelligence](https://cli.rexai.top/token-compression/), and [Troubleshooting](https://cli.rexai.top/troubleshooting/).
