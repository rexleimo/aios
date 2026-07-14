---
title: "Token Intelligence Architecture: ContextDB, RTK, Caveman, and Headroom MCP"
description: "A current guide to Harness CLI token intelligence: pull-based ContextDB context, local RTK/Caveman compression, and explicit Headroom MCP retrieval."
date: 2026-05-12
tags: ["AIOS", "token intelligence", "ContextDB", "RTK", "Caveman", "Headroom MCP"]
---

# Token Intelligence Architecture: ContextDB, RTK, Caveman, and Headroom MCP

> **Quick Answer:** Harness CLI treats token efficiency as a layered concern. ContextDB stores and retrieves bounded project context, RTK and Caveman provide local command/output compression, and Headroom MCP offers explicit compress/retrieve tools when a later step needs them. These layers are complementary; Headroom is not transparent interception of every model request.

Long agent sessions become unreliable when logs, browser boilerplate, and repeated history crowd out the decision the model actually needs. The fix is not one universal compression switch. It is a clear contract for what gets stored, what gets compressed, and what gets retrieved.

## How the layers fit

| Layer | Responsibility | Important boundary |
| --- | --- | --- |
| ContextDB | Store project facts, events, refs, and handoffs; retrieve selected context | Pull-based; it does not require injecting the entire history every time |
| RTK | Compress supported CLI output locally | A local command-output filter, not a replacement for verification |
| Caveman | Keep agent-facing output concise through prompt/skill guidance | Brevity must preserve errors, paths, commands, and risk warnings |
| Headroom MCP | Explicitly compress and retrieve material for a later step | Tool calls are on demand, not transparent interception |

`aios init --all` is the recommended setup path. Optional compression-tool or Headroom MCP installation flags represent separate decisions and should be authorized separately. Check the resulting state with:

```bash
aios doctor --native --verbose
```

## ContextDB is the memory boundary

ContextDB should preserve stable project facts, selected task state, and useful handoffs. A context pack can be bounded by a token budget and a strategy:

```bash
cd mcp-server
npm run contextdb -- context:pack \
  --session <session_id> \
  --token-budget 1200 \
  --token-strategy balanced \
  --out memory/context-db/exports/<session_id>-context.md
```

Use search and refs filtering to pull the evidence needed for the next decision. Do not treat a registry marker as proof that an entire historical transcript is automatically injected.

## Compression must preserve evidence

A useful compressed result keeps the information an operator needs to act:

- exact commands and file paths;
- the latest state and relevant timestamps;
- errors, warnings, and verification gaps;
- references that allow the original material to be retrieved.

The objective is smaller context with the same decision quality, not a smaller log at any cost. A build result still proves only the build; it does not prove an external provider, browser session, or human approval.

## FAQ

### Do I need every layer?

No. Start with the ContextDB workflow. Add local command/output compression when logs are noisy, and use Headroom MCP when an explicit compress/retrieve tool call improves a later step.

### Does Headroom automatically rewrite the current model request?

No. It is an explicit MCP tool surface. The caller chooses what to compress or retrieve and can keep the original reference.

### Where are the current commands documented?

Use [Token Intelligence](https://cli.rexai.top/token-compression/), [ContextDB](https://cli.rexai.top/contextdb/), and [Troubleshooting](https://cli.rexai.top/troubleshooting/). The [Workflow Policy](https://cli.rexai.top/workflow-policy/) explains how token work fits into edit and verification gates.
