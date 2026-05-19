---
title: "Token Compression: Fit Months of Agent Memory Into a Single Prompt"
description: "ContextDB now compresses your agent's history to fit within a token budget — keeping what matters, dropping what doesn't."
date: 2026-05-12
tags: ["ContextDB", "token compression", "AI memory", "Harness CLI"]
---

# Token Compression: Fit Months of Agent Memory Into a Single Prompt

Here's the tension with AI agent memory: you want your agent to remember everything, but AI models have a strict limit on how much text they can process at once. The more history you have, the less fits.

**Token compression solves this.** It keeps the important stuff, compresses the rest, and fits your history into a budget you control.

## The Problem In One Picture

```
Your agent's full history: 50,000 tokens
    ↓
AI model's context window: 4,000 tokens
    ↓
What happens without compression: only the last 4,000 tokens survive
    (Everything older is gone — including important decisions and errors)
```

The old approach was a **tail window** — just keep the most recent events and drop everything else. Predictable, but wasteful: it might drop a critical error from yesterday while keeping a verbose log from 5 minutes ago.

## How Compression Works

The new approach is smarter:

1. **Keep** the important stuff: errors, decisions, file paths, recent state
2. **Compress** the noisy stuff: repeated logs, stack traces, verbose output
3. **Drop** low-priority content only if compression wasn't enough

```bash
npm run contextdb -- context:pack \
  --session <id> \
  --limit 80 \
  --token-budget 1200 \
  --token-strategy balanced
```

### The Result

Instead of this:
```
❌ Old approach: Keep last 20 events → miss the critical bug from event #5
```

You get this:
```
✅ New approach: Keep all 80 events, compress the noisy ones → the bug is still there
```

## Three Strategies

| Strategy | When to use | What it does |
|---|---|---|
| `balanced` | Default | Compresses noise, keeps signal. Best for daily use. |
| `aggressive` | Very small budgets | Maximum compression for tight constraints. |
| `legacy` | Compatibility | Old tail-window behavior. Use only if you need it. |

**Start with `balanced`.** It's the right choice for 90% of cases.

## What Gets Protected

These things are **never dropped**:

- Error messages and failure signals
- File paths and command outputs
- Recent state and decisions
- Next-action signals

These things are **compressed first** (shortened, not always dropped):

- Repeated log lines
- Stack traces
- Verbose tool output

The packet includes telemetry so you can see exactly what happened: how many tokens were raw, how many were compressed, how many events were dropped.

## When You Need It Most

Token compression shines in these scenarios:

- **Long-running projects** with months of history
- **Multiple agents** sharing the same ContextDB
- **Overnight harness runs** that generate lots of logs
- **Switching between agents** where you need compact context

It pairs especially well with lazy load startup — your agent starts instantly with a tiny summary, then loads a compressed full history only when needed.

## Try It

```bash
npm run contextdb -- context:pack \
  --session <your-session-id> \
  --token-budget 1200 \
  --token-strategy balanced \
  --out memory/context-db/exports/compressed.md
```

Then check the output — you'll see a summary of how many tokens were saved.

---

*Token compression is built into [ContextDB](https://cli.rexai.top/contextdb/), part of [Harness CLI](https://cli.rexai.top). No extra tools needed.*
