---
title: "v5.15.0: Pi Gains Real MCP Capability"
description: "AIOS v5.15.0 adds the read-only aios_codemap_search tool to the Pi extension, bridges AIOS-managed MCP servers into Pi on install, and pairs the skills-doctor legacy warning with a safe cleanup path."
date: 2026-09-14
tags: ["AIOS", "Pi", "MCP", "codemap", "release", "v5.15.0"]
---

# v5.15.0: Pi Gains Real MCP Capability

Pi joined AIOS as a first-class client in v5.14.0, but one gap remained: Pi core has no MCP surface, so the structural-code and memory tools the other clients get through MCP were invisible to it. v5.15.0 closes that gap and finishes two smaller loose ends.

## Codemap search inside the Pi extension

The Pi extension now ships a read-only `aios_codemap_search` tool. It reuses the same `search --source code` path every other client uses, so Pi agents can look up files, symbols, and callers before editing — and install/update carries the tool to users automatically, no extra step.

## The MCP bridge: servers land in Pi's global mcp.json

`aios init --agent pi` now installs the pinned MCP-client adapter extension and seeds the AIOS-managed servers into the Pi-global `mcp.json`: `code-review-graph` first, plus the session-following `aios-memory` server when a project root is known. Three safety rules are enforced by the merge itself, not by prompts:

- user-edited servers are never clobbered — they are kept and reported by name;
- the merge fails closed on a malformed `mcp.json` instead of rewriting it;
- network failures degrade to warnings, so an offline machine still gets the extension and the project-local `.mcp.json` path.

## A cleanup to match the doctor warning

The skills doctor learned to warn about legacy shared-root skill installs (old layouts wrote AIOS-managed skills into the shared `~/.agents/skills` root, which made Pi scan the same skill twice). v5.15.0 adds the paired cleanup: `removeLegacySharedRootInstalls` deletes only directories carrying AIOS `managedBy` metadata, never user-owned skills, and supports a dry-run preview that lists what would be removed without touching the disk.

## Upgrade

Re-run `aios init --agent pi` (or `aios update`) to pick up the adapter and seeded servers. Grab the installer scripts from the v5.15.0 release assets; changelogs ship in English, Chinese, Japanese, and Korean.
