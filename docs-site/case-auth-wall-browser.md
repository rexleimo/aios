---
title: Case - Browser Auth-Wall Flow
description: Detect challenge/auth walls and continue safely with human-in-the-loop handoff.
---

# Case: Browser Auth-Wall Flow

[Star on GitHub](https://github.com/rexleimo/harness-cli?utm_source=cli_rexai_top&utm_medium=docs&utm_campaign=english_growth&utm_content=case_authwall_hero_star){ .md-button .md-button--primary data-rex-track="cta_click" data-rex-location="case_authwall_hero" data-rex-target="github_star" }
[Compare Workflows](cli-comparison.md){ .md-button data-rex-track="cta_click" data-rex-location="case_authwall_hero" data-rex-target="compare_workflows" }
[Case Library](case-library.md){ .md-button data-rex-track="cta_click" data-rex-location="case_authwall_hero" data-rex-target="case_library" }

## When to Use

Use this when browser automation reaches login walls, Cloudflare checks, or challenge pages.

## Run

Launch and navigate:

```text
browser_launch {"profile":"default"}
browser_navigate {"url":"https://target.site"}
```

Check gate state:

```text
browser_auth_check {"profile":"default"}
browser_challenge_check {"profile":"default"}
```

If human action is required, complete login/challenge manually in the same profile, then continue:

```text
browser_snapshot {"profile":"default","includeAx":true}
```

## Evidence

1. Tool output clearly signals wall state (`requiresHumanAction`, challenge/auth hints).
2. After manual completion, `browser_snapshot` succeeds on the post-login page.
3. No bypass behavior is attempted by automation.

## Why This Matters

Reliable automation is not blind automation.
This flow keeps policy-sensitive steps explicitly human-gated, then resumes with shared browser state.

[Star on GitHub](https://github.com/rexleimo/harness-cli?utm_source=cli_rexai_top&utm_medium=docs&utm_campaign=english_growth&utm_content=case_authwall_footer_star){ .md-button .md-button--primary data-rex-track="cta_click" data-rex-location="case_authwall_footer" data-rex-target="github_star" }
