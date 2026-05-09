# debug-hub Agent MCP Review

Date: 2026-05-09
Route: `single` analysis/design discussion
Skills used: `aios-workflow-router`, `model-router`, `aios-project-system`, `superpowers:brainstorming`, `superpowers:systematic-debugging`

## Objective

Discuss how to turn the current debug-hub from a log viewer into a complete agent debugging MCP service. The triggering concern is: the UI appears to show only logs, not the key data needed for agent debugging.

Image note: the referenced image was not available as an inspectable attachment in the current CLI context, so this review uses the user's description plus repository evidence.

## Evidence From Current State

- `packages/debug-hub/src/mcp.ts` exposes only five tools: `list_traces`, `get_trace`, `search_logs`, `get_stats`, and `clear_logs`.
- `packages/debug-hub/src/storage.ts` writes logs to daily JSONL files, but `writeTrace()` is separate and is not called by HTTP ingest or SDK trace end.
- `packages/debug-hub/src/api.ts` `POST /api/logs/single` and `POST /api/logs` only call `storage.writeLog(...)`; they do not upsert trace summaries.
- `packages/debug-hub/sdk/node/src/index.ts` drops configured `service` and emits `source: {}`; plain logs create a fresh `traceId` and `spanId` every time.
- `packages/debug-hub/sdk/node/src/trace.ts` sends span logs, but `end()` only flips `_ended`; it does not send span lifecycle events, duration, status, or final trace summary.
- `packages/debug-hub/src/ui.html` shows stats, recent errors, logs, and trace list. It does not show payload details, environment, tool calls, hypotheses, reproduction runs, artifacts, or root-cause status.

Reproduction evidence:

```json
{
  "stats": { "totalLogs": 2, "totalTraces": 0, "errorCount": 1 },
  "searchCount": 2,
  "listedTraces": [],
  "getTrace": null
}
```

This was produced by writing two log entries with the same `traceId` and querying via the MCP handler. Logs are searchable, but no trace is listed and `get_trace` returns `null`.

Baseline verification:

- `cd packages/debug-hub && npm run test` passes: 24 tests, 0 failures.
- Current tests verify the implemented log/storage behavior, but they do not cover automatic trace materialization or agent debugging workflows.

## Model Router Discussion

`model-router` selected these roles for a proper upgrade discussion:

| Workstream | Task type | Routed model | Why |
|---|---:|---|---|
| Architecture | `architecture` | Claude Opus 4.7 | Best fit for MCP/service architecture and risk analysis |
| Implementation planning | `planning` | GLM-5.1 | Best fit for staged system planning |
| Code review/risk list | `code-review` | Claude Opus 4.7 | Best fit for reviewing current design gaps |
| Research | `research` | Gemini-3-Pro | Best fit for broader observability/debugging patterns |

Recommended dispatch shape if this becomes an implementation task:

1. Opus: architecture review and API contract hardening.
2. Gemini: observability data model comparison and agent debugging use cases.
3. GLM: phased implementation plan with acceptance gates.
4. Sonnet: tests/QA scenarios for MCP workflows.
5. DeepSeek: focused implementation once contracts are frozen.

## Root Cause

The current debug-hub is implemented as a structured log collector with a trace API placeholder. It stores every incoming event as a log record, but it does not derive, persist, or query the richer debugging state that agents need.

The core architectural gap is that `LogEntry` is doing too much and too little at the same time:

- Too much: every event must be forced into a message-level log shape.
- Too little: it has no first-class fields for session, run, hypothesis, step, artifact, tool call, state snapshot, timing, retry, or fix verification.

## What A Complete Agent Debugging MCP Service Should Record

Minimum viable data model:

| Layer | Key records | Required fields |
|---|---|---|
| Session | `DebugSession` | `sessionId`, objective, workspace, agent, startedAt, status, tags |
| Run/repro | `DebugRun` | `runId`, sessionId, trigger, startedAt, endedAt, result, operator note |
| Hypothesis | `Hypothesis` | `hypothesisId`, statement, status, confidence, evidenceRefs |
| Event stream | `DebugEvent` | eventId, timestamp, level, kind, message, trace/span IDs, payload, source |
| Span lifecycle | `SpanEvent` | start/end timestamps, duration, parent, status, error summary |
| Artifact | `ArtifactRef` | path/url, kind, checksum, redaction status, originating event/run |
| Environment | `EnvironmentSnapshot` | cwd, git head, dirty status, command, runtime versions, dependency versions |
| Tool/command | `ToolCall` | command/tool name, args redacted, exit code, duration, stdout/stderr refs |
| Diagnosis | `RootCause` | confirmed hypothesis, evidence, fix plan, verification runs |

Non-goals for v1: full OpenTelemetry compatibility, remote SaaS storage, distributed tracing backend, or heavy database dependency.

## MCP Tool Surface That Agents Actually Need

Keep the existing tools for backward compatibility, then add agent-native tools:

| Tool | Purpose |
|---|---|
| `debug_hub.start_session` | Create or attach to a debugging session with objective and workspace metadata |
| `debug_hub.record_event` | Ingest generic structured events, not only logs |
| `debug_hub.record_hypothesis` | Register/debug/update hypotheses and status |
| `debug_hub.record_tool_call` | Capture command/MCP call metadata with redacted args and output references |
| `debug_hub.record_artifact` | Attach screenshots, logs, JSON snapshots, trace exports, or files |
| `debug_hub.end_span` / `debug_hub.record_span` | Materialize spans and duration from lifecycle events |
| `debug_hub.get_session` | Return full session timeline with runs, hypotheses, evidence, and artifacts |
| `debug_hub.timeline` | Compact chronological view optimized for agents |
| `debug_hub.explain_failure` | Deterministic summary: likely failing component, error cluster, missing evidence |
| `debug_hub.compact_context` | Token-bounded context pack for handoff/resume |
| `debug_hub.watch` | Query alert rules/pattern matches for long-running sessions |
| `debug_hub.health` | Report ingest freshness, data dir, schema version, dropped/invalid events |

## Recommended Architecture

Use an append-only event store plus derived indexes.

```text
SDK / MCP record_* / HTTP ingest
        |
        v
schema validation + redaction
        |
        v
append-only events/YYYY-MM-DD.jsonl
        |
        +--> derived indexes: sessions, traces, artifacts, stats
        +--> SSE/UI live feed
        +--> MCP query tools and compact context packs
```

Storage layout:

```text
~/.debug-hub/
  events/2026-05-09.jsonl
  sessions/{sessionId}.json
  traces/{traceId}.json
  artifacts/{sessionId}/...
  indexes/latest.json
  schema-version.json
```

Critical design decisions:

- Treat logs as one event kind, not the whole product.
- Derive traces from log/span events automatically so `get_trace(traceId)` works after ordinary ingest.
- Make every record linkable: `sessionId -> runId -> traceId -> spanId -> hypothesisId -> artifactId`.
- Redact at ingest before writing files. Never store secrets by default.
- Keep JSONL files directly readable, but add indexes so MCP queries do not need to rescan everything.
- Return compact, agent-readable JSON by default; UI can render richer detail from the same APIs.

## UI Changes Needed

The UI should become an evidence board, not just a log tail:

1. Session picker and current objective/status.
2. Timeline grouped by run, hypothesis, tool call, span, and error.
3. Trace detail with duration, status, parent-child tree, payload, and error stack.
4. Evidence panel for artifacts and redaction state.
5. Hypothesis board: `pending / confirmed / rejected / inconclusive`.
6. Root-cause summary and verification status.
7. Health panel: ingest endpoint, schema version, invalid lines, dropped events.

## Implementation Phases

1. Schema and validation: add `DebugEvent`, `DebugSession`, `DebugRun`, `Hypothesis`, `ArtifactRef`, and schema versioning.
2. Event store: append-only JSONL with redaction, invalid-event quarantine, and derived indexes.
3. Trace materializer: build/update trace summaries from log/span lifecycle events.
4. MCP v2 tools: session, event, hypothesis, artifact, timeline, compact context, health.
5. SDK upgrades: use `service`, source/callsite, session context, span duration, async flush, and graceful shutdown.
6. UI upgrade: evidence board and trace/session detail views.
7. Tests and docs: red-green coverage for agent workflows and migration notes.

## Acceptance Criteria

- If two events share a `traceId`, `debug_hub.list_traces` includes that trace and `debug_hub.get_trace` returns the span tree.
- A debugging session can show objective, hypotheses, reproduction runs, command/tool evidence, artifacts, root cause, and verification state.
- `debug_hub.compact_context` can produce a token-bounded handoff pack without raw noisy logs.
- `debug_hub.health` exposes ingest freshness, schema version, invalid records, and storage paths.
- UI shows payload details and evidence, not only message text.
- Tests prove that logs alone are no longer the only durable record type.

## Open Question Before Implementation

Should the next implementation target be a focused v0.2 trace/session upgrade, or a larger v1 evidence-board redesign?

Recommendation: ship v0.2 first. Add session IDs, event kind, automatic trace materialization, health, and compact timeline. Then build the richer evidence board on top.
