---
title: "Why Your AI Coding Agent Forgets Context Between Sessions (and How to Fix It)"
description: "Your coding agent forgets everything between sessions. AIOS gives it memory automatically — you say one sentence, it remembers your project decisions, constraints, and progress across sessions. Works with Claude Code, Codex, Gemini, OpenCode, Hermes, Grok. All local."
date: 2026-08-10
schema_type: techarticle
---

# Why Your AI Coding Agent Forgets Context Between Sessions (and How to Fix It)

> **Quick Answer:** Your coding agent forgets context between sessions because every new session starts with an empty prompt window. The fix is automatic project memory: AIOS stores your decisions, checkpoints, and searchable context on disk, and pulls what the agent needs when it needs it — no re-explaining required. You say what you want in one sentence, and it picks up where you left off. Works with Claude Code, Codex, Gemini, OpenCode, Hermes, and Grok. All local, no data leaves your machine.

## The problem: every session is a fresh amnesiac

Open `codex` or `claude` in a project you worked on yesterday. The agent does not remember:

- the architecture decision you agreed on,
- the naming conventions you enforce,
- the failing test you were chasing,
- the constraint "never touch the generated dist directory".

It re-discovers all of this by reading files again, asking you again, or — worst case — making a decision that contradicts last week's decision. This is not a model quality problem. It is a **context availability problem**: the information exists in the repository, but nothing surfaces it into the conversation at the right time.

## Why "paste the README" is not a fix

The naive workaround — paste the whole project context into every prompt — fails for a simple reason: context is a budget. A 10,000-line project summary drowns the model's attention budget and burns tokens on boilerplate. What you need is **selective recall**: the right few hundred tokens, at the right moment, from a store that knows what the project has decided.

## The fix: pull-based local project memory (ContextDB)

AIOS's [ContextDB](https://cli.rexai.top/contextdb/) is a project-local memory store with three moving parts:

| Part | What it does |
| --- | --- |
| **Memo** | Save a durable decision or constraint: `aios memo add "Keep auth tests strict"`, then `aios memo search "auth"` from any later session. |
| **Checkpoints** | Record session state so a resumed run continues from where the last session stopped, not from zero. |
| **Searchable packs** | Package related context (docs, plans, decisions) into bounded, searchable units the agent can pull on demand. |

ContextDB is **pull-based**: nothing is injected into every prompt. The agent searches or recalls relevant material when the task needs it. That keeps prompt budgets small and memory durable across sessions.

## How to set it up in under two minutes

```bash
# 1. Install and initialize in your project root
curl -fsSL https://github.com/rexleimo/aios/releases/latest/download/aios-install.sh | bash
source ~/.zshrc
aios init --all

# 2. Verify ContextDB and client sync
aios doctor --native --verbose

# 3. Start saving decisions
aios memo add "Authentication tests must stay strict"
aios memo search "authentication"
```

Then open `codex`, `claude`, `gemini`, `opencode`, `hermes`, or `grok` in the same project — the agent finds the memory when it matters.

## Does it send my code to a server?

No. ContextDB stores everything in `.aios/context-db/` inside your project. The engines, memory, token compression (RTK / Caveman / Headroom), and browser all run locally. Data does not leave the machine. See the [privacy guard case study](https://cli.rexai.top/case-privacy-guard/) for the details.

## FAQ

**Why does my agent forget between sessions even with the same project?**
Because each CLI session starts with a fresh prompt window. Nothing in the session links to yesterday's decisions unless something surfaces them — that is what project memory is for.

**Is ContextDB the same as a vector database?**
No. ContextDB stores structured, searchable project memory (memos, checkpoints, packs) with explicit governance — you choose what gets remembered and what gets purged.

**Does this work with Claude Code?**
Yes. ContextDB is client-neutral: it works with codex, claude, gemini, opencode, hermes, and grok through the same project marker.

## Next step

Read the full [ContextDB documentation](https://cli.rexai.top/contextdb/) or try the [Quick Start](https://cli.rexai.top/getting-started/) to get memory running in your project today.
