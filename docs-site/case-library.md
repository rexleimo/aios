---
title: Case Library
description: Official reproducible scenarios that show what Harness CLI can do in real workflows.
---

# Official Case Library

This page is the canonical capability map for `Harness CLI`.

Each case includes:

- `When to use`: decision trigger
- `Run`: copy-paste commands
- `Evidence`: what proves success

## Featured English Deep Dives

[Star on GitHub](https://github.com/rexleimo/rex-cli?utm_source=cli_rexai_top&utm_medium=docs&utm_campaign=english_growth&utm_content=case_library_featured_star){ .md-button .md-button--primary data-rex-track="cta_click" data-rex-location="case_library_featured" data-rex-target="github_star" }
[Raw CLI vs Harness CLI Layer](cli-comparison.md){ data-rex-track="cta_click" data-rex-location="case_library_featured" data-rex-target="compare_workflows" }
[Case: Cross-CLI Handoff](case-cross-cli-handoff.md){ data-rex-track="cta_click" data-rex-location="case_library_featured" data-rex-target="case_handoff" }
[Case: Browser Auth-Wall Flow](case-auth-wall-browser.md){ data-rex-track="cta_click" data-rex-location="case_library_featured" data-rex-target="case_authwall" }
[Case: Privacy Guard Config Read](case-privacy-guard.md){ data-rex-track="cta_click" data-rex-location="case_library_featured" data-rex-target="case_privacy" }

## Case 1: 5-minute fresh setup on a new machine

**When to use**

You are onboarding a new laptop or teammate and need a clean baseline quickly.

**Run**

```bash
scripts/setup-all.sh --components all --mode opt-in
scripts/verify-aios.sh
```

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-all.ps1 -Components all -Mode opt-in
powershell -ExecutionPolicy Bypass -File .\scripts\verify-aios.ps1
```

**Evidence**

- `verify-aios` exits with code `0`
- `doctor-*` checks show no blocking errors

## Case 2: Browser MCP installation and smoke test

**When to use**

You need browser automation (`browser_*`) working for demos or agent workflows.

**Run**

```bash
scripts/install-browser-mcp.sh
scripts/doctor-browser-mcp.sh
```

Then in client chat:

```text
browser_launch {"profile":"default"}
browser_navigate {"url":"https://example.com"}
browser_snapshot {"includeAx":true}
browser_close {}
```

**Evidence**

- `doctor-browser-mcp` reports `Result: OK` (warnings are acceptable)
- Smoke commands return structured tool responses without runtime exceptions

## Case 3: Cross-CLI handoff in one project

**When to use**

You want Claude to analyze, Codex to implement, and Gemini to review without losing context.

**Run**

```bash
claude
codex
gemini
```

Or deterministic one-shot:

```bash
scripts/ctx-agent.sh --agent claude-code --prompt "Summarize blockers and propose next steps"
scripts/ctx-agent.sh --agent codex-cli --prompt "Implement the top priority fix from latest checkpoint"
scripts/ctx-agent.sh --agent gemini-cli --prompt "Review risk and missing tests"
```

**Evidence**

- New session/checkpoint artifacts under `.aios/context-db/`
- Later CLI runs can continue using the same project context

## Case 4: Auth-wall handling (human-in-the-loop)

**When to use**

Automation reaches login walls (Google, Meta, platform auth) and should not blindly bypass them.

**Run**

```text
browser_launch {"profile":"local"}
browser_navigate {"url":"https://target.site"}
browser_auth_check {}
```

If `requiresHumanAction=true`, complete login manually in that browser profile, then continue with `browser_snapshot` / `browser_click` / `browser_type`.

**Evidence**

- `browser_auth_check` returns explicit auth state fields
- Flow resumes after manual login using the same profile

## Case 5: One-shot auditable execution chain

**When to use**

You need one command to produce an auditable record (`init -> session -> event -> checkpoint -> pack`).

**Run**

```bash
scripts/ctx-agent.sh --agent codex-cli --project Harness CLI --prompt "Continue from latest checkpoint and execute next step"
```

**Evidence**

- New checkpoint entry in `.aios/context-db/index/checkpoints.jsonl`
- Exported context packet in `.aios/context-db/exports/`

## Case 6: Team skill lifecycle (install/update/doctor/uninstall)

**When to use**

You manage shared skills across multiple CLIs and need predictable lifecycle operations.

**Run**

```bash
scripts/install-contextdb-skills.sh
scripts/doctor-contextdb-skills.sh
scripts/update-contextdb-skills.sh
# rollback if needed
scripts/uninstall-contextdb-skills.sh
```

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-contextdb-skills.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\doctor-contextdb-skills.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\update-contextdb-skills.ps1
# rollback if needed
powershell -ExecutionPolicy Bypass -File .\scripts\uninstall-contextdb-skills.ps1
```

**Evidence**

- Doctor output confirms expected targets exist and are healthy
- Update/uninstall produce no dangling broken links

## Case 7: Shell wrapper recovery and rollback

**When to use**

A user reports command wrapping issues and you need a safe recover path.

**Run**

```bash
scripts/doctor-contextdb-shell.sh
scripts/update-contextdb-shell.sh
# full rollback if needed
scripts/uninstall-contextdb-shell.sh
```

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\doctor-contextdb-shell.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\update-contextdb-shell.ps1
# full rollback if needed
powershell -ExecutionPolicy Bypass -File .\scripts\uninstall-contextdb-shell.ps1
```

**Evidence**

- Wrapper doctor no longer reports blocking issues
- Native `codex`/`claude`/`gemini` commands work after rollback

## Case 8: Security hygiene pre-release check

**When to use**

Before publishing updates, verify no unsafe config drift in skills/hooks/MCP settings.

**Run**

```bash
scripts/doctor-security-config.sh
```

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\doctor-security-config.ps1
```

**Evidence**

- Security doctor exits `0`
- Any warnings are reviewed and resolved before release

## Contribute a new official case

To propose a case for this library:

1. Include exact commands with no placeholders.
2. Define measurable evidence (exit code, file artifact, or tool response).
3. Add rollback/recovery step when relevant.
