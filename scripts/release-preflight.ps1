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
  - root and MCP-server test/build checks pass
  - changed Skills have reproducible, committed training evidence
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

function Invoke-NpmCheck([string]$WorkingDirectory, [string[]]$Arguments, [string]$FailureMessage) {
  Push-Location $WorkingDirectory
  try {
    & npm @Arguments
    if ($LASTEXITCODE -ne 0) {
      throw $FailureMessage
    }
  } finally {
    Pop-Location
  }
}

function Invoke-GitQuietDiff([string]$PathSpec) {
  $previousErrorActionPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    & git -C $RootDir diff --quiet -- $PathSpec 2>$null
    return $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
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

foreach ($rexFile in @(
  (Join-Path $RootDir "rex-harness/package.json"),
  (Join-Path $RootDir "rex-harness/src/index.mjs"),
  (Join-Path $RootDir "rex-harness/bin/rex-harness.mjs"),
  (Join-Path $RootDir "rex-harness/skill-sources/rex-workflow/SKILL.md")
)) {
  if (-not (Test-Path -LiteralPath $rexFile)) {
    throw "missing required rex-harness release file: $rexFile. Initialize the submodule with: git -C `"$RootDir`" submodule update --init --recursive -- rex-harness"
  }
}

Invoke-NodeCheck `
  -ScriptPath (Join-Path $RootDir "scripts/check-skills-sync.mjs") `
  -Arguments @("--materialize-temp") `
  -FailureMessage "skills sync drift detected; run: node scripts/sync-skills.mjs"

Invoke-NodeCheck `
  -ScriptPath (Join-Path $RootDir "scripts/check-native-sync.mjs") `
  -Arguments @("--materialize-temp") `
  -FailureMessage "native sync drift detected; run: node scripts/sync-native.mjs"

Invoke-NpmCheck `
  -WorkingDirectory $RootDir `
  -Arguments @("run", "test:scripts") `
  -FailureMessage "root release test suite failed: npm run test:scripts"

$McpServerDir = Join-Path $RootDir "mcp-server"
Invoke-NpmCheck -WorkingDirectory $McpServerDir -Arguments @("run", "typecheck") -FailureMessage "MCP-server typecheck failed"
Invoke-NpmCheck -WorkingDirectory $McpServerDir -Arguments @("test") -FailureMessage "MCP-server test suite failed"
Invoke-NpmCheck -WorkingDirectory $McpServerDir -Arguments @("run", "build") -FailureMessage "MCP-server build failed"

& git -C $RootDir rev-parse --verify --quiet HEAD^ *> $null
if ($LASTEXITCODE -ne 0) {
  throw "release training verification requires a parent commit"
}
Invoke-NodeCheck `
  -ScriptPath (Join-Path $RootDir "scripts/aios.mjs") `
  -Arguments @("skill", "verify-training", "--changed", "--base", "HEAD^", "--json") `
  -FailureMessage "changed Skills lack reproducible training evidence for this release"

$AgentManifest = Join-Path $RootDir "agent-sources/manifest.json"
$HasAgentManifest = Test-Path -LiteralPath $AgentManifest
if ($HasAgentManifest) {
  if ((Invoke-GitQuietDiff "scripts/lib/specs/orchestrator-agents.json") -ne 0) {
    throw "agent export drift detected; run: node scripts/generate-orchestrator-agents.mjs --export-only and commit scripts/lib/specs/orchestrator-agents.json"
  }
  Invoke-NodeCheck `
    -ScriptPath (Join-Path $RootDir "scripts/generate-orchestrator-agents.mjs") `
    -Arguments @("--export-only") `
    -FailureMessage "agent export regeneration failed; run: node scripts/generate-orchestrator-agents.mjs --export-only"
  if ((Invoke-GitQuietDiff "scripts/lib/specs/orchestrator-agents.json") -ne 0) {
    throw "agent export drift detected; run: node scripts/generate-orchestrator-agents.mjs --export-only and commit scripts/lib/specs/orchestrator-agents.json"
  }
}

Write-Host "[ok] release preflight passed for $Tag"
Write-Host "  VERSION:   $Version"
Write-Host "  CHANGELOG: has ## [$ExpectedVersion] - YYYY-MM-DD"
Write-Host "  SKILLS:    generated roots match skill-sources/"
Write-Host "  NATIVE:    generated native outputs match client-sources/native-base/"
Write-Host "  REX:       rex-harness planning kernel is materialized"
Write-Host "  TESTS:     root and MCP-server verification passed"
Write-Host "  TRAINING:  changed Skill evidence recomputed from committed artifacts"
if ($HasAgentManifest) {
  Write-Host "  AGENTS:    export-only regeneration passed"
}
