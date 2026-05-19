---
title: "Native Token Compression: Why Harness CLI Does Not Install RTK or Caveman"
date: 2026-05-12
tags: ["AIOS", "token compression", "ContextDB", "skills", "Harness CLI"]
description: "Harness CLI now implements token savings natively: ContextDB input compression, compact browser reads, scoped CLI output, and output compression skills without competitor dependencies."
---

# Native Token Compression: Why Harness CLI Does Not Install RTK or Caveman

Token cost is not only a billing problem. It is a reliability problem.

Long AI coding sessions fail when the model sees too much noise: full logs, repeated stack traces, page boilerplate, and verbose status updates. The obvious shortcut is to install a token-saving competitor tool. We chose not to do that.

Harness CLI references the useful ideas from RTK-style input filtering and Caveman-style output brevity, then implements the workflow inside AIOS.

## What Changed

Harness CLI now treats token reduction as two native layers:

1. **Input compression**: reduce command, browser, and ContextDB payloads before they enter the model.
2. **Output compression**: make the agent answer compactly without losing exact commands, paths, errors, or risk warnings.

No RTK install. No Caveman install. No global shell hook that rewrites user commands.

## Native Input Compression

ContextDB already has a self-contained token strategy engine:

```bash
cd mcp-server
npm run contextdb -- context:pack \
  --session <session_id> \
  --limit 60 \
  --token-budget 1200 \
  --token-strategy balanced \
  --out memory/context-db/exports/<session_id>-context.md
```

The strategy is conservative by default:

- compress repeated lines and stack-run noise;
- preserve critical errors, file paths, commands, and latest state;
- drop low-priority events before truncating protected events;
- emit telemetry for `strategy`, `rawTokenUsed`, `compressed`, `dropped`, and `truncated`.

For browser work, the new `aios-browser-compress` skill pushes agents toward compact reads:

1. `page.semantic_snapshot`
2. targeted `page.extract_text`
3. full `page.extract_text`
4. `page.get_html`
5. screenshot only when visual evidence is needed

For CLI work, Harness CLI prefers scoped output over full dumps: `rg`, `git diff --stat`, `sed -n`, `head`, `tail`, and focused test selectors.

## Native Output Compression

The new `aios-compress` skill defines three response levels:

| Level | Use case | Behavior |
|-------|----------|----------|
| `tight` | normal coding work | short technical answers, no filler |
| `ultra` | harness logs and checkpoints | one-line evidence + next action |
| `precise` | browser operations, safety, irreversible steps | full explicit wording |

The key rule: compression must never hide risk. Errors, commands, paths, selectors, dates, and verification gaps stay exact.

## Why Not Install Competitor Tools?

Installing another token tool looks fast, but it creates hidden coupling:

- command behavior can change outside Harness CLI's control;
- cross-client behavior differs between Codex, Claude, Gemini, and opencode;
- docs become harder to verify;
- users inherit another dependency, update path, and failure mode.

Native implementation keeps the behavior auditable. The code, skills, and docs live in the repo.

## How To Use It

For ContextDB packets:

```bash
cd mcp-server
npm run contextdb -- context:pack --session <session_id> --token-budget 1200 --token-strategy balanced
```

For agent output:

```text
/compress tight
/compress ultra
/compress precise
stop compress
```

For browser automation, prefer semantic snapshots and targeted extraction before full page text.

## Bottom Line

Harness CLI token savings are now native: input compression in ContextDB and browser workflows, output compression in AIOS skills, and no competitor installation step.

That keeps long-running agent work cheaper, quieter, and easier to verify.
