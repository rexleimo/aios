# AIOS

[![Release](https://img.shields.io/github/v/release/rexleimo/aios?display_name=tag&sort=semver)](https://github.com/rexleimo/aios/releases)
[![Docs](https://img.shields.io/badge/docs-cli.rexai.top-0ea5e9)](https://cli.rexai.top)
[![License](https://img.shields.io/github/license/rexleimo/aios)](https://github.com/rexleimo/aios)
[![Node](https://img.shields.io/badge/node-24%20LTS-339933)](https://nodejs.org)

> **One sentence. Any complex task. Done.**
> AIOS makes your AI coding agent actually finish the job — memory, verification, and multi-agent collaboration, all from a single instruction. Works with `codex`, `claude`, `gemini`, `opencode`, `hermes`, and `grok`.

[Docs](https://cli.rexai.top) · [Quick Start](https://cli.rexai.top/getting-started/) · [Blog](https://cli.rexai.top/blog/) · [中文](README-zh.md)

![AIOS architecture overview](docs-site/assets/visual-architecture-overview.svg)

## Why AIOS

**One sentence. Any complex task. Done.** That's the promise.

Your AI coding agent (Codex, Claude Code, Gemini CLI, OpenCode, Hermes, Grok) is smart — but it forgets everything between sessions, can't coordinate complex multi-step work, and has no way to verify its own output. AIOS fixes all of that:

| You say | AIOS does |
| —- | --- |
| "Refactor the auth module" | Remembers last week's decisions, picks the right approach, makes the change, and verifies it works |
| "Review this PR and update tests" | Splits the work across parallel agents, keeps coupled changes in order, collects evidence |
| "Finish the release handoff overnight" | Runs the full objective with checkpoints, resumes if interrupted, delivers verified results |
| "Fix the login bug" | Recalls relevant context, routes to the simplest fix path, checks the fix before showing you |

**Your data stays local.** Everything — memory, logs, verification — runs on your machine. Nothing leaves.

**You don't change how you work.** Keep using the coding client you already have. AIOS adds what it's missing.

## Install in 30 seconds

macOS / Linux:

```bash
curl -fsSL https://github.com/rexleimo/aios/releases/latest/download/aios-install.sh | bash
source ~/.zshrc   # or ~/.bashrc
aios init --all
aios doctor --native --verbose
```

Windows PowerShell:

```powershell
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
irm https://github.com/rexleimo/aios/releases/latest/download/aios-install.ps1 | iex
. $PROFILE
aios init --all
aios doctor --native --verbose
```

Run these from a **project root** when you want project-level guidance and memory.

Unattended install:

```bash
node scripts/aios.mjs init --all --yes-compression-tools --yes-headroom-mcp
```

## How it fits together

```text
Your coding client (codex / claude / gemini / opencode / hermes / grok)
        │
        ▼
  AIOS guidance + Workflow Policy
        │
        ├── ContextDB   local project memory (pull-based)
        ├── rex-harness software control plane (Fact → Capability → Evidence)
        ├── Team / Solo long-running or parallel work
        └── Doctor / Privacy / verification evidence
```

![Workflow policy routes](docs-site/assets/visual-workflow-policy.svg)

`rex-harness` is a required planning runtime for AIOS. Release installers already bundle the pinned submodule, so a normal release install does **not** need a second npm package or MCP service. From source:

```bash
git clone --recurse-submodules https://github.com/rexleimo/aios.git
```

If the clone skipped submodules, `aios init` / `aios setup` will try `git submodule update --init --recursive -- rex-harness` and stop with a clear fix if recovery fails.

Rex is the default workflow for new installs. Superpowers is retired as an AIOS workflow component. See the [Rex Workflow Migration](https://cli.rexai.top/superpowers/) guide.

## Quick tour

```bash
# Initialize project marker + detected client guidance
aios init --all

# Inspect install, native client sync, safety checks
aios doctor --native --verbose

# Save and search a durable project decision
aios memo add "Keep authentication tests strict"
aios memo search "authentication"

# Parallel work or a resumable objective
aios work "Review the auth module and update its tests"
aios team 3:codex "Review the auth module and update its tests"
aios harness run --objective "Finish the release handoff" --worktree

# Preview adaptive routing without creating a live plan
node scripts/aios.mjs plan auto-gate --task "Refactor the auth module" --dry-run --json
```

The project marker points clients at `.aios/context-db/index.json`. ContextDB is **pull-based**: agents search or recall relevant material instead of receiving the whole history on every prompt.

![ContextDB memory loop](docs-site/assets/visual-contextdb-memory-loop.svg)

## Supported clients

Native or compatibility integrations for:

`codex` · `claude` · `gemini` · `opencode` · `hermes` · `grok` (Grok Build)

Feature depth varies by client. Run `aios doctor --native --verbose` instead of assuming every route exists everywhere.

## Documentation map

| Intent | Start here |
| --- | --- |
| Install and verify | [Quick Start](https://cli.rexai.top/getting-started/) |
| Windows recovery | [Windows Guide](https://cli.rexai.top/windows-guide/) |
| Choose the right route | [Workflow Policy](https://cli.rexai.top/workflow-policy/) |
| Project memory | [ContextDB](https://cli.rexai.top/contextdb/) |
| Token / compression boundaries | [Token Intelligence](https://cli.rexai.top/token-compression/) |
| Parallel agents | [Agent Team](https://cli.rexai.top/team-ops/) |
| Overnight / resumable work | [Solo Harness](https://cli.rexai.top/solo-harness/) |
| Commands by intent | [Use Cases](https://cli.rexai.top/use-cases/) |
| Runtime layers | [Architecture](https://cli.rexai.top/architecture/) |
| Releases & tutorials | [Blog](https://cli.rexai.top/blog/) |

## Requirements

- Git
- Node.js **24 LTS** and npm
- Windows: PowerShell 5.x or 7
- At least one supported coding client

## Development

```bash
git clone --recurse-submodules https://github.com/rexleimo/aios.git
cd aios
npm run test:scripts
cd mcp-server && npm run typecheck && npm test && npm run build
```

When a canonical Skill changes, certify and verify training evidence before commit:

```bash
node scripts/aios.mjs skill certify --changed --base HEAD --json
node scripts/aios.mjs skill verify-training --changed --base HEAD --json
```

## Subprojects

| Path | Role |
| --- | --- |
| [`rex-harness/`](rex-harness/) | Standalone software-engineering control plane (Fact / Capability / Evidence) |
| [`mcp-server/`](mcp-server/) | Legacy Playwright MCP compatibility path; default browser path is browser-use CDP |

## License

Licensed under the [MIT License](LICENSE).

Copyright (c) 2026 Rex.

You may use, modify, and distribute this software, including for derivative
works, provided that the original copyright notice and permission notice are
retained in all copies or substantial portions of the Software.
