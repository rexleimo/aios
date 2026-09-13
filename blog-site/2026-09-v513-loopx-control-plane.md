---
title: "v5.13.0: LoopX Control Plane + No-Orphan Process Trees"
description: "AIOS v5.13.0 settles provider turns into contracts, paces unattended runs, kills whole process trees on timeout, and un-sticks aios-shell. v5.13.0."
date: 2026-09-13
tags: ["AIOS", "harness", "release", "settlement", "v5.13.0"]
---

# v5.13.0: LoopX Control Plane + No-Orphan Process Trees

v5.13.0 is the first tagged release since v5.11.0. Besides the v5.12.0 memory-plane work and the Pi client, it brings a control-plane adoption for the long-running harness — and the last two kill-the-stall fixes our own field reports demanded.

## Settled turns, not hopeful turns

Borrowing LoopX's turn contract, every provider turn now settles into a typed envelope: outcome, evidence, and an `effectRef` idempotency key (execution token plus payload hash). A separate validator process re-checks the envelope before anything is written back — the executor can no longer self-verify, duplicated effects are rejected, and the settlement journal stays append-only.

## Pacing for unattended runs

The should-run gate decides run, wait, ask, or quiet before every turn: a cadence ladder relaxes wake intervals when nothing changes, a 24-hour duty-ratio quota spends only on material turns, and an unchanged-poll counter quietly shuts the run down instead of burning tokens. Attended runs are unchanged; `--unattended` is a strict opt-in, a read-only safe-bypass turn is the only response to an operator gate, and `aios harness resume` stays the only way back in. A read-only `aios harness dashboard` projects the whole state as static HTML.

## The orphan that kept editing after its turn died

Some verification turns legitimately run longer than the 30-minute default. When the timeout fired, AIOS killed the direct child only — the provider CLI underneath kept running as an orphan, still editing the same workspace, while the loop marched into the next iteration. Two agents, one workspace, no one told.

v5.13.0 spawns every turn detached and cleans the whole process group in three stages (SIGTERM group, grace, SIGKILL group, verify). If the tree still refuses to die after SIGKILL, the loop stops instead of overlapping. And because not every long task should be cut, `--turn-timeout-ms` makes the cap explicit per run.

## The tool call that never came back

The same class lived in the shell MCP: a command that left a background grandchild holding stdout and stderr made the `close` event never fire, so the tool call hung forever — the "git diff spins and spins" shape. The shell server now runs the same staged tree cleanup and force-settles even when `close` never arrives. Timeouts mean timeouts now.

## Upgrade

Grab the installer scripts from the v5.13.0 release assets and re-run them; changelogs ship in English, Chinese, Japanese, and Korean.
