---
title: Case - Cross-CLI Handoff
description: Reproducible flow for Claude analysis, Codex implementation, and Gemini review with shared ContextDB.
---

# Case: Cross-CLI Handoff

[Star on GitHub](https://github.com/rexleimo/rex-cli?utm_source=cli_rexai_top&utm_medium=docs&utm_campaign=english_growth&utm_content=case_handoff_hero_star){ .md-button .md-button--primary data-rex-track="cta_click" data-rex-location="case_handoff_hero" data-rex-target="github_star" }
[Compare Workflows](cli-comparison.md){ .md-button data-rex-track="cta_click" data-rex-location="case_handoff_hero" data-rex-target="compare_workflows" }
[Case Library](case-library.md){ .md-button data-rex-track="cta_click" data-rex-location="case_handoff_hero" data-rex-target="case_library" }

## When to Use

Use this when one model should analyze, another should implement, and another should review without losing context.

## Run

```bash
scripts/ctx-agent.sh --agent claude-code --project Harness CLI --prompt "Analyze blockers and propose top fix."
scripts/ctx-agent.sh --agent codex-cli --project Harness CLI --prompt "Implement the top fix from latest checkpoint."
scripts/ctx-agent.sh --agent gemini-cli --project Harness CLI --prompt "Review regression risk and missing tests."
```

## Evidence

1. Shared session/checkpoints updated in:

```bash
ls .aios/context-db/sessions
```

2. Timeline shows cross-agent continuity:

```bash
cd mcp-server
npm run -s contextdb -- timeline --project Harness CLI --limit 12
```

3. Exported context packet exists for latest session:

```bash
ls .aios/context-db/exports | tail -n 5
```

## Why This Matters

Without a shared layer, cross-agent handoff often degrades into copy/paste context.
With Harness CLI, all agents read/write the same project context path and checkpoint stream.

[Star on GitHub](https://github.com/rexleimo/rex-cli?utm_source=cli_rexai_top&utm_medium=docs&utm_campaign=english_growth&utm_content=case_handoff_footer_star){ .md-button .md-button--primary data-rex-track="cta_click" data-rex-location="case_handoff_footer" data-rex-target="github_star" }
