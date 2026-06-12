# ContextDB transparent command wrappers for PowerShell.
# Source this file in PowerShell profile to route supported clients through AIOS without prompt injection.
# Optional env vars:
# - AIOS_ROOT_DIR
# - AIOS_ROOT
# - ROOTPATH
# - CTXDB_SHELL_BRIDGE
# - CTXDB_RUNNER
# - CTXDB_REPO_NAME
# - CTXDB_WRAP_MODE
# - CTXDB_MARKER_FILE
# - CTXDB_AUTO_CREATE_MARKER
# - CTXDB_PRIVACY_BANNER
# - CTXDB_PRIVACY_COLOR
# - CTXDB_ALLOW_DIRECT_NATIVE_AGENT
# - AIOS_NATIVE_SHIM_DIR

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

  $rootPath = if ($env:AIOS_ROOT_DIR) { $env:AIOS_ROOT_DIR } elseif ($env:AIOS_ROOT) { $env:AIOS_ROOT } else { $env:ROOTPATH }
  if ($rootPath) {
    $candidate = Join-Path $rootPath "scripts/contextdb-shell-bridge.mjs"
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
    $global:LASTEXITCODE = 127
    return
  }

  & $cmd.Source @Arguments
  $global:LASTEXITCODE = $LASTEXITCODE
}

function Invoke-BridgeOrPassthrough {
  param(
    [string]$Agent,
    [string]$Passthrough,
    [string[]]$Arguments
  )

  $bridge = Resolve-BridgePath
  if (-not $bridge) {
    Invoke-NativeCommand -Name $Passthrough -Arguments $Arguments
    return
  }

  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Invoke-NativeCommand -Name $Passthrough -Arguments $Arguments
    return
  }

  Update-LastWorkspace
  & node $bridge "--agent" $Agent "--command" $Passthrough "--" @Arguments
  $global:LASTEXITCODE = $LASTEXITCODE
}

# Keep these wrapper calls as statements. Assigning their output captures native
# stdout in PowerShell, which makes TUI clients see stdout as non-terminal.
function codex {
  param([Parameter(ValueFromRemainingArguments = $true)] [string[]]$Args)

  Normalize-CodexHome
  Invoke-BridgeOrPassthrough -Agent "codex-cli" -Passthrough "codex" -Arguments $Args
}

function claude {
  param([Parameter(ValueFromRemainingArguments = $true)] [string[]]$Args)

  Invoke-BridgeOrPassthrough -Agent "claude-code" -Passthrough "claude" -Arguments $Args
}

function gemini {
  param([Parameter(ValueFromRemainingArguments = $true)] [string[]]$Args)

  Invoke-BridgeOrPassthrough -Agent "gemini-cli" -Passthrough "gemini" -Arguments $Args
}

function opencode {
  param([Parameter(ValueFromRemainingArguments = $true)] [string[]]$Args)

  Invoke-BridgeOrPassthrough -Agent "opencode-cli" -Passthrough "opencode" -Arguments $Args
}

function aios {
  param([Parameter(ValueFromRemainingArguments = $true)] [string[]]$Args)

  $argList = @($Args)
  if ($argList.Count -eq 1 -and $null -eq $argList[0]) {
    $argList = @()
  }

  $sub = if ($argList.Count -gt 0) { $argList[0] } else { "" }
  $rest = @(if ($argList.Count -gt 1) { $argList[1..($argList.Count - 1)] })
  $rootPath = if ($env:AIOS_ROOT_DIR) { $env:AIOS_ROOT_DIR } elseif ($env:AIOS_ROOT) { $env:AIOS_ROOT } else { $env:ROOTPATH }

  if (-not $rootPath) {
    Write-Host "[warn] AIOS_ROOT_DIR is not set (install PowerShell integration first)"
    return
  }

  switch ($sub) {
    "doctor" {
      $script = Join-Path $rootPath "scripts/verify-aios.ps1"
      if (-not (Test-Path -LiteralPath $script)) {
        Write-Host "[warn] missing verifier script: $script"
        return
      }
      & $script @rest
      $global:LASTEXITCODE = $LASTEXITCODE
      return
    }
    "update" {
      $script = Join-Path $rootPath "scripts/update-all.ps1"
      if (-not (Test-Path -LiteralPath $script)) {
        Write-Host "[warn] missing update script: $script"
        return
      }
      & $script @rest
      $global:LASTEXITCODE = $LASTEXITCODE
      return
    }
    "privacy" {
      $script = Join-Path $rootPath "scripts/privacy-guard.mjs"
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

      $restList = @($rest)
      if ($restList.Count -eq 1 -and $null -eq $restList[0]) {
        $restList = @()
      }

      $action = if ($restList.Count -gt 0) { $restList[0] } else { 'status' }
      $privacyArgs = @(if ($restList.Count -gt 1) { $restList[1..($restList.Count - 1)] })

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
      $script = Join-Path $rootPath "scripts/aios.ps1"
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
      $script = Join-Path $rootPath "scripts/aios.ps1"
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
  Write-Host "  aios --version           # print Harness CLI version"
  Write-Host "  aios <doctor|update|privacy> [args]"
  $global:LASTEXITCODE = 0
}
