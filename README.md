# Harness CLI (AIOS)

> A local-first workflow layer for \`codex\`, \`claude\`, \`gemini\`, \`opencode\`, \`hermes\`, and \`grok\` (Grok Build). It adds project memory, collaboration, routing, and verification without replacing the coding client you already use.

[Docs](https://cli.rexai.top) | [Quick Start](https://cli.rexai.top/getting-started/) | [Workflow Policy](https://cli.rexai.top/workflow-policy/) | [Blog](https://cli.rexai.top/blog/) | [Friends](https://cli.rexai.top/friends/) | [Changelog](https://cli.rexai.top/changelog/) | [GitHub](https://github.com/rexleimo/harness-cli)

## Quick Start

macOS / Linux:

\`\`\`bash
curl -fsSL https://github.com/rexleimo/harness-cli/releases/latest/download/aios-install.sh | bash
source ~/.zshrc
aios init --all
aios doctor --native --verbose
\`\`\`

Windows PowerShell:

\`\`\`powershell
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; irm https://github.com/rexleimo/harness-cli/releases/latest/download/aios-install.ps1 | iex
. $PROFILE
aios init --all
aios doctor --native --verbose
\`\`\`

Run the commands from a project root when you want project-level client guidance and memory. For unattended setup, use \`node scripts/aios.mjs init --all --yes-compression-tools --yes-headroom-mcp\`; these flags explicitly authorize package installation and user-scope MCP registration.

## What Harness CLI adds

Harness CLI is a set of cooperating layers. Each layer has a different responsibility and an explicit boundary:

| Layer | What it provides | Start here |
| --- | --- | --- |
| **ContextDB** | Pull-based project memory, memos, checkpoints, and searchable context packs | \`aios init\` and [ContextDB](https://cli.rexai.top/contextdb/) |
| **Workflow Policy** | Risk-based \`noop\`, \`direct\`, \`guarded\`, and \`planned\` routing, with explicit plan persistence | [Workflow Policy](https://cli.rexai.top/workflow-policy/) |
| **Agent Team / Solo Harness** | Parallel collaboration or resumable long-running work with status and evidence | \`aios team\` / \`aios harness run\` |
| **RTK** | Local filtering for noisy shell and tool output | \`aios init --all\` |
| **Caveman** | A concise response-style skill that keeps technical facts visible | \`aios init --all\` |
| **Headroom MCP** | Explicit, on-demand compression and retrieval through supported MCP clients | \`aios init --all --yes-headroom-mcp\` |
| **Verification and Privacy** | Tests, diagnostics, quality gates, and redaction before sensitive sharing | \`aios doctor\` / \`aios privacy\` |

RTK, Caveman, and Headroom have different integration boundaries. Harness CLI does not claim that every client launch is automatically wrapped, that provider traffic disappears, or that a compression percentage applies to your project without measurement.

## A small tour

\`\`\`bash
# Initialize the project marker and detected client guidance.
aios init --all

# Inspect installation, native client sync, and safety checks.
aios doctor --native --verbose

# Save and search a durable project decision.
aios memo add "Keep authentication tests strict"
aios memo search "authentication"

# Choose a route for independent work or a resumable objective.
aios team 3:codex "Review the auth module and update its tests"
aios harness run --objective "Finish the release handoff" --worktree

# Preview the adaptive workflow decision without creating a live plan.
node scripts/aios.mjs plan auto-gate --task "Refactor the auth module" --dry-run --json
\`\`\`

The project marker points clients to \`.aios/context-db/index.json\`. ContextDB is pull-based: the agent can search or recall relevant project material instead of receiving the whole history on every prompt. The exact files and commands are described in [ContextDB](https://cli.rexai.top/contextdb/).

## Supported clients

Harness CLI currently provides native or compatibility integrations for \`codex\`, \`claude\`, \`gemini\`, \`opencode\`, \`hermes\`, and \`grok\` (Grok Build). Feature depth varies by client; run \`aios doctor --native --verbose\` to inspect the local installation rather than assuming every client supports every route.

## Documentation map

- [Quick Start](https://cli.rexai.top/getting-started/) - install, initialize, and verify the first project.
- [Windows Guide](https://cli.rexai.top/windows-guide/) - PowerShell prerequisites and recovery commands.
- [Workflow Policy](https://cli.rexai.top/workflow-policy/) - choose the smallest correct route and understand plan continuation.
- [ContextDB](https://cli.rexai.top/contextdb/) - local storage, unified search, memo scope, and context packs.
- [Token Intelligence](https://cli.rexai.top/token-compression/) - RTK, Caveman, Headroom MCP, and safe context boundaries.
- [Agent Team](https://cli.rexai.top/team-ops/) - governed parallel work with HUD evidence.
- [Solo Harness](https://cli.rexai.top/solo-harness/) - resumable long-running work.
- [Use Cases](https://cli.rexai.top/use-cases/) - commands organized by user intent.
- [Architecture](https://cli.rexai.top/architecture/) - runtime layers and compatibility boundaries.
- [Troubleshooting](https://cli.rexai.top/troubleshooting/) - observable symptoms and recovery steps.
- [Blog](https://cli.rexai.top/blog/) - tutorials, release notes, and reproducible workflows.

## Requirements

- Git
- Node.js 24 LTS and npm
- Windows: PowerShell 5.x or 7
- At least one supported coding client

## Development

\`\`\`bash
git clone https://github.com/rexleimo/harness-cli.git
cd harness-cli
npm run test:scripts
cd mcp-server
npm run typecheck
npm test
npm run build
\`\`\`

## License

See [CHANGELOG.md](CHANGELOG.md) for version history.
