---
title: Token Intelligence and Compression
description: Keep useful context small with RTK, Caveman, Headroom MCP, ContextDB, and a Ponytail-inspired decision gate.
---

# Token Intelligence and Compression

Token savings only help when the agent still has enough evidence to make the right decision. AIOS v3.6.0 uses a layered workflow: avoid unnecessary work first, then reduce the text each stage has to carry.

## The five layers

| Layer | Responsibility | What it does not promise |
| --- | --- | --- |
| Ponytail-inspired gate | Choose the smallest correct change before implementation. | It is a workflow rule, not an installed Ponytail plugin. |
| RTK | Reduce noisy shell and tool output before it reaches the agent. | It does not replace scoped commands or preserve every line of a raw log. |
| Headroom MCP | Let supported MCP clients explicitly compress material needed across later steps. | It is not transparent interception of the current model request. |
| Caveman | Use a concise response style without dropping technical facts. | It does not compress tools or files by itself. |
| ContextDB | Recall project context on demand instead of injecting all history. | It does not make runtime history automatically appear in every prompt. |

Quality controls remain outside this stack: planning, tests, code-review evidence, privacy checks, and verification are still required.

## Install and inspect

Use `aios init` as the installation boundary:

```bash
# Preview only; no package or client configuration changes.
node scripts/aios.mjs init --all --dry-run

# Interactive: install detected RTK, Caveman, and supported Headroom.
node scripts/aios.mjs init --all

# CI or other unattended installation.
node scripts/aios.mjs init --all --yes-compression-tools

# Also authorize new user-scope Headroom MCP registrations for Gemini and Grok.
node scripts/aios.mjs init --all --yes-compression-tools --yes-headroom-mcp
```

Headroom needs Python 3.10 or later plus `uv` or `pipx`. AIOS installs the tested range `headroom-ai[all]>=0.31.0,<0.32.0` into an isolated tool environment; it does not silently modify the system Python environment.

`--yes-compression-tools` authorizes package installation. `--yes-headroom-mcp` is deliberately separate because it authorizes a change to a client user configuration. A dry run reports the planned state without downloading packages or writing configuration.

## RTK and Caveman

RTK is the local command-output layer. After initialization, it can filter supported command output before the agent reads it. Continue to prefer bounded commands so important errors and paths remain visible:

```bash
rg -n "pattern" path
git diff --stat
sed -n '120,180p' file.ts
tail -n 120 test.log
```

Caveman is a local prompt skill that shortens the agent's wording. It should preserve commands, paths, errors, dates, decisions, risks, and missing verification. It is useful for status updates and checkpoints; switch back to normal style when a detailed explanation is more useful.

## Headroom: MCP is explicit, wrapper support is separate

Headroom's upstream CLI has official `wrap` targets for some clients. A wrapped client can use Headroom's own proxy and lifecycle. **AIOS v3.6.0 does not claim that `aios init` automatically wraps every client launch.** Installing Headroom and registering an MCP server are not the same operation.

For clients without an upstream wrap target in this integration, AIOS uses the client's own MCP command to register the official `headroom mcp serve` process:

| Client | v3.6.0 route | Important condition |
| --- | --- | --- |
| Gemini CLI | User-scope official MCP registration | Requires the separate MCP consent. |
| Grok Build | User-scope official MCP registration | Requires the separate MCP consent. |
| Hermes Agent | User-scope official MCP registration | Must be completed in a real TTY; otherwise the status is `pending-interactive`. |

The MCP server exposes `headroom_compress`, `headroom_retrieve`, and `headroom_stats`. A model calls these tools explicitly. Usually it has already seen the original material before it requests compression, so the current turn may save nothing and can cost an extra tool call. The benefit is that later steps can retain a compact result and retrieve the original by reference when necessary.

AIOS records registrations it owns in `~/.aios/integrations/headroom-mcp.json`. If an existing `headroom` entry is external or differs from the expected fingerprint, the installer reports `external` or `conflict` and does not overwrite it.

### ContextDB Packets

For session history compression:

```bash
npm run contextdb -- context:pack \
  --session <session-id> \
  --limit 80 \
  --token-budget 1200 \
  --token-strategy balanced
```

| Strategy | When to use | What it does |
| --- | --- | --- |
| `balanced` | Default | Compresses low-signal text, keeps errors and recent work |
| `aggressive` | Very small budgets | Maximum compression, minimal detail |
| `legacy` | Old behavior | Only keeps the tail end of history |

**What gets preserved** (never dropped):

- Error messages and failure signals
- File paths and command outputs
- Recent state and decisions

## Practical decision order

Before adding code, dependencies, files, or broad context, use this decision order inspired by [Ponytail](https://github.com/DietrichGebert/ponytail):

1. Can the request be solved by an explanation, configuration change, or a smaller edit?
2. Is there an existing function, document, or tool that already covers it?
3. Can a focused query replace a full repository, page, or log read?
4. Only then add the smallest tested implementation that satisfies the requirement.

For browser work, read compact evidence first: semantic snapshot, targeted text, full text, full HTML, then a screenshot only when visual evidence is necessary.

## Privacy and measurement


- RTK and Caveman run locally. Installing Headroom can access package repositories and optional model resources.
- A Headroom wrapper or the user's normal client still sends model requests to the configured model provider; local compression is not a promise that provider traffic disappears.
- Treat upstream saving percentages as upstream benchmarks, not local AIOS evidence. Claim measured MCP savings only when `headroom_stats` shows both compressions and positive saved-token totals.

## Further reading

- [v3.6.0 release notes](changelog.md)
- [Headroom and Ponytail workflow article](https://cli.rexai.top/blog/2026-07-headroom-token-intelligence/)
- [ContextDB](contextdb.md)
- [Ponytail upstream project](https://github.com/DietrichGebert/ponytail)
