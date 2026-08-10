---
title: Case - Privacy Guard Config Read
description: Read config-like files safely with redaction before model consumption.
---

# Case: Privacy Guard Config Read

[Star on GitHub](https://github.com/rexleimo/aios?utm_source=cli_rexai_top&utm_medium=docs&utm_campaign=english_growth&utm_content=case_privacy_hero_star){ .md-button .md-button--primary data-rex-track="cta_click" data-rex-location="case_privacy_hero" data-rex-target="github_star" }
[Compare Workflows](cli-comparison.md){ .md-button data-rex-track="cta_click" data-rex-location="case_privacy_hero" data-rex-target="compare_workflows" }
[Case Library](case-library.md){ .md-button data-rex-track="cta_click" data-rex-location="case_privacy_hero" data-rex-target="case_library" }

## When to Use

Use this before sharing config files that may include keys, tokens, cookies, or session-like data.

## Run

Check status:

```bash
aios privacy status
```

Read sensitive file via redaction path:

```bash
aios privacy read --file config/browser-profiles.json
```

Optional local model enhancement:

```bash
aios privacy ollama-on
```

## Evidence

1. Output is redacted and does not expose raw secrets.
2. Config intent remains readable for troubleshooting/review.
3. `privacy status` confirms strict mode is enabled.

## Why This Matters

Teams often leak secrets by pasting raw config into prompts.
Privacy Guard turns risky reads into a repeatable safe default.

[Star on GitHub](https://github.com/rexleimo/aios?utm_source=cli_rexai_top&utm_medium=docs&utm_campaign=english_growth&utm_content=case_privacy_footer_star){ .md-button .md-button--primary data-rex-track="cta_click" data-rex-location="case_privacy_footer" data-rex-target="github_star" }
