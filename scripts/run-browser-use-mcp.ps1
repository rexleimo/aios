# AIOS browser-use MCP launcher for PowerShell (Windows).
# Equivalent of run-browser-use-mcp.sh.

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Split-Path -Parent $ScriptDir

function Resolve-FullPath {
  param([string]$Value)
  if (-not $Value) { return '' }
  if ($Value -eq '~') {
    return $HOME
  }
  if ($Value -match '^~[\\/](.*)$') {
    return Join-Path $HOME $Matches[1]
  }
  return [System.IO.Path]::GetFullPath($Value)
}

function Resolve-BrowserUseRepoRoot {
  param([string]$Candidate)
  $abs = Resolve-FullPath -Value $Candidate
  if (-not $abs) { return '' }

  if (Test-Path (Join-Path $abs "mcp-browser-use/pyproject.toml")) {
    return (Get-Item $abs).FullName
  }

  if (
    (Split-Path -Leaf $abs) -eq "mcp-browser-use" -and
    (Test-Path (Join-Path $abs "pyproject.toml"))
  ) {
    $parent = Split-Path -Parent $abs
    if (Test-Path (Join-Path $parent "mcp-browser-use/pyproject.toml")) {
      return (Get-Item $parent).FullName
    }
  }

  return ''
}

$BrowserUseRepo = ''
$Candidates = @()
if ($env:AIOS_BROWSER_USE_REPO) {
  $Candidates += Resolve-FullPath -Value $env:AIOS_BROWSER_USE_REPO
}
$Candidates += (Join-Path $RootDir '..\ai-browser-book')
$Candidates += (Join-Path $RootDir 'ai-browser-book')

foreach ($candidate in $Candidates) {
  $repo = Resolve-BrowserUseRepoRoot -Candidate $candidate
  if ($repo) {
    $BrowserUseRepo = $repo
    break
  }
}

if (-not $BrowserUseRepo) {
  Write-Error "[aios-browser] mcp-browser-use project not found."
  Write-Host "[aios-browser] Set `$env:AIOS_BROWSER_USE_REPO = 'C:\path\to\ai-browser-book' or place ai-browser-book next to/in this repo." 2>&1
  Write-Host "[aios-browser] Checked:"
  foreach ($candidate in $Candidates) {
    Write-Host "  - $candidate/mcp-browser-use"
  }
  exit 1
}

$env:AIOS_BROWSER_USE_REPO = $BrowserUseRepo
$McpDir = Join-Path $BrowserUseRepo 'mcp-browser-use'
$VenvPython = Join-Path $McpDir '.venv\Scripts\python.exe'
$BootstrapScript = Join-Path $RootDir 'scripts\browser-use-bootstrap.py'

if (-not (Test-Path $VenvPython)) {
  Write-Error "[aios-browser] browser-use venv python missing: $VenvPython"
  Write-Error "[aios-browser] Run: cd `"$McpDir`"; uv sync"
  exit 1
}

if (-not (Test-Path $BootstrapScript)) {
  Write-Error "[aios-browser] bootstrap script missing: $BootstrapScript"
  exit 1
}

# Detect CDP URL from browser-profiles.json
if (-not $env:BROWSER_USE_CDP_URL) {
  $profileConfig = Join-Path $RootDir 'config\browser-profiles.json'
  if (Test-Path $profileConfig) {
    try {
      $config = Get-Content $profileConfig -Raw | ConvertFrom-Json
      $profile = if ($config.profiles.default) { $config.profiles.default } else { $null }
      if ($profile) {
        $cdpUrl = [string]$profile.cdpUrl.Trim()
        if ($cdpUrl) {
          $env:BROWSER_USE_CDP_URL = $cdpUrl
        } else {
          $port = [int]$profile.cdpPort
          if ($port -gt 0) {
            $env:BROWSER_USE_CDP_URL = "http://127.0.0.1:$port"
          }
        }
      }
    } catch {
      # ignore parse errors
    }
  }
}

if (-not $env:BROWSER_USE_DEFAULT_TIMEOUT_MS) {
  $env:BROWSER_USE_DEFAULT_TIMEOUT_MS = "20000"
}

# --- credential username injection (non-sensitive, from credential store) ---
# Windows does not have the 'security' CLI (macOS Keychain), so skip.
# Users can set AIOS_CRED_XIAOHONGSHU_USERNAME / AIOS_CRED_JIMENG_USERNAME manually.

# Execute the bootstrap
& $VenvPython $BootstrapScript
exit $LASTEXITCODE
