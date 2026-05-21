---
name: debug-hub
description: Use when debugging a bug, investigating a regression, or diagnosing a runtime failure and you need runtime evidence before applying a fix
---

# Debug-Hub

Evidence-first debugging: inject zero-dependency log calls, collect via debug-hub HTTP API, analyze through MCP tools, strip all injected code when done.

## Inline Reporter

Inject once at the top of the first file you modify. Node 18+ / modern browsers, zero npm deps:

```js
const __dh=async(m,d)=>{try{await fetch('http://127.0.0.1:39200/api/logs/single',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:crypto.randomUUID(),timestamp:Date.now(),level:'debug',message:m,data:d,sdk:{name:'dh',version:'1',runtime:'node'}})})}catch{}}
```

## Marker Convention

Every injected debug line carries `DH:<sessionId>`. Cleanup strips any line containing this string.

```js
__dh('DH:sess-abc user state', {user});
__dh('DH:sess-abc payment duration', {ms: Date.now()-t0});
```

## MCP Tools

| Tool | What it does |
|------|--------------|
| `debug_hub.start_session { objective }` | Start session, returns `sessionId` |
| `debug_hub.instrument { sessionId, files: [{path, lineCount}] }` | Track files with injected debug code |
| `debug_hub.search_logs { keyword, level, since, traceId }` | Query collected runtime logs |
| `debug_hub.get_stats` | Error counts, level breakdown |
| `debug_hub.cleanup_instruments { sessionId, dryRun?, workspace? }` | Remove all injected debug lines |

Other tools: `list_traces`, `get_trace`, `compact_context`, `health` — see MCP tool list.

## Workflow

1. **Start**: `debug_hub.start_session { objective: "..." }` — note the `sessionId`
2. **Hypothesize**: 3-5 testable hypotheses about root cause
3. **Inject**: write `__dh` helper + marked log calls, one per hypothesis
   - CRG (if codemap installed): `semantic_search_nodes(query="<error-related term>")` → `query_graph(pattern="callees_of", target="<suspected function>")` → `detect_changes(base="HEAD~5")` for structural evidence before injecting
4. **Record**: `debug_hub.instrument { sessionId, files: [{path, lineCount}] }` — use absolute paths
5. **Reproduce**: ask user to run the failing scenario
6. **Analyze**: `debug_hub.search_logs { keyword: "<sessionId>" }` → CONFIRMED/REJECTED/INCONCLUSIVE
7. **Fix**: apply only after logs prove root cause; keep instrumentation
8. **Verify**: user reproduces again, compare before/after
9. **Cleanup**: `dryRun: true` first, then execute `debug_hub.cleanup_instruments { sessionId }`

Cleanup has two modes:
- **Explicit**: uses instrument records → fast, precise
- **Discovery**: `{ sessionId, workspace: "/project/root" }` → greps filesystem, fallback when agent forgot `instrument`

## Guardrails

- Never log secrets, tokens, passwords, API keys, PII, or session cookies
- 2-10 log calls max, each mapped to a hypothesis
- Always `dryRun: true` before executing cleanup
- Never remove instrumentation before post-fix verification succeeds
- Never leave injected code behind; the `__dh` helper and every call site must go
- `try/catch` in `__dh` = target app keeps running if debug-hub is down
