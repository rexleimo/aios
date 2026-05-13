# ContextDB transparent command wrappers for PowerShell.
# Source this file in PowerShell profile to make codex/claude/gemini/opencode/kiro-cli auto-load context packets.
# Optional env vars:
# - ROOTPATH
# - CTXDB_SHELL_BRIDGE
# - CTXDB_RUNNER
# - CTXDB_REPO_NAME
# - CTXDB_WRAP_MODE
# - CTXDB_MARKER_FILE
# - CTXDB_AUTO_CREATE_MARKER
# - CTXDB_INTERACTIVE_AUTO_ROUTE
# - CTXDB_HARNESS_PROVIDER
# - CTXDB_HARNESS_MAX_ITERATIONS
# - CTXDB_PRIVACY_BANNER
# - CTXDB_PRIVACY_COLOR

$script:CTXDB_LAST_WORKSPACE = ""

function Normalize-CodexHome {
  $codexHome = $env:CODEX_HOME
  if (-not $codexHome) {
    return
  }

  if ($codexHome -eq "~") {
    $codexHome = $HOME
  } elseif ($codexHome -match '^~[\\/](.*)$') {
    $codexHome = Join-Path $HOME $Matches[1]
  }

  # Resolve relative CODEX_HOME (e.g. ".codex") against current working directory.
  if (-not [System.IO.Path]::IsPathRooted($codexHome)) {
    $cwd = (Get-Location).Path
    $codexHome = [System.IO.Path]::GetFullPath((Join-Path $cwd $codexHome))
  } else {
    $codexHome = [System.IO.Path]::GetFullPath($codexHome)
  }
  $env:CODEX_HOME = $codexHome

  if (-not (Test-Path $codexHome)) {
    New-Item -Path $codexHome -ItemType Directory -Force | Out-Null
  }
}

function Resolve-BridgePath {
  if ($env:CTXDB_SHELL_BRIDGE -and (Test-Path -LiteralPath $env:CTXDB_SHELL_BRIDGE)) {
    return $env:CTXDB_SHELL_BRIDGE
  }

  if ($env:ROOTPATH) {
    $candidate = Join-Path $env:ROOTPATH "scripts/contextdb-shell-bridge.mjs"
    if (Test-Path -LiteralPath $candidate) {
      return $candidate
    }
  }

  return $null
}

function Update-LastWorkspace {
  try {
    $gitRoot = (& git -C (Get-Location).Path rev-parse --show-toplevel 2>$null)
    if ($LASTEXITCODE -eq 0 -and $gitRoot) {
      $script:CTXDB_LAST_WORKSPACE = ($gitRoot | Select-Object -First 1).Trim()
    }
  } catch {
    # best effort only
  }
}

function Invoke-NativeCommand {
  param(
    [string]$Name,
    [string[]]$Arguments
  )

  $cmd = Get-Command $Name -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $cmd) {
    Write-Error "Command not found: $Name"
    return 127
  }

  & $cmd.Source @Arguments
  return $LASTEXITCODE
}

function Invoke-BridgeOrPassthrough {
  param(
    [string]$Agent,
    [string]$Passthrough,
    [string[]]$Arguments
  )

  $bridge = Resolve-BridgePath
  if (-not $bridge) {
    return (Invoke-NativeCommand -Name $Passthrough -Arguments $Arguments)
  }

  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    return (Invoke-NativeCommand -Name $Passthrough -Arguments $Arguments)
  }

  Update-LastWorkspace
  # Avoid bricking interactive wrappers if someone left CTXDB_PACK_STRICT=1 in
  # their environment. Quality gates can still enforce strict mode explicitly.
  $prevStrict = $env:CTXDB_PACK_STRICT
  $strictInteractive = if ($env:CTXDB_PACK_STRICT_INTERACTIVE) { $env:CTXDB_PACK_STRICT_INTERACTIVE.Trim().ToLowerInvariant() } else { "" }
  $allowStrict = $strictInteractive -in @("1", "true", "yes", "on")
  if (-not $allowStrict) {
    $env:CTXDB_PACK_STRICT = "0"
  }

  try {
    & node $bridge "--agent" $Agent "--command" $Passthrough "--" @Arguments
    return $LASTEXITCODE
  } finally {
    if ($allowStrict) {
      # no-op
    } elseif ($null -eq $prevStrict) {
      Remove-Item Env:CTXDB_PACK_STRICT -ErrorAction SilentlyContinue | Out-Null
    } else {
      $env:CTXDB_PACK_STRICT = $prevStrict
    }
  }
}

function codex {
  param([Parameter(ValueFromRemainingArguments = $true)] [string[]]$Args)

  Normalize-CodexHome
  $global:LASTEXITCODE = Invoke-BridgeOrPassthrough -Agent "codex-cli" -Passthrough "codex" -Arguments $Args
}

function claude {
  param([Parameter(ValueFromRemainingArguments = $true)] [string[]]$Args)

  $global:LASTEXITCODE = Invoke-BridgeOrPassthrough -Agent "claude-code" -Passthrough "claude" -Arguments $Args
}

function gemini {
  param([Parameter(ValueFromRemainingArguments = $true)] [string[]]$Args)

  $global:LASTEXITCODE = Invoke-BridgeOrPassthrough -Agent "gemini-cli" -Passthrough "gemini" -Arguments $Args
}

function opencode {
  param([Parameter(ValueFromRemainingArguments = $true)] [string[]]$Args)

  $global:LASTEXITCODE = Invoke-BridgeOrPassthrough -Agent "opencode-cli" -Passthrough "opencode" -Arguments $Args
}

function kiro-cli {
  param([Parameter(ValueFromRemainingArguments = $true)] [string[]]$Args)

  $global:LASTEXITCODE = Invoke-BridgeOrPassthrough -Agent "kiro-cli" -Passthrough "kiro-cli" -Arguments $Args
}

function kiro {
  param([Parameter(ValueFromRemainingArguments = $true)] [string[]]$Args)

  kiro-cli @Args
}

function aios {
  param([Parameter(ValueFromRemainingArguments = $true)] [string[]]$Args)

  $sub = if ($Args.Count -gt 0) { $Args[0] } else { "" }
  $rest = if ($Args.Count -gt 1) { $Args[1..($Args.Count - 1)] } else { @() }

  if (-not $env:ROOTPATH) {
    Write-Host "[warn] ROOTPATH is not set (install PowerShell integration first)"
    return
  }

  switch ($sub) {
    "doctor" {
      $script = Join-Path $env:ROOTPATH "scripts/verify-aios.ps1"
      if (-not (Test-Path -LiteralPath $script)) {
        Write-Host "[warn] missing verifier script: $script"
        return
      }
      & $script @rest
      $global:LASTEXITCODE = $LASTEXITCODE
      return
    }
    "update" {
      $script = Join-Path $env:ROOTPATH "scripts/update-all.ps1"
      if (-not (Test-Path -LiteralPath $script)) {
        Write-Host "[warn] missing update script: $script"
        return
      }
      & $script -Components "shell,skills" -Mode "opt-in" @rest
      $global:LASTEXITCODE = $LASTEXITCODE
      return
    }
    "privacy" {
      $script = Join-Path $env:ROOTPATH "scripts/privacy-guard.mjs"
      if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        Write-Host "[warn] node not found; privacy guard unavailable"
        $global:LASTEXITCODE = 1
        return
      }
      if (-not (Test-Path -LiteralPath $script)) {
        Write-Host "[warn] missing privacy guard script: $script"
        $global:LASTEXITCODE = 1
        return
      }

      $action = if ($rest.Count -gt 0) { $rest[0] } else { 'status' }
      $privacyArgs = if ($rest.Count -gt 1) { $rest[1..($rest.Count - 1)] } else { @() }

      switch ($action) {
        "init" { & node $script "init" @privacyArgs; $global:LASTEXITCODE = $LASTEXITCODE; return }
        "status" { & node $script "status" @privacyArgs; $global:LASTEXITCODE = $LASTEXITCODE; return }
        "set" { & node $script "set" @privacyArgs; $global:LASTEXITCODE = $LASTEXITCODE; return }
        "read" { & node $script "read" @privacyArgs; $global:LASTEXITCODE = $LASTEXITCODE; return }
        "redact" { & node $script "redact" @privacyArgs; $global:LASTEXITCODE = $LASTEXITCODE; return }
        "enable" { & node $script "set" "--enabled" "true" "--mode" "regex" "--enforce" "true" "--block-when-disabled" "true" "--detect-content" "true" @privacyArgs; $global:LASTEXITCODE = $LASTEXITCODE; return }
        "disable" { & node $script "set" "--enabled" "false" @privacyArgs; $global:LASTEXITCODE = $LASTEXITCODE; return }
        "ollama-on" { & node $script "set" "--enabled" "true" "--mode" "hybrid" "--ollama-enabled" "true" "--model" "qwen3.5:4b" @privacyArgs; $global:LASTEXITCODE = $LASTEXITCODE; return }
        "ollama-off" { & node $script "set" "--mode" "regex" "--ollama-enabled" "false" @privacyArgs; $global:LASTEXITCODE = $LASTEXITCODE; return }
        "enforce-on" { & node $script "set" "--enforce" "true" "--block-when-disabled" "true" "--detect-content" "true" @privacyArgs; $global:LASTEXITCODE = $LASTEXITCODE; return }
        "enforce-off" { & node $script "set" "--enforce" "false" "--block-when-disabled" "false" @privacyArgs; $global:LASTEXITCODE = $LASTEXITCODE; return }
        default {
          Write-Host "[warn] unknown aios privacy action: $action"
          Write-Host "Usage: aios privacy <status|init|set|read|redact|enable|disable|ollama-on|ollama-off|enforce-on|enforce-off> [args]"
          $global:LASTEXITCODE = 1
          return
        }
      }
    }
    "" {
      $script = Join-Path $env:ROOTPATH "scripts/aios.ps1"
      if (-not (Test-Path -LiteralPath $script)) {
        Write-Host "[warn] missing TUI entry script: $script"
        $global:LASTEXITCODE = 1
        return
      }
      & $script
      $global:LASTEXITCODE = $LASTEXITCODE
      return
    }
    "-h" { }
    "--help" { }
    "help" { }
    default {
      $script = Join-Path $env:ROOTPATH "scripts/aios.ps1"
      if (-not (Test-Path -LiteralPath $script)) {
        Write-Host "[warn] missing TUI entry script: $script"
        $global:LASTEXITCODE = 1
        return
      }
      & $script $sub @rest
      $global:LASTEXITCODE = $LASTEXITCODE
      return
    }
  }

  Write-Host "Usage:"
  Write-Host "  aios                     # interactive TUI"
  Write-Host "  aios <doctor|update|privacy> [args]"
  $global:LASTEXITCODE = 0
}
