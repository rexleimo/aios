param(
  [switch]$DryRun,
  [switch]$AllowDirty
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$RootDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$VersionFile = Join-Path $RootDir "VERSION"

function Invoke-Checked([string]$Command, [string[]]$Arguments) {
  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw ("Command failed with exit code {0}: {1} {2}" -f $LASTEXITCODE, $Command, ($Arguments -join " "))
  }
}

if ($AllowDirty -and -not $DryRun) {
  throw "-AllowDirty may only be used with -DryRun"
}

if (-not (Test-Path -LiteralPath $VersionFile)) {
  throw "missing VERSION file: $VersionFile"
}

$Version = (Get-Content -LiteralPath $VersionFile -Raw).Trim()
$Tag = "v$Version"

$StatusBefore = (& git -C $RootDir status --short)
if (-not $AllowDirty -and $StatusBefore) {
  throw "git worktree is not clean; commit or stash changes before release"
}

Invoke-Checked -Command "node" -Arguments @((Join-Path $RootDir "scripts/materialize-release-local-outputs.mjs"))

$StatusAfter = (& git -C $RootDir status --short)
if (-not $AllowDirty -and $StatusAfter) {
  throw "git worktree changed while preparing local release outputs; review changes before release"
}

& (Join-Path $RootDir "scripts/release-preflight.ps1") -Tag $Tag *> $null
if ($LASTEXITCODE -ne 0) {
  throw "release preflight failed for $Tag"
}

Write-Host "Version: $Version"
Write-Host "Tag:     $Tag"
Write-Host ""
Write-Host "Commands:"
Write-Host "  git tag $Tag"
Write-Host "  git push origin main"
Write-Host "  git push origin $Tag"

if ($DryRun) {
  Write-Host ""
  Write-Host "Dry run only. No tag created."
  exit 0
}

Invoke-Checked -Command "git" -Arguments @("-C", $RootDir, "tag", $Tag)
Write-Host "+ git push origin main"
Invoke-Checked -Command "git" -Arguments @("-C", $RootDir, "push", "origin", "main")
Write-Host "+ git push origin $Tag"
Invoke-Checked -Command "git" -Arguments @("-C", $RootDir, "push", "origin", $Tag)
