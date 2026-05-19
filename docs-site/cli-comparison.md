---
title: CLI Comparison
description: Compare raw Codex/Claude/Gemini CLI workflows with Harness CLI's orchestration layer.
---

# Raw CLI vs Harness CLI Layer

Harness CLI is not a replacement for Codex, Claude, or Gemini CLI.
It is a reliability layer on top of them.

[Star on GitHub](https://github.com/rexleimo/harness-cli?utm_source=cli_rexai_top&utm_medium=docs&utm_campaign=english_growth&utm_content=comparison_hero_star){ .md-button .md-button--primary data-rex-track="cta_click" data-rex-location="comparison_hero" data-rex-target="github_star" }
[Quick Start](getting-started.md){ .md-button data-rex-track="cta_click" data-rex-location="comparison_hero" data-rex-target="quick_start" }
[Case Library](case-library.md){ .md-button data-rex-track="cta_click" data-rex-location="comparison_hero" data-rex-target="case_library" }

## What Changes With Harness CLI

| Workflow Need | Raw CLI Only | With Harness CLI Layer |
|---|---|---|
| Cross-session memory | Manual copy/paste context | Project ContextDB resume by default |
| Cross-agent handoff | Ad hoc and fragile | Shared session/checkpoint artifacts |
| Browser automation | Tool-by-tool setup drift | Unified MCP install + doctor scripts |
| Safety for sensitive config reads | Easy to leak secrets into prompts | Privacy Guard redaction path |
| Operational recovery | Manual troubleshooting | Doctor scripts + reproducible runbooks |

## Use Raw CLI Only When

- You need a one-off short task with no handoff.
- You do not need session persistence or workflow traceability.
- You are experimenting in a throwaway environment.

## Add Harness CLI When

- You switch between `codex`, `claude`, `gemini`, or `opencode` in one project.
- You want restart-safe context and auditable checkpoints.
- You need browser automation and auth-wall handling with explicit human handoff.
- You must reduce accidental secret exposure during config reads.

## Fast Proof (5 Minutes)

```bash
git clone https://github.com/rexleimo/harness-cli.git
cd harness-cli
scripts/setup-all.sh --components all --mode opt-in
source ~/.zshrc
codex
```

Then verify persistent artifacts exist:

```bash
ls .aios/context-db
```

Expected: `sessions/`, `index/`, `exports/`.

## Deep-Dive Cases

- [Case: Cross-CLI Handoff](case-cross-cli-handoff.md)
- [Case: Browser Auth-Wall Flow](case-auth-wall-browser.md)
- [Case: Privacy Guard Config Read](case-privacy-guard.md)

## Next Action

[Star on GitHub](https://github.com/rexleimo/harness-cli?utm_source=cli_rexai_top&utm_medium=docs&utm_campaign=english_growth&utm_content=comparison_footer_star){ .md-button .md-button--primary data-rex-track="cta_click" data-rex-location="comparison_footer" data-rex-target="github_star" }
