# AIOS Native Token Compression Plan

## Goal

Implement token-saving behavior for AIOS without installing competitor tools. RTK and Caveman are treated as references only:

- RTK reference idea: staged input filtering, safety-first fallback, metadata about what was compressed.
- Caveman reference idea: output brevity levels with precise fallback when clarity matters.
- AIOS implementation: repo-native ContextDB strategies + AIOS skills for input/output discipline.

## Decision

**Build, do not adopt.**

No RTK package-manager install command, no Caveman package, no shell hook rewriting. AIOS keeps the token-saving surface local, auditable, and client-compatible across Codex and Claude.

## Native Input Compression

### ContextDB packets

Implemented in `mcp-server/src/contextdb/core.ts` and exposed through `context:pack`:

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

- `legacy`: old tail-window behavior for compatibility.
- `balanced`: default when `--token-budget` is set; compress low-signal text before dropping.
- `aggressive`: explicit opt-in for tighter windows.

Safety rules:

- Preserve critical errors, failure terms, file paths, command signals, and latest state.
- Compress repeated lines, stack runs, and large low-signal line sets before dropping events.
- Drop lowest-priority events before truncating protected events.
- Emit telemetry: `strategy`, `rawTokenUsed`, `compressed`, `dropped`, `truncated`.

### Browser and tool input

Implemented as `aios-browser-compress` skill in `skill-sources/` and generated to `.codex/skills/` + `.claude/skills/`.

Rules:

- Prefer `page.semantic_snapshot` before page-wide text.
- Use targeted `page.extract_text` before full-page extraction.
- Treat `page.get_html` and screenshots as last resorts.
- Filter page boilerplate, ads, nav/footer, recommendation rails, duplicate cards.
- Verify compressed input still contains every actionable target before clicking/typing/publishing.

### CLI output discipline

No shell hook is installed. Agents should request scoped output instead:

- `rg -n "pattern" path` over full-file dumps.
- `git diff --stat` before full diffs.
- `sed -n 'start,endp' file` for targeted reads.
- `head`, `tail`, and focused test selectors for large logs.

## Native Output Compression

Implemented as `aios-compress` skill in `skill-sources/` and generated to `.codex/skills/` + `.claude/skills/`.

Levels:

- `tight`: default; concise technical answers, no filler.
- `ultra`: checkpoint/harness updates; one-line evidence and next action.
- `precise`: browser actions, security warnings, irreversible steps, or user confusion.

Rules:

- Keep exact commands, code, error text, file paths, URLs, API names, selectors, dates, and numbers.
- Drop pleasantries, hedging, repeated setup, and generic summaries.
- Never hide blockers, risks, or verification gaps.

## Updated Artifacts

- `skill-sources/aios-compress/SKILL.md`
- `skill-sources/aios-browser-compress/SKILL.md`
- `.codex/skills/aios-compress/SKILL.md`
- `.codex/skills/aios-browser-compress/SKILL.md`
- `.claude/skills/aios-compress/SKILL.md`
- `.claude/skills/aios-browser-compress/SKILL.md`
- `config/skills-sync-manifest.json`
- `config/skills-catalog.json`
- `AGENTS.md`
- `CLAUDE.md`
- `README.md`
- `README-zh.md`
- `mcp-server/README.md`
- Blog posts in English, zh, ja, and ko

## Verification

Required before completion:

1. `node scripts/check-skills-sync.mjs`
2. `npm run test:check-site-sync`
3. `cd mcp-server && npm run test:contextdb`
4. `rg -n "brew[[:space:]]+install[[:space:]]+rtk|rtk[[:space:]]+init|npm[[:space:]]+install[[:space:]].*caveman|caveman-compress|cavecrew" AGENTS.md CLAUDE.md README.md README-zh.md docs-site blog-site skill-sources .codex/skills .claude/skills`

Passing these checks proves the repo documents native implementation and does not instruct users to install competitor token-compression tools.
