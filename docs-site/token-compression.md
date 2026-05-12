---
title: Native Token Compression
description: Input and output token-saving workflow for RexCLI without installing RTK, Caveman, or competitor shell hooks.
---

# Native Token Compression

## Quick Answer

RexCLI saves tokens natively. It references RTK-style input filtering and Caveman-style output brevity, but does **not** install RTK, Caveman, shell hooks, or competitor CLIs.

The workflow has two layers:

1. **Input compression**: reduce ContextDB packets, browser page reads, and command output before they enter the model.
2. **Output compression**: keep agent replies compact while preserving commands, paths, errors, selectors, dates, risks, and verification gaps.

## Input Compression

### ContextDB Packets

Use the built-in `context:pack` strategy engine:

```bash
cd mcp-server
npm run contextdb -- context:pack \
  --session <session_id> \
  --limit 60 \
  --token-budget 1200 \
  --token-strategy balanced \
  --out memory/context-db/exports/<session_id>-context.md
```

Strategies:

| Strategy | When to use | Behavior |
|----------|-------------|----------|
| `legacy` | strict backward compatibility | tail-window behavior |
| `balanced` | default recommendation | compress low-signal text before dropping |
| `aggressive` | tight budget, explicit opt-in | stronger compression and clipping |

Safety rules:

- Preserve critical errors, failure terms, file paths, command signals, and latest state.
- Compress repeated lines, stack traces, and low-signal line sets before dropping events.
- Drop low-priority events before truncating protected events.
- Emit telemetry: `strategy`, `rawTokenUsed`, `compressed`, `dropped`, `truncated`.

### Browser Reads

Use `aios-browser-compress` to prefer compact evidence:

1. `page.semantic_snapshot`
2. targeted `page.extract_text`
3. full `page.extract_text`
4. `page.get_html`
5. screenshot only when visual evidence is needed

Before clicking, typing, publishing, or deleting, re-read narrowly if the compressed view does not prove the target is present.

### CLI Output

Do not install a shell hook. Ask tools for scoped output instead:

```bash
rg -n "pattern" path
 git diff --stat
sed -n '120,180p' file.ts
tail -n 120 test.log
```

## Output Compression

Use `aios-compress` for response style:

| Level | Use case | Behavior |
|-------|----------|----------|
| `tight` | normal coding work | concise technical answer, no filler |
| `ultra` | harness logs, checkpoints | one-line evidence + next action |
| `precise` | browser actions, safety, irreversible actions | full explicit wording |

Controls:

```text
/compress tight
/compress ultra
/compress precise
stop compress
```

## Why Native?

Native compression keeps behavior auditable and consistent across Codex and Claude:

- no competitor dependency;
- no global command rewriting;
- no hidden shell behavior;
- docs, skills, and code live in this repo;
- verification can prove what was compressed or dropped.

## Related Files

- `mcp-server/src/contextdb/core.ts`
- `skill-sources/aios-compress/SKILL.md`
- `skill-sources/aios-browser-compress/SKILL.md`
- `.codex/skills/aios-compress/SKILL.md`
- `.codex/skills/aios-browser-compress/SKILL.md`
- `.claude/skills/aios-compress/SKILL.md`
- `.claude/skills/aios-browser-compress/SKILL.md`
