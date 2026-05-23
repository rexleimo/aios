# Windows Installer And TUI Fix

## Problem

Windows users can see this before the installer script is downloaded:

```powershell
irm https://github.com/rexleimo/harness-cli/releases/latest/download/aios-install.ps1 | iex
# Invoke-RestMethod: The request was aborted: The connection was closed unexpectedly.
```

## Root Cause

The failure happens on the first GitHub HTTPS request. Windows PowerShell 5.1 can start with a legacy or default .NET security protocol configuration that does not guarantee TLS 1.2, and GitHub closes non-compliant TLS handshakes before returning the release asset.

The already-downloaded installer also needs the same guard before it fetches `harness-cli.zip`.

A second Windows failure mode can leave `aios` installed but non-operational: native commands such as `npm install --include=dev` can fail without PowerShell throwing, because external process exit codes do not trigger `$ErrorActionPreference = 'Stop'`. That can skip required TUI dependencies (`commander`, `ink`, `@inkjs/ui`, `tsx`) and make `aios` fail after install.

The TUI also needs a real terminal (`stdin`/`stdout` TTY with raw keyboard input). In non-interactive shells, Ink cannot read arrow keys and reports that raw mode is unsupported.

## Fix Plan

1. Document a TLS 1.2 bootstrap in all Windows PowerShell install one-liners.
2. Enable TLS 1.2 inside `scripts/aios-install.ps1` before any release asset download.
3. Enable TLS 1.2 in runtime self-update before fetching the PowerShell installer.
4. Make the PowerShell installer fail fast when `npm`, shell setup, or first-run setup exits non-zero.
5. Start the TUI through the installed local `tsx` CLI instead of `npx`.
6. Add explicit TTY/raw-mode diagnostics for non-interactive TUI launches.
7. Add static regression checks for installer, self-update, and TUI startup code paths.

## Verification

- `node --test scripts/tests/release-pipeline.test.mjs scripts/tests/platform-smoke.test.mjs`
- `npm run test:scripts`
