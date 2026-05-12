---
name: aios-compress
description: Use when AIOS responses should minimize output tokens without external compressors; applies tight/ultra/precise styles while preserving browser-operation and safety precision.
---

# AIOS Output Compression

Compress the answer, not the truth. AIOS implements this style natively; do not install Caveman or any competitor package. Caveman is prior art only.

## Default

- Default level: `tight`.
- Switch command: `/compress tight|ultra|precise|off`.
- User overrides win: `precise mode`, `stop compress`, or any request for more detail disables compression for that response.

## Levels

| Level | Output shape | Use for |
|-------|--------------|---------|
| `tight` | Short sentences, fragments ok, no filler | Normal analysis, code work, status updates |
| `ultra` | One-liners, `A -> B` notation, only evidence/next action | Harness logs, heartbeat updates, checkpoint summaries |
| `precise` | Full explicit wording, no compression | Browser actions, irreversible operations, safety/security warnings |

## Rules

- Drop filler: pleasantries, hedging, repeated setup, generic summaries.
- Keep exact: commands, code, errors, file paths, URLs, API names, selectors, dates, numbers.
- Prefer: `changed X in path. verified with command. next Y.`
- Do not compress quoted user text, legal/security warnings, or step sequences where order matters.

## Auto-Precise Guard

Use `precise` for:

- Browser operation instructions (`page.click`, `page.type`, `page.goto`, selector choice).
- Auth, payment, deletion, publishing, external network, or irreversible actions.
- User confusion, contradiction, or repeated clarification.
- Any response where missing a qualifier could change behavior.

Return to `tight` after the precise segment unless the user requested otherwise.

## Boundaries

- This is a prompt-level output discipline, not a shell hook.
- It never rewrites commands or hides risk.
- It must surface blockers, uncertainty, and verification gaps even in `ultra` mode.
