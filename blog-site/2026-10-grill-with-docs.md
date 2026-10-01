---
title: "v6.3.0: /grill Becomes a Real Command, the Interview Writes Itself Down, and Pi Picks Its Own MCP Carrier"
description: "v6.3.0 closes two gaps the aihero /grill-with-docs pattern exposed: the /grill command now actually registers in your client so slash autocomplete finds it, and rex-requirements interviews write confirmed terms and decisions straight into CONTEXT.md and ADRs. The same release teaches the Pi MCP bridge to pick its carrier from the installed pi version, ending the builtin-vs-adapter warning on pi 0.99+."
date: 2026-10-01
tags: ["AIOS", "v6.3.0", "grill", "skills", "rex-requirements", "pi", "mcp", "adr", "context-md", "release"]
---

# v6.3.0: /grill Becomes a Real Command, the Interview Writes Itself Down, and Pi Picks Its Own MCP Carrier

> **Quick Answer:** Two fixes in one release. First, AIOS's requirement-grilling command `/grill` was real in the workflow core but registered nowhere — no client ever suggested it, and only Claude Code's hook parsed it. It is now a thin registered skill in all seven clients, and the grilling discipline behind it gained the half it was missing: confirmed domain terms go into a `CONTEXT.md` glossary in real time, and settled decisions become lightweight ADRs under `docs/adr/`. Second, pi 0.99+ ships its own built-in MCP extension, which collided with the separately installed `pi-mcp-adapter` and printed a warning on every startup. The installer now reads the installed pi version and picks the carrier: built-in MCP on new pi, the adapter only as the legacy fallback — with the same `mcp.json` feeding both.

## The problem: a command you couldn't type, and an interview that forgot

A post on aihero.dev described `/grill-with-docs`: an agent interviews you about a plan and records what it learns — glossary terms into a `CONTEXT.md`, decisions into ADRs. Reading it next to our own setup produced an uncomfortable scorecard.

The interviewing half, we already had. `rex-requirements` grills inline during the work — one decision-type question at a time, every question carrying a recommended default, a three-round budget that converts un-answered threads into recorded assumptions instead of blocking. What it never did was *write anything down*: it read a `CONTEXT.md` if one existed, but nothing in the repo ever wrote one, and decisions that survived grilling lived in ephemeral plan state, not in documents a future session would see without a memory recall succeeding first.

The command half was worse. `/grill` — along with the whole `/plan`, `/spec`, `/tickets` family — existed as a text convention: a regex in the workflow core, a declaration protocol in AGENTS.md, and a UserPromptSubmit hook wired in Claude Code. Type `/grill` in ZCode and the autocomplete offered nothing, because nothing was registered. The command family was client-agnostic by design, but the cost of that design was that only clients with the hook could even see it deterministically.

And on machines running pi 0.99+, a third annoyance: pi shipped its own built-in `mcp` extension on 2026-09-29, AIOS still installed the third-party `pi-mcp-adapter` on top of it, both register `/mcp`, and pi printed an `[Extension issues]` warning on every startup while quietly picking the adapter.

## What changed

### /grill is now a registered skill

`skill-sources/grill/SKILL.md` is a thin entry: it declares `explicit-intent: grill`, executes the rex-requirements flow, and performs its write-back rules. It deliberately contains no process detail of its own — when the two disagree, rex-requirements wins — so the discipline lives in exactly one place. The build materializes it into every repo surface (`.codex/skills`, `.claude/skills`, `.agents/skills`, …) and installs it to the seven client homes its frontmatter promises: zcode, codex, claude, pi, qoder, hermes, workbuddy. New session, type `/`, and it is there.

### The interview writes itself down

`rex-requirements` gained a step between "record acceptance criteria" and "find the first slice": **write back to the repo, in the moment**. When your answer settles a domain term, the agent upserts it into the repo-root `CONTEXT.md` glossary immediately — one line of definition, one line of why, and your own hand-written entries are never rewritten. When a decision survives the clarification budget or you make the call explicitly, it becomes `docs/adr/NNNN-<slug>.md` — context, decision, consequences, numbered without reuse. The boundary is written into the rule: recorded assumptions are unverified and never become ADRs; adjudicated decisions do.

This is not a second memory system. Cross-session memory still lives on the ContextDB lane — pull-based, powerful, and silent when recall misses. `CONTEXT.md` and ADRs are the complementary lane: versioned with the code, visible to every future agent and human without anyone asking for them. Different questions, different storage.

### Pi picks its MCP carrier from its own version

`resolvePiMcpMode()` reads `pi --version` and returns `builtin` for pi ≥ 0.99.0, `adapter` otherwise — and version-detection failure stays on `adapter`, the always-safe legacy path, so offline machines and old pi keep working byte-for-byte as before. Both carriers read the same `~/.pi/agent/mcp.json`, so the AIOS-managed server entries are carrier-independent and nothing about your servers moves. On new pi the installer stops installing the adapter; an adapter that is already installed is only *reported* (`installed-conflicts`, an info-level note with the opt-in `pi remove npm:pi-mcp-adapter` command) — never removed for you, because removal flips session behavior. `aios doctor` mirrors the split and stops warning that "Pi cannot load MCP servers" on new pi where the built-in extension serves `mcp.json` just fine.

## Upgrade notes

- Nothing to migrate for `/grill`: rerun `aios init` (or pull and re-sync skills) and the skill appears; until then the old text-convention path still works.
- The `CONTEXT.md` / `docs/adr/` files are created on first use and should be committed with your project — their value is that they version with the code.
- On pi ≥ 0.99.0 the startup warning is informational and harmless; the adapter keeps working. Removing it (`pi remove npm:pi-mcp-adapter`) is opt-in and restores built-in MCP; do it when you have a minute to glance at `pi mcp list` afterward.
