# RexCLI (AIOS)

> A local agent workflow layer that adds memory, collaboration, and verification to `codex` / `claude` / `gemini` / `opencode`.

[Docs](https://cli.rexai.top) | [Quick Start](https://cli.rexai.top/getting-started/) | [Case Library](https://cli.rexai.top/case-library/) | [GitHub](https://github.com/rexleimo/rex-cli)

## Install

macOS / Linux:

```bash
curl -fsSL https://github.com/rexleimo/rex-cli/releases/latest/download/aios-install.sh | bash
source ~/.zshrc
aios
```

Windows PowerShell:

```powershell
irm https://github.com/rexleimo/rex-cli/releases/latest/download/aios-install.ps1 | iex
. $PROFILE
aios
```

Once started, select `Setup`, run `Doctor`, and you're ready to go.

## Core Capabilities

| Capability | Description | Command |
|------------|-------------|---------|
| **ContextDB** | Cross-session project memory with events, checkpoints, and context packs | auto-loaded by `codex` / `claude` |
| **Native Token Compression** | Self-contained input/output token reduction inspired by RTK/Caveman patterns, without installing competitor tools | `context:pack --token-budget 1200 --token-strategy balanced` |
| **Model Router** | Intelligent multi-model dispatch for Agent Teams — match tasks to optimal model by capability, cost, and success rate | `node scripts/aios.mjs model-router route --task "..."` |
| **Agent Team** | Multi-agent parallel collaboration with HUD visual tracking | `aios team 3:codex "task description"` |
| **Solo Harness** | Single-agent overnight tasks with resume support and run journal | `aios harness run --objective "goal" --worktree` |
| **Perception** | Content outcome tracking + statistical insights + perception injection | `aios perception record` / `insights` / `summary` |
| **Browser MCP** | Stealth browser automation over CDP | `aios internal browser doctor` |
| **Superpowers** | Reusable workflow skills (brainstorm/plan/debug/verify) | Select from TUI |
| **Privacy Guard** | Auto-redact sensitive files before sharing | `aios privacy status` |

## Quick Tour

```bash
# Launch TUI
aios

# Multi-agent collaboration
aios team 3:codex "Refactor the auth module and run tests"

# Single-agent overnight task
aios harness run --objective "Finish the handoff docs for tomorrow" --worktree

# Intelligent model routing
node scripts/aios.mjs model-router route --task "Review auth.js for security issues"

# Native token-compressed ContextDB packet
cd mcp-server && npm run contextdb -- context:pack --session <session_id> --token-budget 1200 --token-strategy balanced

# Content outcome tracking
aios perception record --content-id note_001 --platform xiaohongshu --content-type note --title "Test" --metrics '{"likes":100}'

# Check task status
aios team status --provider codex --watch
```

## How It Works

```text
User → codex / claude / gemini
     → zsh wrapper (transparent)
     → ctx-agent.mjs (ContextDB integration)
        → contextdb CLI (memory persistence)
        → launch native CLI (with context pack)
     → browser MCP (optional browser automation)
```

After installation, just use `codex`, `claude`, or `gemini` as usual — RexCLI automatically loads project memory in the background.

## Docs

- [Quick Start](https://cli.rexai.top/getting-started/) — Install, configure, first run
- [Model Router](https://cli.rexai.top/model-router/) — Multi-model dispatch for Agent Teams
- [ContextDB](https://cli.rexai.top/contextdb/) — Project memory system
- [Agent Team](https://cli.rexai.top/team-ops/) — Multi-agent collaboration guide
- [Solo Harness](https://cli.rexai.top/solo-harness/) — Overnight task guide
- [Perception](https://cli.rexai.top/perception/) — Content outcome tracking & insights
- [Architecture](https://cli.rexai.top/architecture/) — System architecture
- [Troubleshooting](https://cli.rexai.top/troubleshooting/) — Common issues
- [Use Cases](https://cli.rexai.top/use-cases/) — Find commands by scenario

## Requirements

- Git
- Node.js 22 LTS + npm
- Windows: PowerShell 5.x or 7

## Development

```bash
git clone https://github.com/rexleimo/rex-cli.git
cd rex-cli
```

Verify:

```bash
cd mcp-server
npm test
npm run typecheck
npm run build
```

## License

See [CHANGELOG.md](CHANGELOG.md) for version history.
