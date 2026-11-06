---
title: "v7.1.0: One Console Interface and Shared MCP Configuration"
description: "The local AI tool manager replaces the old Console, while shared MCP writers compute edits before writing and record landing evidence separately from connection tests."
date: 2026-11-06
tags: ["AIOS", "v7.1.0", "Console", "MCP", "release"]
---

# v7.1.0: One Console Interface and Shared MCP Configuration

The default Console now opens the approved local AI tool manager. Tools, MCP
services, project memory, activity and settings share one interface. The old
sidebar and page implementation are removed. Existing bookmarks redirect to the
corresponding current view; refresh and browser back/forward retain the expected
view.

The new interface still uses clearly labeled example data and simulated results.
Real private-project memory reads and configuration writes have not been wired
to it. Existing API, CLI, configuration, memo and session storage are preserved.
Reading examples is not evidence that a private-project connection works.

Real MCP configuration management uses a shared planner and format writers.
All edits for one file are computed before one atomic write, preserving unmanaged
bytes and client-specific field rules. Browser, codemap, Pi and Headroom
registration reuse that path. Ownership stays explicit: matching content does
not adopt an external entry, and force cannot bypass adoption.

The evidence driver previews by default. Applied probes check configuration
read-back, ownership and restoration of the original file hash. The recorded
18-landing matrix contains 12 verified, 1 unverified and 5 host-unsupported
landings. A historical landing card remains separate from a current connection
test; unavailable clients are not reported as verified.

Console typecheck and production build passed, with 95 passing Shell tests.
The final default-environment regression recorded 2746 passing, 0 failing and
12 skipped tests. Browser checks covered navigation, memory and MCP example
flows, and mobile layout without production writes. Windows TUI imports now
resolve their same-directory App module correctly.

This commit prepares version 7.1.0 and its documentation. It does not itself
create a release tag or publish an installable package.
