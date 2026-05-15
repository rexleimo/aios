---
title: Native Token Compression
description: Save tokens without installing any extra tools — built right into RexCLI.
---

# Native Token Compression

**AI models have a limit on how much text they can process at once.** Token compression keeps your context small enough to fit, while preserving the important stuff.

RexCLI does this natively — no extra tools to install, no shell hooks, no dependencies.

## The Problem

Every time your agent starts a new session, ContextDB loads the history of what happened before. But if your project has months of history, that's a LOT of text — often more than the model can handle.

Token compression solves this by:

1. **Keeping** recent work, errors, decisions, and file paths
2. **Compressing** repeated logs, verbose output, and stack traces
3. **Dropping** low-priority content only when necessary

## Two Layers

### Input Compression (what goes TO the model)

Reduce the context pack before your agent reads it:

```bash
npm run contextdb -- context:pack \
  --session <session-id> \
  --limit 80 \
  --token-budget 1200 \
  --token-strategy balanced
```

| Strategy | When to use | What it does |
|---|---|---|
| `balanced` | Default | Compresses low-signal text, keeps errors and recent work |
| `aggressive` | Very small budgets | Maximum compression, minimal detail |
| `legacy` | Old behavior | Only keeps the tail end of history |

**What gets preserved** (never dropped):

- Error messages and failure signals
- File paths and command outputs
- Recent state and decisions

**What gets compressed** (shortened, not always dropped):

- Repeated log lines
- Stack traces
- Verbose tool output

### Output Compression (what comes FROM the model)

Control how verbose your agent's responses are:

| Level | Use for | Behavior |
|---|---|---|
| `tight` | Normal coding | Concise answer, no filler |
| `ultra` | Harness logs, checkpoints | One-line evidence + next action |
| `precise` | Browser actions, safety-critical | Full explicit wording |

```text
/compress tight     # Normal work
/compress ultra     # Overnight runs
/compress precise   # When precision matters
stop compress       # Back to normal
```

## Browser Reads

When your agent reads web pages, RexCLI automatically prefers the most compact format:

1. Semantic snapshot (smallest)
2. Targeted text extraction
3. Full text extraction
4. Full HTML (largest)
5. Screenshot (only when visual evidence is needed)

This means less token waste when agents browse the web.

## Why Native?

RexCLI's compression is built in — not a bolted-on tool:

- No extra packages to install
- No shell hooks or command rewriting
- Everything stays auditable — you can see exactly what was compressed or dropped
- Works consistently across Codex, Claude, Gemini, and OpenCode

## Where To Go Next

- [ContextDB](contextdb.md) — how memory works with compression
- [Solo Harness](solo-harness.md) — long runs benefit most from compression
- [Architecture](architecture.md) — technical details of the compression pipeline
