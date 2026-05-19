param(
  [string]$Out = (Join-Path (Resolve-Path (Join-Path $PSScriptRoot "..")).Path "dist/release")
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$RootDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

function Require-Command([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Missing required command: $Name"
  }
}

Require-Command git
Require-Command tar

New-Item -Path $Out -ItemType Directory -Force | Out-Null

$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("aios-release-" + [guid]::NewGuid().ToString("n"))
New-Item -Path $tmp -ItemType Directory -Force | Out-Null

try {
  $paths = @(
    "AGENTS.md",
    "CHANGELOG.md",
    "VERSION",
    "package.json",
    "package-lock.json",
    "README.md",
    "README-zh.md",
    "skills-lock.json",
    "client-sources",
    "agent-sources",
    "skill-sources",
    "config",
    "scripts",
    "mcp-server",
    ".claude/agents",
    ".codex/skills",
    ".codex/agents",
    ".claude/skills",
    ".agents/skills"
  )

  $installSh = Join-Path $RootDir "scripts/aios-install.sh"
  $installPs1 = Join-Path $RootDir "scripts/aios-install.ps1"
  if (-not (Test-Path -LiteralPath $installSh)) { throw "Missing installer script: $installSh" }
  if (-not (Test-Path -LiteralPath $installPs1)) { throw "Missing installer script: $installPs1" }

  Copy-Item -LiteralPath $installSh -Destination (Join-Path $Out "aios-install.sh") -Force
  Copy-Item -LiteralPath $installPs1 -Destination (Join-Path $Out "aios-install.ps1") -Force

  $tarGz = Join-Path $Out "harness-cli.tar.gz"
  $zip = Join-Path $Out "harness-cli.zip"

  $tarPath = Join-Path $tmp "rex-cli.tar"
  $extractDir = Join-Path $tmp "extract"
  New-Item -Path $extractDir -ItemType Directory -Force | Out-Null

  Write-Host "+ git archive (tar) -> $tarPath"
  & git -C $RootDir archive --format=tar --prefix="harness-cli/" -o $tarPath HEAD @paths

  Write-Host "+ extract tar -> $extractDir"
  & tar -xf $tarPath -C $extractDir

  Write-Host "+ tar.gz -> $tarGz"
  & tar -czf $tarGz -C $extractDir "harness-cli"

  Write-Host "+ git archive (zip) -> $zip"
  & git -C $RootDir archive --format=zip --prefix="harness-cli/" -o $zip HEAD @paths

  Write-Host ""
  Write-Host "Done. Assets:"
  Get-ChildItem -LiteralPath $Out | Format-Table -AutoSize
}
finally {
  Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
}
