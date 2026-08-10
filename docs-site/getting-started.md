---
title: Quick Start — Install AIOS for Claude Code, Codex, and Gemini
description: Install AIOS on macOS, Linux, or Windows, run aios init --all, and verify ContextDB plus client sync with aios doctor in under five minutes.
schema_type: howto
howto_steps:
  - name: "Install the stable release"
    text: "Run curl -fsSL https://github.com/rexleimo/aios/releases/latest/download/aios-install.sh | bash on macOS/Linux, or the aios-install.ps1 one-liner on Windows PowerShell."
  - name: "Initialize a project"
    text: "Run aios init --all from the project root to create the .aios marker and detect supported coding clients."
  - name: "Start the first client"
    text: "Open codex, claude, gemini, opencode, hermes, or grok in the project directory so the detected guidance is available."
  - name: "Verify the installation"
    text: "Run aios doctor --native --verbose to confirm ContextDB, client sync, and safety checks."
---

# Quick Start

## Quick Answer

AIOS is a local workflow layer for supported coding clients. The current onboarding path is: install the release, run aios init --all from the project root, then inspect the result with aios doctor --native --verbose. This creates or updates project guidance and the ContextDB registry marker; it does not replace your client or inject every historical event into every prompt.

## What you need

- Node.js 24 LTS and npm
- Git
- At least one supported client: codex, claude, gemini, opencode, hermes, or grok (Grok Build)
- A project directory where the client guidance and local memory should live

Check Node.js before installing:

~~~bash
node -v
npm -v
~~~

## Install the stable release

=== "macOS / Linux"

    ~~~bash
    curl -fsSL https://github.com/rexleimo/aios/releases/latest/download/aios-install.sh | bash
    source ~/.zshrc
    ~~~

    For bash, reload the profile that owns your PATH, such as source ~/.bashrc.

=== "Windows PowerShell"

    ~~~powershell
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; irm https://github.com/rexleimo/aios/releases/latest/download/aios-install.ps1 | iex
    . $PROFILE
    ~~~

The release installer is the recommended path. Clone the repository only when you intentionally need unreleased source code.

## Initialize a project

From the project root:

~~~bash
aios init --all
aios doctor --native --verbose
~~~

aios init is safe to repeat. It writes the current project integration marker and synchronizes supported client guidance that is present in the repository. The marker points to .aios/context-db/index.json, which is the local registry for pull-based ContextDB context.

For unattended setup, make each external permission explicit:

~~~bash
node scripts/aios.mjs init --all --yes-compression-tools --yes-headroom-mcp
~~~

- --yes-compression-tools authorizes unattended RTK, Caveman, and Headroom package installation.
- --yes-headroom-mcp authorizes user-scope Headroom MCP registration for clients that support that route.
- --dry-run previews the planned changes without downloading packages or writing client configuration.

## Start the first client

Start a supported client from the same project directory:

~~~bash
codex
# or: claude
# or: gemini
# or: opencode
# or: hermes
# or: grok
~~~

The client can use the project registry to find relevant instructions and memory. ContextDB is pull-based: use unified search, memo, checkpoints, or a context pack when the task needs earlier project facts.

## Verify the installation

Run the diagnostic command again after starting the client:

~~~bash
aios doctor --native --verbose
ls .aios/context-db/
~~~

Look for the actual checks and paths in the diagnostic output. A warning is not evidence that a provider or client route works; for live routes, run a small task and preserve its status or verification output.

If you changed a shell profile, reload it before retrying:

=== "macOS / Linux"

    ~~~bash
    source ~/.zshrc
    ~~~

=== "Windows PowerShell"

    ~~~powershell
    . $PROFILE
    ~~~

## Legacy compatibility switch

Some older compatibility scripts still recognize .contextdb-enable as an opt-in marker. It is not the primary setup path for current installations.

=== "macOS / Linux"

    ~~~bash
    touch .contextdb-enable
    ~~~

=== "Windows PowerShell"

    ~~~powershell
    New-Item -ItemType File -Path .contextdb-enable -Force
    ~~~

Use this only when an older wrapper or compatibility workflow explicitly requires it. Current projects should use aios init and the .aios/context-db/index.json marker. Creating the legacy file does not migrate existing memory or prove that a client is synchronized.

## Save and search a project decision

~~~bash
aios memo add "Keep authentication tests strict"
aios memo search "authentication"
aios memo storage status
~~~

Memo records are local project data. By default, project memos use append-only JSONL under .aios/memo/file/events.jsonl. The ContextDB page explains storage, scope, rebuilds, and context packs.

## Common recovery commands

~~~bash
aios doctor --native --verbose
aios doctor --native --fix
node scripts/aios.mjs init --all --dry-run
~~~

Use the dry run first when you are unsure whether a client configuration or package installation will change. Keep the diagnostic output when asking for help.

## FAQ

### Does AIOS replace codex, claude, or another client?

No. You continue to launch the underlying client. AIOS adds local memory, workflow routes, optional tools, and verification guidance around it.

### Does aios init upload project memory?

The project registry and memo files are local files. Client providers and optional package or MCP setup still follow their own network and provider boundaries; local installation is not a promise that all later model traffic stays on the machine.

### Will every client share the same memory?

Clients in the same project can use the same ContextDB registry when their integration is supported and synchronized. Run aios doctor --native --verbose to see what is actually configured.

### How do I disable current project memory?

Stop the client, remove or adjust the project integration marker according to the client guidance, and inspect the existing .aios/ data before deleting anything. The legacy .contextdb-enable file can be removed when an older workflow used it; deleting the marker alone does not erase historical files.

## Where to go next

| Need | Page |
| --- | --- |
| Understand project memory and unified search | [ContextDB](contextdb.md) |
| Choose direct, guarded, or planned work | [Workflow Policy](workflow-policy.md) |
| Run independent work in parallel | [Agent Team](team-ops.md) |
| Run a resumable long task | [Solo Harness](solo-harness.md) |
| Diagnose a failed setup | [Troubleshooting](troubleshooting.md) |
| See the commands by intent | [Use Cases](use-cases.md) |
