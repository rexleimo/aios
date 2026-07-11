---
title: "v3.6.0: A Safer Token Intelligence Workflow with Headroom and Ponytail"
description: "Harness CLI combines RTK, Caveman, Headroom MCP, ContextDB, and a Ponytail-inspired decision gate while keeping client configuration ownership explicit."
date: 2026-07-10
tags: ["AIOS", "Headroom", "Ponytail", "RTK", "Caveman", "MCP", "token compression"]
---

# v3.6.0: A Safer Token Intelligence Workflow with Headroom and Ponytail

Saving tokens should not mean deleting the evidence an agent needs to make a good engineering decision. v3.6.0 adds the installation and compatibility control plane for a five-layer token intelligence workflow: avoid unnecessary work, compress noisy inputs, retain large material efficiently, write concisely, and recall history only when it is needed.

## The five layers have different jobs

| Layer | Job |
| --- | --- |
| Ponytail-inspired gate | Pick the smallest correct change before adding code, dependencies, files, or broad context. |
| RTK | Reduce shell and tool-output noise locally. |
| Headroom | Store and retrieve compact representations of material needed across later MCP steps. |
| Caveman | Keep agent responses concise without deleting technical facts. |
| ContextDB | Make prior project context pull-based instead of injecting all history. |

The gate is inspired by [Ponytail](https://github.com/DietrichGebert/ponytail), with its source and licensing respected. AIOS does not claim to install or emulate the upstream plugin. Planning, tests, code review, privacy checks, and verification remain separate quality gates.

## Why we do not force Headroom into every shell

Headroom's upstream CLI offers official `wrap` targets for some clients. A wrapper is responsible for its own proxy, provider configuration, and cleanup lifecycle. A shell-level injection that pretends every client is wrapped would be fragile and could conflict with another client's configuration.

The v3.6.0 integration therefore has a narrower, verifiable boundary:

- `aios init` detects and installs the tested Headroom range in an isolated tool environment.
- Gemini CLI, Grok Build, and Hermes Agent use their own official MCP commands to register the official `headroom mcp serve` process.
- AIOS uses an absolute Headroom executable, re-reads the resulting entry, and records only AIOS-owned registrations in `~/.aios/integrations/headroom-mcp.json`.
- Existing external entries or mismatched entries are reported as `external` or `conflict`; they are never overwritten.

For Hermes, a real TTY is required for the host CLI's tool-enable interaction. A non-interactive init reports `pending-interactive` instead of claiming success.

## MCP is explicit compression, not transparent interception

This distinction matters. `headroom_compress`, `headroom_retrieve`, and `headroom_stats` are MCP tools the model calls explicitly. The model commonly sees the original text before it requests compression, so the current turn may not save tokens and can include one extra tool call.

The benefit appears in later steps: retain a compact result, retrieve the original only when necessary, and use statistics to measure actual work. We only describe an MCP saving as measured when its stats show both successful compressions and a positive saved-token total. Upstream benchmark percentages are not local AIOS evidence.

## One installation flow, two independent permissions

```bash
# Inspect without changing packages or client configuration.
node scripts/aios.mjs init --all --dry-run

# Interactive install for RTK, Caveman, and supported Headroom.
node scripts/aios.mjs init --all

# Unattended installation.
node scripts/aios.mjs init --all --yes-compression-tools

# Separately authorize Gemini/Grok MCP registration.
node scripts/aios.mjs init --all --yes-compression-tools --yes-headroom-mcp
```

The second unattended flag is intentionally separate. Installing a local package does not imply consent to change a user's MCP configuration. Headroom requires Python 3.10 or later and `uv` or `pipx`; AIOS uses the tested `headroom-ai[all]>=0.31.0,<0.32.0` range and does not silently install into the system Python environment.

## A practical decision sequence

Before reading a whole repository, web page, or log, or before adding a new implementation, ask:

1. Can a smaller edit, configuration change, or explanation solve this?
2. Is there an existing implementation or document to reuse?
3. Can a focused query provide the required evidence?
4. Only then build the smallest tested change.

That sequence saves more than a formatting pass because it prevents low-value context and low-value implementation from existing in the first place.

## Privacy boundaries

RTK and Caveman run locally. Installing Headroom can contact package repositories and optional model resources. A Headroom wrapper or normal client still sends model requests to the provider selected by the user; local compression does not eliminate that provider traffic.

Read the [Token Intelligence and Compression guide](https://cli.rexai.top/token-compression/) for operational details, or see the [v3.6.0 changelog](https://cli.rexai.top/changelog/) for the release record.
