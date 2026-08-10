---
title: "Windows AI Coding Agent Setup: Install and Verify in 10 Minutes"
description: "Set up an AI coding agent on Windows with PowerShell: install AIOS, fix PATH issues, initialize a project, verify client sync, and recover common failures — a complete low-friction guide."
date: 2026-08-10
schema_type: techarticle
---

# Windows AI Coding Agent Setup: Install and Verify in 10 Minutes

> **Quick Answer:** On Windows, install AIOS with one PowerShell command, reload your profile, run `aios init --all` in your project, and verify with `aios doctor --native --verbose`. If `aios` is not recognized afterward, the PATH entry was not reloaded — restart the shell or add the install directory to PATH manually. Total time: under 10 minutes for a working, verified setup.

## What you need

- Windows 10/11 with PowerShell 5.x or 7
- Git
- Node.js 24 LTS
- At least one coding client: Codex, Claude Code, Gemini CLI, OpenCode, Hermes, or Grok

## Install in one command

Open PowerShell and run:

```powershell
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
irm https://github.com/rexleimo/aios/releases/latest/download/aios-install.ps1 | iex
```

Then reload the profile so the `aios` command resolves:

```powershell
. $PROFILE
aios --version
```

## Initialize and verify

```powershell
cd C:\path\to\your\project
aios init --all
aios doctor --native --verbose
```

`aios init --all` creates the project marker and detects supported clients. `aios doctor` reports ContextDB, client sync, and safety checks — fix the first actionable item it lists.

## Recovering common failures

| Symptom | Fix |
| --- | --- |
| `aios` is not recognized | Reload the profile (`. $PROFILE`) or reopen PowerShell; if it still fails, add the AIOS install directory to PATH manually. |
| `aios init` fails partway | Re-run `aios init --all` from the project root; the initializer is idempotent. |
| Doctor reports client drift | Run `aios doctor --native --verbose`, inspect the dry run, then apply the suggested fix. |
| TLS errors on install | Set `[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12` before the install command. |

## FAQ

**Does AIOS work on Windows PowerShell 5.1?**
Yes — the installer and wrapper support PowerShell 5.x and 7.

**Do I need WSL?**
No. AIOS installs natively on Windows; WSL is optional.

**Can I use Windows Terminal?**
Yes — AIOS works in Windows Terminal, PowerShell ISE, and standard PowerShell consoles.

## Next step

Read the full [Windows Guide](https://cli.rexai.top/windows-guide/) for recovery procedures, or start with the [Quick Start](https://cli.rexai.top/getting-started/).
