param(
  [string]$Tag = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$RootDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$VersionFile = Join-Path $RootDir "VERSION"
$ChangelogFile = Join-Path $RootDir "CHANGELOG.md"

function Show-Usage() {
  Write-Host @"
Usage:
  scripts/release-preflight.ps1 -Tag vX.Y.Z

Validates:
  - tag format is vX.Y.Z
  - VERSION matches X.Y.Z
  - CHANGELOG.md contains ## [X.Y.Z] - YYYY-MM-DD
  - generated skill roots materialize from skill-sources via scripts/check-skills-sync.mjs
  - generated native outputs materialize from client-sources/native-base via scripts/check-native-sync.mjs
"@
}

function Invoke-NodeCheck([string]$ScriptPath, [string]$FailureMessage, [string[]]$Arguments = @()) {
  $stdoutFile = Join-Path $RootDir (".release-preflight-" + [guid]::NewGuid().ToString("n") + ".out")
  $stderrFile = Join-Path $RootDir (".release-preflight-" + [guid]::NewGuid().ToString("n") + ".err")
  try {
    $nodeExitCode = 1
    $previousErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
      & node $ScriptPath @Arguments > $stdoutFile 2> $stderrFile
      $nodeExitCode = $LASTEXITCODE
    } finally {
      $ErrorActionPreference = $previousErrorActionPreference
    }
    if ($nodeExitCode -ne 0) {
      throw $FailureMessage
    }
  } finally {
    Remove-Item -LiteralPath $stdoutFile -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $stderrFile -Force -ErrorAction SilentlyContinue
  }
}

if (-not $Tag) {
  Show-Usage
  throw "-Tag is required"
}

if ($Tag -notmatch '^v([0-9]+)\.([0-9]+)\.([0-9]+)$') {
  throw "tag must match vX.Y.Z: $Tag"
}

if (-not (Test-Path -LiteralPath $VersionFile)) {
  throw "missing VERSION file: $VersionFile"
}
if (-not (Test-Path -LiteralPath $ChangelogFile)) {
  throw "missing CHANGELOG file: $ChangelogFile"
}

$Version = (Get-Content -LiteralPath $VersionFile -Raw).Trim()
$ExpectedVersion = $Tag.Substring(1)

if ($Version -ne $ExpectedVersion) {
  throw "VERSION mismatch: tag=$Tag VERSION=$Version"
}

$HeadingPattern = "^## \[$([regex]::Escape($ExpectedVersion))\] - [0-9]{4}-[0-9]{2}-[0-9]{2}$"
if (-not (Select-String -LiteralPath $ChangelogFile -Pattern $HeadingPattern -Quiet)) {
  throw "changelog missing matching release heading for $ExpectedVersion"
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "missing required command: node"
}

Invoke-NodeCheck `
  -ScriptPath (Join-Path $RootDir "scripts/check-skills-sync.mjs") `
  -Arguments @("--materialize-temp") `
  -FailureMessage "skills sync drift detected; run: node scripts/sync-skills.mjs"

Invoke-NodeCheck `
  -ScriptPath (Join-Path $RootDir "scripts/check-native-sync.mjs") `
  -Arguments @("--materialize-temp") `
  -FailureMessage "native sync drift detected; run: node scripts/sync-native.mjs"

$AgentManifest = Join-Path $RootDir "agent-sources/manifest.json"
$HasAgentManifest = Test-Path -LiteralPath $AgentManifest
if ($HasAgentManifest) {
  Invoke-NodeCheck `
    -ScriptPath (Join-Path $RootDir "scripts/generate-orchestrator-agents.mjs") `
    -Arguments @("--export-only") `
    -FailureMessage "agent export regeneration failed; run: node scripts/generate-orchestrator-agents.mjs --export-only"
}

Write-Host "[ok] release preflight passed for $Tag"
Write-Host "  VERSION:   $Version"
Write-Host "  CHANGELOG: has ## [$ExpectedVersion] - YYYY-MM-DD"
Write-Host "  SKILLS:    generated roots match skill-sources/"
Write-Host "  NATIVE:    generated native outputs match client-sources/native-base/"
if ($HasAgentManifest) {
  Write-Host "  AGENTS:    export-only regeneration passed"
}
