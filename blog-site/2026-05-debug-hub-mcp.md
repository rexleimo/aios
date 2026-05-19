---
title: "debug-hub: When Your Agent Can Debug Itself, You Sleep Better"
description: "What if your coding agent could read its own error logs and fix problems without waking you up? That's debug-hub."
date: 2026-05-06
tags: ["debug-hub", "MCP", "Coding Agent", "observability"]
---

# debug-hub: When Your Agent Can Debug Itself, You Sleep Better

Picture this: it's 3 AM, and your overnight agent run just hit an error. In the old world, you'd wake up to a broken state and spend the morning digging through logs.

**What if the agent could debug itself?**

That's exactly what debug-hub does. It gives your agent tools to search its own logs, trace execution paths, and figure out what went wrong — all on its own, without you.

## The Problem: Agents Are Blind

When an agent hits an error, it can't look at its own logs. It can't `grep` terminal output or correlate timestamps. The debugging workflow is always:

1. **You** notice something is wrong
2. **You** scroll through logs
3. **You** find the error and paste it back to the agent
4. The agent finally understands

This works for quick sessions. But for overnight runs, multi-agent tasks, or long harness jobs — there's no human watching. The agent just... fails silently.

## The Solution: Tools For Agents

debug-hub exposes log tools through MCP — the same protocol your agent already uses for other tools. Your agent gets new capabilities:

| Tool | What the agent can do |
|---|---|
| `search_logs` | "Show me all errors from the last 5 minutes" |
| `get_trace` | "Show me the full execution path for this error" |
| `get_stats` | "How many errors have there been?" |
| `start_session` | "I'm going to debug something, track it" |
| `cleanup_instruments` | "Remove my debug code, the bug is fixed" |

### A Self-Debugging Example

An agent that's stuck in a retry loop can now:

1. Search its own recent error logs
2. Find the exact error messages and their trace IDs
3. Pull the full execution trace to see which step failed
4. Diagnose the problem and fix it
5. All without waking you up

## What's Inside

debug-hub is a single Node.js process with everything built in:

- **HTTP API** — receives logs from your code
- **MCP Server** — exposes tools for agents
- **Web UI** — dark-themed dashboard for humans
- **File Storage** — simple JSONL files under `~/.debug-hub/`

No database. No Docker. No connection strings. Just `npm install` and go.

### Three SDKs

Use the same API in any runtime:

**Node.js:**
```typescript
import { DebugHub } from '@debug-hub/node';
const debug = new DebugHub({ service: 'my-agent' });
debug.info('Tool call started', { tool: 'search' });
```

**Browser:**
```typescript
import { DebugHub } from '@debug-hub/browser';
const debug = new DebugHub({ service: 'web-ui' });
debug.warn('API latency spike', { endpoint: '/api/chat' });
```

**Go:**
```go
debug := debughub.New(debughub.Config{Service: "harness-runner"})
trace := debug.StartTrace("iteration-42")
```

## Get Started

```bash
cd packages/debug-hub
npm install
npm run dev
# → HTTP API + Web UI: http://localhost:39200
# → MCP: stdio mode
```

Send a test log:
```bash
curl -X POST http://localhost:39200/api/logs/single \
  -H 'Content-Type: application/json' \
  -d '{"id":"1","timestamp":1714500000000,"level":"info","message":"hello","source":{},"sdk":{"name":"test","version":"0.3.0","runtime":"node"}}'
```

Open http://localhost:39200 to see it in the dashboard.

## The Bigger Picture

debug-hub is part of Harness CLI's **observability layer**. It works alongside:

- [ContextDB](https://cli.rexai.top/contextdb/) — for memory across sessions
- [Solo Harness](https://cli.rexai.top/solo-harness/) — for overnight runs that can self-diagnose
- [Agent Team](https://cli.rexai.top/team-ops/) — for multi-agent tracing

When your agents can debug themselves, you can trust them to run longer, handle more complex tasks, and recover from errors — all without your constant attention.

---

*debug-hub is at v0.3.0 and is part of [Harness CLI](https://cli.rexai.top). Try it and give your agents the power of self-reflection.*
