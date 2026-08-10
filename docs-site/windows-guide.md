---
title: Windows Guide: PowerShell Setup and Recovery
description: Install AIOS on Windows with PowerShell, initialize a project, verify client sync, and recover common PATH or configuration issues.
schema_type: howto
howto_steps:
  - name: "Install and reload PowerShell"
    text: "Run [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; irm https://github.com/rexleimo/aios/releases/latest/download/aios-install.ps1 | iex, then reload the profile."
  - name: "Initialize and verify a project"
    text: "Run aios init --all from the project root, then aios doctor --native --verbose."
  - name: "Recover common failures"
    text: "If aios is not recognized, fix the PATH entry; if initialization fails, re-run init and inspect the first actionable error."
---

# Windows Guide

## Quick Answer

Use PowerShell 5.x or 7, force TLS 1.2 for the release installer, reload the profile, and run aios init --all followed by aios doctor --native --verbose. The diagnostic output is the source of truth for PATH, Node.js, client sync, and native integration status.

## Prerequisites

Check the shell and runtime:

~~~powershell
$PSVersionTable.PSVersion
node -v
npm -v
git --version
~~~

Use Node.js 24 LTS. If the installer is blocked by an execution policy, follow your organization's policy; do not paste credentials or profile contents into a support request.

## Install and reload PowerShell

~~~powershell
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; irm https://github.com/rexleimo/aios/releases/latest/download/aios-install.ps1 | iex
. $PROFILE
~~~

If the profile file does not exist yet:

~~~powershell
New-Item -ItemType File -Path $PROFILE -Force
. $PROFILE
~~~

Open a new PowerShell window when a profile reload does not update PATH.

## Initialize and verify a project

From the project root:

~~~powershell
aios init --all
aios doctor --native --verbose
~~~

The project marker points to .aios/context-db/index.json. Start the client only after reading the diagnostic result:

~~~powershell
codex
# or: claude
# or: gemini
# or: opencode
# or: hermes
# or: grok
~~~

For unattended setup with explicit consent:

~~~powershell
node scripts/aios.mjs init --all --yes-compression-tools --yes-headroom-mcp
~~~

Use --dry-run to preview changes without writing packages or client configuration.

## Recovery commands

### aios is not recognized

~~~powershell
Get-Command aios -ErrorAction SilentlyContinue
$env:Path -split ';'
. $PROFILE
~~~

If it is still missing, open a new PowerShell process and run the release installer again.

### Node.js is the wrong version

~~~powershell
node -v
where.exe node
npm -v
~~~

Install or select Node.js 24 LTS, reload the profile, and run aios doctor again. Keep the first failing path in the diagnostic output.

### Native client sync is incomplete

~~~powershell
aios doctor --native --verbose
aios doctor --native --fix
node scripts/aios.mjs init --all --dry-run
~~~

Review the dry-run plan before applying a fix. Client support and route depth can differ; a successful dry run is not a live provider test.

### Project memory is not visible

~~~powershell
Test-Path .aios\context-db\index.json
Get-ChildItem .aios -Force
aios doctor --native --verbose
~~~

Confirm that you ran aios init from the intended project root. The legacy .contextdb-enable file is only for older compatibility scripts; current setup uses the .aios/context-db/index.json marker.

## FAQ

### Does the Windows installer replace my coding client?

No. It installs the AIOS layer and its supported integrations. You still run codex, claude, gemini, opencode, hermes, or grok.

### Why force TLS 1.2?

Some Windows PowerShell environments negotiate an older protocol by default. Setting TLS 1.2 for the installer request makes the intended HTTPS connection explicit; it does not change later client or provider network behavior.

### What should I include in a bug report?

Include the command, exit code, Node and PowerShell versions, and the relevant aios doctor output. Redact tokens, cookies, private paths, and client credentials.

## Next steps

- [Quick Start](getting-started.md) - the cross-platform install flow.
- [Troubleshooting](troubleshooting.md) - symptom-based diagnosis.
- [Workflow Policy](workflow-policy.md) - choose a route after setup.
