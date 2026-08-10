---
title: Token Intelligence and Compression
description: Keep useful context small with RTK, Caveman, Headroom MCP, ContextDB, and a Ponytail-inspired decision gate.
schema_type: techarticle
date: 2026-05-12
---

# Token Intelligence and Compression

## Quick Answer

Context efficiency is a workflow, not one compression switch. AIOS separates the smallest-correct-change gate, RTK shell-output filtering, Caveman response style, explicit Headroom MCP tools, and pull-based ContextDB recall. Each layer has a different owner and none removes the need for tests, privacy checks, or final verification.

## Do it now

Preview the current installation boundary, then choose the permissions you want:

~~~bash
node scripts/aios.mjs init --all --dry-run
node scripts/aios.mjs init --all --yes-compression-tools --yes-headroom-mcp
aios doctor --native --verbose
~~~

Headroom requires Python 3.10 or later plus uv or pipx. AIOS installs the tested range headroom-ai[all]>=0.31.0,<0.32.0 in an isolated tool environment.

## Five layers

| Layer | Responsibility | Boundary |
| --- | --- | --- |
| Ponytail-inspired gate | Prefer an explanation, configuration change, or smaller edit before new work | workflow guidance, not an installed Ponytail plugin |
| RTK | Filter noisy local shell and tool output before the agent reads it | does not replace scoped commands or preserve every raw log line |
| Caveman | Use concise response style while retaining technical facts | does not compress files or tools |
| Headroom MCP | Explicitly compress and retrieve material that later steps need | not transparent interception of the current model request |
| ContextDB | Recall project context on demand instead of injecting all history | does not make runtime history appear automatically in every prompt |

Planning, code review, privacy, tests, and verification remain separate gates.

## RTK and Caveman

RTK is a local command-output layer. Continue to bound commands so paths and failures remain visible:

~~~bash
rg -n "pattern" path
git diff --stat
sed -n '120,180p' file.ts
tail -n 120 test.log
~~~

Caveman is a local prompt skill for concise status and checkpoints. It must preserve commands, paths, errors, dates, decisions, risks, and missing verification. Use normal response style when the explanation itself is the useful artifact.

## Headroom MCP is explicit

Some Headroom upstream clients have official wrap targets. AIOS v3.6.0 does not claim that aios init automatically wraps every client launch. Installation and MCP registration are separate operations.

For the supported registration path:

| Client | Route | Condition |
| --- | --- | --- |
| Gemini CLI | user-scope official MCP registration | separate MCP consent |
| Grok Build | user-scope official MCP registration | separate MCP consent |
| Hermes Agent | user-scope official MCP registration | real TTY required; otherwise pending-interactive |

The server exposes headroom_compress, headroom_retrieve, and headroom_stats. A model calls them explicitly. Because the model may have already seen the original material, the current turn may use an extra tool call; the main benefit is keeping a compact result for later steps and retrieving the original by reference when needed.

AIOS records owned registrations in ~/.aios/integrations/headroom-mcp.json. External or conflicting entries are reported and not overwritten.

## ContextDB context packs

For a bounded session handoff:

~~~bash
cd mcp-server
npm run contextdb -- context:pack \
  --session <session-id> \
  --limit 80 \
  --token-budget 1200 \
  --token-strategy balanced
~~~

balanced keeps recent work and failure signals; aggressive uses a smaller detail budget; legacy keeps the tail of history for compatibility. ContextDB is documented in [ContextDB](contextdb.md).

## Decision order

Before adding code, dependencies, files, or broad context:

1. Can an explanation or configuration change solve it?
2. Is an existing function, document, or tool enough?
3. Can a focused query replace a full repository, page, or log read?
4. If not, make the smallest tested implementation.

For browser work, start with semantic_snapshot or targeted extract_text, then read more only when needed.

## What this does not promise

- No universal token-saving percentage without local measurements.
- No transparent interception of every model request.
- No guarantee that provider traffic disappears.
- No automatic wrap for every supported client.
- No permission to drop errors, paths, decisions, or verification evidence.
- No replacement for ContextDB search, tests, privacy review, or final verification.

## FAQ

### Should I install all layers?

No. Start with aios init --all and inspect the dry run. Install only the package and client integrations that match your workflow.

### Is Headroom the same as RTK?

No. RTK filters local command output before the agent reads it. Headroom is an explicit MCP tool path for material used in later steps. Caveman only changes response style.

### How do I measure a real Headroom benefit?

Use headroom_stats and confirm both compression events and positive saved-token totals. Upstream benchmark percentages are not local AIOS evidence.

### Can I use ContextDB without these tools?

Yes. ContextDB memory, memo, search, and checkpoints are separate from RTK, Caveman, and Headroom.

## Next steps

- [Quick Start](getting-started.md) - initialize and verify.
- [ContextDB](contextdb.md) - pull-based memory and unified search.
- [Workflow Policy](workflow-policy.md) - choose a smaller, safer route.
- [Headroom + Ponytail workflow article](https://cli.rexai.top/blog/2026-07-headroom-token-intelligence/)
