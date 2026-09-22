---
title: "v6.1.0: Browser MCP Off by Default — One Install-Time Choice, Three Modes"
description: "v6.1.0 stops auto-installing the browser MCP on every machine. At install you pick one of three mutually-exclusive modes — none, playwright, or bsk — and only the selected engine is materialized into your clients. The heavy one is the default: off."
date: 2026-09-23
tags: ["AIOS", "browser-mcp", "memory", "default-off", "release", "v6.1.0"]
---

# v6.1.0: Browser MCP Off by Default — One Install-Time Choice, Three Modes

> **Quick Answer:** Browser automation used to be turned on by default, which meant every machine materialized a full browser MCP install — and each client's browser MCP spawns a Chrome that the framework could not reliably release. v6.1.0 makes the default *off*: at install you now choose one of three mutually-exclusive modes — **none**, **playwright**, or **bsk** — and AIOS materializes only the engine you picked. The mode lives in your settings, can be changed anytime with one command, and the writers behind every client respect it end to end. Because the heavy option is now off by default, sessions get lighter and quieter out of the box.

## The problem: automation that could not turn itself off

The workflow could already drive a browser. The gap was not capability — it was *cost*, and who paid it.

1. **Every machine paid the cost, even those that never browse.** The browser MCP materialized `.mcp.json` already enabled, so the moment you installed AIOS you had a browser runtime living in your client configs whether or not you used it.
2. **The memory cost was real and compounding.** A recent audit found the heavy memory was not the ~75 agent processes, but **seven `browser-mcp` instances each spawning their own Chrome** — hundreds of megabytes apiece — sitting idle for sessions that never touched a page.
3. **Dead clients could not release themselves.** The interactive `ctx-agent` path is a `spawnSync` shell, not something it can wake up to reap. So once a browser was alive, nothing in the framework could reclaim it, and there was no idle-release mechanism at all.
4. **There was no escape hatch.** A user who wanted *no* browser automation had to reach into generated config and delete it by hand — and real users do not do that reliably.

The fix had to be: make the browser opt-in, let each agent still run fully isolated when it *does* browse, and give the user a single switch instead of a manual config hunt.

## What changed in v6.1.0

### 1. Browser MCP installs off by default

The browser MCP is no longer auto-enabled on install. The new default is **`none`** — nothing browser-related is materialized until you, the operator, say otherwise. That is the heaviest option being the default on purpose: the moment you browse, you opt in; otherwise you pay nothing.

This is not "browser automation is optional." It is "browser automation is **explicit**." When you need it, it is fully there. When you do not, the framework never quietly turns itself on.

### 2. One install-time choice, three mutually-exclusive modes

At install (or any time afterward) you pick exactly one:

| Mode | What it gives you | When to pick it |
| --- | --- | --- |
| **`none`** *(default)* | No browser MCP at all. Zero Chrome, zero browser aliases. | Most users. The browser is a tool you reach for, not always-on. |
| **`playwright`** | Repository-local Node/Playwright runtime, launched per agent, plus the launch snippet. | You need programmatic browser control and the isolation Playwright gives. |
| **`bsk`** | Human-in-the-loop automation: reuse your logged-in Chrome via an extension + local daemon. | You need real-person sessions — a human answers requests as the browser drives. |

The three are mutually exclusive by construction — only one engine is materialized into your clients, and switching drops the old alias and clears the legacy entry.

### 3. The mode seam: writers respect the choice end to end

The whole thing rides one seam, `mcp-mode.mjs`, that every writer shares:

- `browserManagedServer` returns `null` for `none` and `bsk`, so the **browser alias is dropped** and **legacy entries are cleared** in every client's config — Cod TOML, OpenCode, Hermes YAML, ZCode, Gemini, and the shared migration path.
- The **Playwright-only runtime check** is gated: it only runs for the `playwright` mode. Choosing `none`/`bsk` skips the repository-local Node/Playwright installer entirely.
- Each writer resolves the mode (`resolveBrowserMode`) from settings and materializes accordingly, so the choice is honored consistently across all clients.

### 4. Change it anytime with one command

The mode is just data in your settings, so you are never locked in:

```bash
aios internal browser switch playwright   # or: bsk | none
```

That single command re-materializes to **all clients** — it runs the same `mcp-migrate` pass the install step runs, so your existing clients pick up the new engine in one shot. If you switch to `bsk`, AIOS prints the three-step setup guide (CLI → install extension + Connect → run) and the `browser_*` → `bsk` tool map; switch back to `playwright` and the guide stays gone.

### 5. BSK: a connect baseline that warns, never hard-crashes

The BSK mode is human-in-the-loop browser automation — it reuses your logged-in Chrome through a browser extension and a local daemon, mutually exclusive with Playwright. Because it depends on three things lining up (CLI, daemon, extension) at the same version, v6.1.0 ships a `bsk-doctor` that checks the connectivity baseline rather than pretending it is connected:

```bash
aios internal browser bsk-doctor
```

- It reads `bsk status --json` and treats `version_skew:false` as the healthy baseline (CLI/daemon/extension all matching).
- If the `bsk` CLI is missing, it **warns** (owner action: `install.ps1 --browser bsk`) and moves on — it does not hard-crash a session.
- If the daemon has not connected yet, it tells you to press "Connect" and continues.

This is intentional: a doctor that hard-fails would turn a "not yet connected" into a hard blocker. A browser doctor should nudge, not stop you.

## Why this makes AIOS more than a traditional agent

A traditional coding agent *adds* capabilities the moment you install it, and those capabilities stay on forever — Chrome running, aliases living in your config, no clean way to turn them off. AIOS has run the engineering loop and honored an evidence contract for many versions, but **what gets installed by default was never an operator choice** — it was just on.

v6.1.0 closes that gap: **installation is now a decision, not an accident.** You choose the browser engine, the framework materializes exactly that and nothing else, the writers stay consistent across every client, and you can change your mind with a single command. That is the difference between an agent that turns everything on and one that turns on only what you asked for.

## Reference materials

- The install-time prompt, the `switch` command, and the BSK setup guide live in `scripts/lib/components/browser/` (`mcp-mode.mjs`, `switch.mjs`, `prompt.mjs`, `bsk-writer.mjs`).
- The `bsk-doctor` connectivity baseline and the full test suite are in `scripts/tests/bsk-writer.test.mjs` (14 cases) plus the browser/mcp writer tests.
- The full release plan, scope, and the release-6-1-0 decision (minor → `6.1.0`) is at `docs/plans/release-6-1-0-browser-default-off-and-lighter-sessions.md`.
- Verification: 57 targeted tests pass (including the wiring gate W1–W6 that guarantees every new CLI action is actually reachable), and the real `aios internal browser switch bsk` command materializes all nine clients and prints the setup guide end to end.
