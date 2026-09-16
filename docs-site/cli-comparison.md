---
title: "Raw CLI vs AIOS: One Sentence vs Manual Work"
description: "Compare raw coding agents (Claude Code, Codex, Gemini) with AIOS. Raw CLI requires manual memory, routing, and verification. AIOS finishes complex tasks from one sentence — you say what you want, it handles the rest."
schema_type: faq
faq:
  - q: "Does AIOS replace my coding agent?"
    a: "No. You keep using Codex, Claude Code, Gemini CLI, OpenCode, Hermes, Grok, WorkBuddy, Pi, or ZCode exactly as before. AIOS adds memory, routing, and verification underneath."
  - q: "When should I use raw CLI instead of AIOS?"
    a: "For tiny, one-off changes where you don't need memory or verification. For anything complex or multi-step, AIOS finishes the job from one sentence."
  - q: "What does AIOS add that raw CLI doesn't have?"
    a: "Cross-session memory (your project decisions and context survive sessions), automatic task routing (AIOS picks the right approach), parallel work (multiple agents handle independent pieces), and verification (changes are checked before you see them)."
---

# Raw CLI vs AIOS: One Sentence vs Manual Work

> **Quick Answer:** Use a raw `codex`, `claude`, `gemini`, or `opencode` CLI for a focused one-off task. Add AIOS when the work needs cross-session memory, workflow routing, multi-client handoff, browser safety, or verification evidence. AIOS is a local workflow layer; it does not replace the coding client.

## Decision at a glance

| Need | Recommended path |
| --- | --- |
| One short task with no durable state | Raw CLI |
| Shared project memory and searchable context | AIOS + ContextDB |
| Multiple clients or agents with ownership boundaries | AIOS + Agent Team |
| A change that needs safety and completion evidence | AIOS + edit and verification gates |

AIOS is not a replacement for Codex, Claude, or Gemini CLI.
It is a reliability layer on top of them.

[Star on GitHub](https://github.com/rexleimo/aios?utm_source=cli_rexai_top&utm_medium=docs&utm_campaign=english_growth&utm_content=comparison_hero_star){ .md-button .md-button--primary data-rex-track="cta_click" data-rex-location="comparison_hero" data-rex-target="github_star" }
[Quick Start](getting-started.md){ .md-button data-rex-track="cta_click" data-rex-location="comparison_hero" data-rex-target="quick_start" }
[Case Library](case-library.md){ .md-button data-rex-track="cta_click" data-rex-location="comparison_hero" data-rex-target="case_library" }

## What Changes With AIOS

| Workflow Need | Raw CLI Only | With AIOS Layer |
|---|---|---|
| Cross-session memory | Manual copy/paste context | Project ContextDB resume by default |
| Cross-agent handoff | Ad hoc and fragile | Shared session/checkpoint artifacts |
| Browser automation | Tool-by-tool setup drift | Unified MCP install + doctor scripts |
| Safety for sensitive config reads | Easy to leak secrets into prompts | Privacy Guard redaction path |
| Operational recovery | Manual troubleshooting | Doctor scripts + reproducible runbooks |

## Supported Clients

Nine clients today. The table is the capability matrix the registry actually exposes — read it from `scripts/lib/clients/core/definitions.mjs`, and check your own install with `aios doctor --native --verbose` rather than assuming.

| Client | Command | skills | native | harness | agents | team | Instruction file | Project skill root |
|---|---|---|---|---|---|---|---|---|
| Codex CLI | `codex` | ✓ | ✓ | ✓ | ✓ | ✓ | `AGENTS.md` | `.codex/skills` |
| Claude Code | `claude` | ✓ | ✓ | ✓ | ✓ | ✓ | `CLAUDE.md` | `.claude/skills` |
| Gemini CLI | `gemini` | ✓ | ✓ | ✓ | — | ✓ | `GEMINI.md` | `.gemini/skills` |
| OpenCode | `opencode` | ✓ | ✓ | ✓ | ✓ | ✓ | `AGENTS.md` | `.opencode/skills` |
| Hermes | `hermes` | ✓ | ✓ | ✓ | — | — | `AGENTS.md` | `.hermes/skills` |
| Grok Build | `grok` | ✓ | ✓ | ✓ | ✓ | ✓ | `AGENTS.md` | `.grok/skills` |
| WorkBuddy | `codebuddy` | ✓ | ✓ | ✓ | — | — | `AGENTS.md` | `.workbuddy/skills` |
| Pi | `pi` | ✓ | ✓ | ✓ | — | ✓ | `AGENTS.md` | `.agents/skills` (shared root) |
| ZCode | `zcode` | ✓ | ✓ | ✓ | plugin | ✓ | `AGENTS.md` | `.agents/skills` (shared root) |

Column meanings: **skills** skill packs projected into the client's skill root · **native** native instruction file written · **harness** solo-harness driving · **agents** project-scope subagent definitions · **team** `aios team` parallel dispatch.

Three rows need a footnote:

- **ZCode `agents` is not a miss.** ZCode 0.16.5 has no project-scope subagent-definition surface, so AIOS materializes rex role cards as an `aios-agents` inline plugin under `~/.aios/zcode-plugin` and registers it through user-level `plugins.dirs`; `doctor:zcode-agents` reports manifest validity, agent drift, and registration state. ZCode also has no `--model` flag, so model routing stays empty there, and headless runs need a one-time `zcode login`.
- **Pi and ZCode share the `.agents/skills` root** instead of getting a private duplicate copy, with paired legacy cleanup on upgrade.
- **Pi's `agents` is an upstream boundary; its `team` support is now verified.** Pi "intentionally does not include built-in MCP, sub-agents, permission popups, plan mode" — spawning sub-agents is something you add as an extension, so there is no project-scope definition surface for AIOS to materialize rex role cards into (AIOS tools reach Pi through the `aios-bridge` MCP server plus the Pi extension, not config migration). `team` needs no such surface: a team worker is just a headless `pi -p` sub-process driven by the same spawn routing every other provider uses, and it was verified live in a real `aios team --provider pi --live` batch (planning phase completed end to end, implement worker produced its target file), guarded offline by `scripts/tests/team-pi-worker.test.mjs`. Pi also supports a long-lived `--transport rpc` session for the solo harness. Treat the table as "verified", not "impossible" — `aios doctor --native --verbose` reports what your install actually has.

Project a single client with `aios init --agent <client>` (for example `aios init --agent zcode`), or `--agent all`.

## Use Raw CLI Only When

- You need a one-off short task with no handoff.
- You do not need session persistence or workflow traceability.
- You are experimenting in a throwaway environment.

## Add AIOS When

- You switch between `codex`, `claude`, `gemini`, `opencode`, `hermes`, `grok` (Grok Build), `workbuddy` (CodeBuddy CLI), `pi`, or `zcode` in one project.
- You want restart-safe context and auditable checkpoints.
- You need browser automation and auth-wall handling with explicit human handoff.
- You must reduce accidental secret exposure during config reads.

## Fast Proof (5 Minutes)

```bash
git clone https://github.com/rexleimo/aios.git
cd aios
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

[Star on GitHub](https://github.com/rexleimo/aios?utm_source=cli_rexai_top&utm_medium=docs&utm_campaign=english_growth&utm_content=comparison_footer_star){ .md-button .md-button--primary data-rex-track="cta_click" data-rex-location="comparison_footer" data-rex-target="github_star" }

## FAQ

### Does AIOS replace my coding agent?

No. It adds a local workflow, memory, and verification layer around supported clients.

### Is the raw CLI ever the better choice?

Yes. Keep the raw path for small, stateless, low-risk tasks where extra state would not improve the result.

## Canonical Docs

Read [Workflow Policy](workflow-policy.md), [ContextDB](contextdb.md), and [Getting Started](getting-started.md) for the current behavior.
