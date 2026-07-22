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

function Invoke-Checked([string]$Command, [string[]]$Arguments) {
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    & $Command @Arguments
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }
  if ($null -ne $exitCode -and $exitCode -ne 0) {
    throw ("Command failed with exit code {0}: {1} {2}" -f $exitCode, $Command, ($Arguments -join " "))
  }
}

Require-Command git
Require-Command tar
Require-Command npm

$rexHarnessRoot = Join-Path $RootDir "rex-harness"
foreach ($required in @(
  (Join-Path $rexHarnessRoot "src/index.mjs"),
  (Join-Path $rexHarnessRoot "bin/rex-harness.mjs"),
  (Join-Path $rexHarnessRoot "skill-sources/rex-workflow/SKILL.md")
)) {
  if (-not (Test-Path -LiteralPath $required)) {
    throw "Missing required rex-harness runtime: $required. Initialize the submodule first: git -C `"$RootDir`" submodule update --init --recursive -- rex-harness"
  }
}

New-Item -Path $Out -ItemType Directory -Force | Out-Null

$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("aios-release-" + [guid]::NewGuid().ToString("n"))
New-Item -Path $tmp -ItemType Directory -Force | Out-Null

try {
  $paths = @(
    "AGENTS.md",
    "CHANGELOG.md",
    "VERSION",
    ".nvmrc",
    ".node-version",
    ".npmrc",
    "package.json",
    "package-lock.json",
    "README.md",
    "README-zh.md",
    "skills-lock.json",
    "client-sources",
    "agent-sources",
    "skill-sources",
    "rex-harness",
    "config",
    "scripts",
    "mcp-server",
    "packages/debug-hub",
    "src",
    ".claude/agents",
    ".codex/agents",
    ".opencode/agents",
    ".gemini/commands"
  )

  $archivePaths = @()
  foreach ($relPath in $paths) {
    $gitMatches = & git -C $RootDir ls-tree -r --name-only HEAD -- $relPath
    if ($LASTEXITCODE -ne 0) {
      throw "git ls-tree failed for release path: $relPath"
    }
    if ($gitMatches) {
      $archivePaths += $relPath
    }
  }

  $installSh = Join-Path $RootDir "scripts/aios-install.sh"
  $installPs1 = Join-Path $RootDir "scripts/aios-install.ps1"
  if (-not (Test-Path -LiteralPath $installSh)) { throw "Missing installer script: $installSh" }
  if (-not (Test-Path -LiteralPath $installPs1)) { throw "Missing installer script: $installPs1" }

  Copy-Item -LiteralPath $installSh -Destination (Join-Path $Out "aios-install.sh") -Force
  Copy-Item -LiteralPath $installPs1 -Destination (Join-Path $Out "aios-install.ps1") -Force

  $debugHubRoot = Join-Path $RootDir "packages/debug-hub"
  if (-not (Test-Path -LiteralPath (Join-Path $debugHubRoot "package.json"))) {
    throw "Missing required debug-hub package: $(Join-Path $debugHubRoot 'package.json')"
  }
  Write-Host "+ build debug-hub"
  Invoke-Checked -Command "npm" -Arguments @("--prefix", $debugHubRoot, "run", "build")

  $tarGz = Join-Path $Out "harness-cli.tar.gz"
  $zip = Join-Path $Out "harness-cli.zip"

  $tarPath = Join-Path $tmp "rex-cli.tar"
  $extractDir = Join-Path $tmp "extract"
  New-Item -Path $extractDir -ItemType Directory -Force | Out-Null

  Write-Host "+ git archive (tar) -> $tarPath"
  Invoke-Checked -Command "git" -Arguments (@("-C", $RootDir, "archive", "--format=tar", "--prefix=harness-cli/", "-o", $tarPath, "HEAD") + $archivePaths)

  Write-Host "+ extract tar -> $extractDir"
  Invoke-Checked -Command "tar" -Arguments @("-xf", $tarPath, "-C", $extractDir)

  # 中文注释：git archive 不会展开 gitlink，单独物化 submodule 的固定提交。
  # Materialize the pinned submodule because git archive stores only a gitlink.
  $rexArchiveRoot = Join-Path $extractDir "harness-cli/rex-harness"
  $rexGitDir = Join-Path $rexHarnessRoot ".git"
  if (Test-Path -LiteralPath $rexGitDir) {
    if (Test-Path -LiteralPath $rexArchiveRoot -PathType Leaf) {
      Remove-Item -LiteralPath $rexArchiveRoot -Force
    }
    $rexTarPath = Join-Path $tmp "rex-harness.tar"
    Invoke-Checked -Command "git" -Arguments @("-C", $rexHarnessRoot, "archive", "--format=tar", "--prefix=harness-cli/rex-harness/", "-o", $rexTarPath, "HEAD")
    Invoke-Checked -Command "tar" -Arguments @("-xf", $rexTarPath, "-C", $extractDir)
  } else {
    New-Item -Path $rexArchiveRoot -ItemType Directory -Force | Out-Null
    Get-ChildItem -LiteralPath $rexHarnessRoot -Force |
      Where-Object { $_.Name -notin @('.git', 'node_modules', '.rex-harness') } |
      ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $rexArchiveRoot -Recurse -Force }
  }
  if (-not (Test-Path -LiteralPath (Join-Path $extractDir "harness-cli/rex-harness/src/index.mjs"))) {
    throw "Release archive did not materialize rex-harness/src/index.mjs"
  }

  # mcp-server/dist is generated output and must not be shipped in releases.
  $mcpDistArchive = Join-Path $extractDir "harness-cli/mcp-server/dist"
  if (Test-Path -LiteralPath $mcpDistArchive) {
    Remove-Item -LiteralPath $mcpDistArchive -Recurse -Force
  }

  # Generated client projections and retired workflow code are materialized at install time.
  $legacySuperpowersArchive = Join-Path $extractDir "harness-cli/scripts/lib/components/superpowers"
  if (Test-Path -LiteralPath $legacySuperpowersArchive) {
    Remove-Item -LiteralPath $legacySuperpowersArchive -Recurse -Force
  }

  # git archive omits ignored build output; materialize the bundled debug-hub dist.
  $debugArchiveRoot = Join-Path $extractDir "harness-cli/packages/debug-hub"
  $debugDist = Join-Path $debugHubRoot "dist"
  if (-not (Test-Path -LiteralPath $debugDist)) {
    throw "debug-hub build did not produce: $debugDist"
  }
  New-Item -Path $debugArchiveRoot -ItemType Directory -Force | Out-Null
  Copy-Item -LiteralPath $debugDist -Destination $debugArchiveRoot -Recurse -Force
  foreach ($requiredDebugFile in @("dist/cli.js", "dist/server.js", "dist/ui.html")) {
    if (-not (Test-Path -LiteralPath (Join-Path $debugArchiveRoot $requiredDebugFile))) {
      throw "Release archive did not materialize packages/debug-hub/$requiredDebugFile"
    }
  }

  Write-Host "+ tar.gz -> $tarGz"
  Invoke-Checked -Command "tar" -Arguments @("-czf", $tarGz, "-C", $extractDir, "harness-cli")

  Write-Host "+ zip -> $zip"
  # 中文注释：Windows 自带 bsdtar 不保证支持 ZIP 输出，使用 .NET 从物化目录打包，保留隐藏客户端目录。
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  if (Test-Path -LiteralPath $zip) {
    Remove-Item -LiteralPath $zip -Force
  }
  [System.IO.Compression.ZipFile]::CreateFromDirectory(
    $extractDir,
    $zip,
    [System.IO.Compression.CompressionLevel]::Optimal,
    $false
  )

  $zipExtract = Join-Path $tmp "zip-check"
  Expand-Archive -LiteralPath $zip -DestinationPath $zipExtract -Force
  if (-not (Test-Path -LiteralPath (Join-Path $zipExtract "harness-cli/rex-harness/src/index.mjs"))) {
    throw "Release ZIP did not materialize rex-harness/src/index.mjs"
  }

  Write-Host ""
  Write-Host "Done. Assets:"
  Get-ChildItem -LiteralPath $Out | Format-Table -AutoSize
}
finally {
  Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
}
