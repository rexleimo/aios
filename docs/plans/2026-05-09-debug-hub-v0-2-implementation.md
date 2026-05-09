# debug-hub v0.2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or follow this plan sequentially with TDD. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Upgrade debug-hub from a log-only collector into a minimal agent debugging MCP service with automatic trace materialization, sessions, timeline, health, and compact context.

**Architecture:** Keep the current local-first JSON/JSONL storage and MCP server. Add small focused record types (`DebugSession`, `DebugEvent`, health/timeline/compact outputs) and derive trace/session indexes during ingest so existing logs remain readable while agents can query higher-level debugging state.

**Tech Stack:** TypeScript ESM, Node.js 22, `node:test`, MCP SDK, JSONL file storage.

---

## Files

- Modify: `packages/debug-hub/src/types.ts` — add v0.2 debug/session/event query types.
- Modify: `packages/debug-hub/src/storage.ts` — materialize traces from logs, persist sessions/events, expose timeline/health/compact context.
- Modify: `packages/debug-hub/src/api.ts` — validate log ingest through storage and expose `/api/health` plus event ingest if needed.
- Modify: `packages/debug-hub/src/mcp.ts` — add agent-native MCP tools while preserving existing five tools.
- Modify: `packages/debug-hub/tests/storage.test.ts` — red/green tests for trace materialization and storage queries.
- Modify: `packages/debug-hub/tests/mcp.test.ts` — red/green tests for new MCP tools.
- Modify: `packages/debug-hub/tests/api.test.ts` — health endpoint regression.
- Modify: `packages/debug-hub/README.md` — document v0.2 MCP tools and key data captured.

## Task 1: Automatic Trace Materialization

- [x] Add a failing storage test: writing two `LogEntry` records with one `traceId` must make `listTraces()` return one trace and `getTrace(traceId)` return a root with child span.
- [x] Run `cd packages/debug-hub && npm run test -- tests/storage.test.ts` and confirm the new test fails because `totalTraces` stays zero or `getTrace()` is null.
- [x] Implement trace upsert in `Storage.writeLog()` by rebuilding the target trace from recent logs with the same `traceId`.
- [x] Re-run the storage test and then all debug-hub tests.

## Task 2: Sessions And Generic Events

- [x] Add failing MCP tests for `debug_hub.start_session`, `debug_hub.record_event`, and `debug_hub.get_session`.
- [x] Implement `DebugSession` and `DebugEvent` types plus storage methods for session JSON and append-only events JSONL.
- [x] Implement MCP handlers that persist sessions/events and link events to sessions by `sessionId`.
- [x] Re-run MCP tests.

## Task 3: Timeline, Health, Compact Context

- [x] Add failing MCP tests for `debug_hub.timeline`, `debug_hub.health`, and `debug_hub.compact_context`.
- [x] Add storage methods that return chronological timeline records and token-bounded compact JSON summaries.
- [x] Add health metadata: data dir, schema version, log count, trace count, session count, invalid/dropped count, latest log timestamp.
- [x] Add `GET /api/health` regression coverage.
- [x] Re-run MCP/API tests.

## Task 4: Docs And Final Verification

- [x] Update README with the new data model and MCP tools.
- [x] Run `cd packages/debug-hub && npm run typecheck && npm run test && npm run build`.
- [x] Run `npm run test:scripts` only if root workflow files changed; otherwise document that root workflow behavior was not changed.
- [x] Audit requirements against `docs/plans/2026-05-09-debug-hub-agent-mcp-review.md` acceptance criteria.
