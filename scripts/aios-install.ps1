param(
  [string]$Repo = $(if ($env:AIOS_REPO) { $env:AIOS_REPO } else { "rexleimo/harness-cli" }),
  [string]$AssetUrl = $(if ($env:AIOS_ASSET_URL) { $env:AIOS_ASSET_URL } else { "" }),
  [string]$InstallDir = $(if ($env:AIOS_INSTALL_DIR) { $env:AIOS_INSTALL_DIR } else { (Join-Path $HOME ".rexcil/harness-cli") }),
  [ValidateSet("all", "repo-only", "opt-in", "off")]
  [string]$WrapMode = $(if ($env:AIOS_WRAP_MODE) { $env:AIOS_WRAP_MODE } else { "opt-in" })
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Enable-Tls12() {
  try {
    $tls12 = [Net.SecurityProtocolType]::Tls12
    if (([Net.ServicePointManager]::SecurityProtocol -band $tls12) -ne $tls12) {
      [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor $tls12
    }
  } catch {
    Write-Host ("[warn] unable to enable TLS 1.2 for downloads: {0}" -f $_.Exception.Message)
  }
}

function Download-File([string]$Url, [string]$OutFile) {
  if ($Url -match '^file://') {
    $localPath = ([System.Uri]$Url).LocalPath
    Write-Host "+ copy $localPath"
    Copy-Item -LiteralPath $localPath -Destination $OutFile -Force
    return
  }
  if (Test-Path -LiteralPath $Url) {
    Write-Host "+ copy $Url"
    Copy-Item -LiteralPath $Url -Destination $OutFile -Force
    return
  }
  Write-Host "+ download $Url"
  $iwr = Get-Command Invoke-WebRequest -ErrorAction SilentlyContinue
  if ($iwr -and $iwr.Parameters.ContainsKey('UseBasicParsing')) {
    Invoke-WebRequest -Uri $Url -OutFile $OutFile -UseBasicParsing
    return
  }
  Invoke-WebRequest -Uri $Url -OutFile $OutFile
}

function Invoke-Checked([string]$Command, [string[]]$Arguments) {
  $exitCode = 1
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

function Safe-RemoveDir([string]$Path) {
  if (-not $Path) { throw "Refusing to remove empty path" }
  $full = [System.IO.Path]::GetFullPath($Path)
  if ($full -eq [System.IO.Path]::GetPathRoot($full)) { throw "Refusing to remove root: $full" }
  if ($full -eq [System.IO.Path]::GetFullPath($HOME)) { throw "Refusing to remove HOME: $full" }
  Remove-Item -LiteralPath $full -Recurse -Force -ErrorAction SilentlyContinue
}

$assetUrl = if ($AssetUrl) { $AssetUrl } else { "https://github.com/$Repo/releases/latest/download/harness-cli.zip" }

Enable-Tls12

$parent = Split-Path -Parent $InstallDir
New-Item -Path $parent -ItemType Directory -Force | Out-Null

$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("aios-install-" + [guid]::NewGuid().ToString("n"))
New-Item -Path $tmp -ItemType Directory -Force | Out-Null

try {
  $zipPath = Join-Path $tmp "harness-cli.zip"
  $extract = Join-Path $tmp "extract"
  $preserve = Join-Path $tmp "preserve"

  Download-File -Url $assetUrl -OutFile $zipPath

  Write-Host "+ extract -> $extract"
  Expand-Archive -LiteralPath $zipPath -DestinationPath $extract -Force

  # Detect archive layout: prefer harness-cli/ prefix, fall back to root
  $candidate = Join-Path $extract "harness-cli"
  if (Test-Path -LiteralPath $candidate) {
    $extractedRoot = $candidate
  } elseif (Test-Path -LiteralPath (Join-Path $extract "package.json")) {
    Write-Host "[info] archive layout: no harness-cli/ prefix, using extract root"
    $extractedRoot = $extract
  } else {
    throw "Archive layout unexpected: neither harness-cli/ prefix nor expected files found in $extract"
  }

  if (Test-Path -LiteralPath $InstallDir) {
    New-Item -Path $preserve -ItemType Directory -Force | Out-Null
    $preservePaths = @(
      ".aios",
      ".browser-profiles",
      "mcp-server/.browser-profiles",
      "config/browser-profiles.json"
    )

    foreach ($rel in $preservePaths) {
      $src = Join-Path $InstallDir $rel
      if (Test-Path -LiteralPath $src) {
        $dst = Join-Path $preserve $rel
        $dstParent = Split-Path -Parent $dst
        New-Item -Path $dstParent -ItemType Directory -Force | Out-Null
        Move-Item -LiteralPath $src -Destination $dst -Force
      }
    }

    Write-Host "+ remove old install dir -> $InstallDir"
    Safe-RemoveDir -Path $InstallDir
    if (Test-Path -LiteralPath $InstallDir) {
      throw "Failed to remove existing install dir: $InstallDir (files may be locked by a running aios/node process). Close it and re-run the installer."
    }
  }

  Write-Host "+ install -> $InstallDir"
  Move-Item -LiteralPath $extractedRoot -Destination $InstallDir -Force

  if (Test-Path -LiteralPath $preserve) {
    foreach ($rel in $preservePaths) {
      $src = Join-Path $preserve $rel
      if (-not (Test-Path -LiteralPath $src)) { continue }
      $dst = Join-Path $InstallDir $rel
      $dstParent = Split-Path -Parent $dst
      New-Item -Path $dstParent -ItemType Directory -Force | Out-Null
      Move-Item -LiteralPath $src -Destination $dst -Force
    }
  }

  $rootPackageJson = Join-Path $InstallDir "package.json"
  $rootTsxBin = Join-Path $InstallDir "node_modules/.bin/tsx.cmd"
  if (Test-Path -LiteralPath $rootPackageJson) {
    if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
      throw "Missing required command: npm"
    }
    if (-not (Test-Path -LiteralPath $rootTsxBin)) {
      Write-Host "+ install AIOS runtime deps: npm install --include=dev --engine-strict=false"
      Push-Location $InstallDir
      try {
        Invoke-Checked -Command "npm" -Arguments @("install", "--include=dev", "--engine-strict=false")
      }
      finally {
        Pop-Location
      }
      if (-not (Test-Path -LiteralPath $rootTsxBin)) {
        throw ("AIOS runtime deps install did not produce expected TUI runner: {0}" -f $rootTsxBin)
      }
    } else {
      Write-Host ("[ok] AIOS runtime deps ready: {0}" -f $InstallDir)
    }
  } else {
    Write-Host ("[warn] missing root package.json; TUI dependencies may be unavailable: {0}" -f $rootPackageJson)
  }

  $shellInstaller = Join-Path $InstallDir "scripts/install-contextdb-shell.ps1"
  if (Test-Path -LiteralPath $shellInstaller) {
    Write-Host "+ install PowerShell integration: $shellInstaller --mode $WrapMode --force"
    Invoke-Checked -Command "powershell" -Arguments @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $shellInstaller, "--mode", $WrapMode, "--force")
  } else {
    Write-Host "[warn] missing shell installer: $shellInstaller"
  }

  $privacyInstaller = Join-Path $InstallDir "scripts/install-privacy-guard.ps1"
  if (Test-Path -LiteralPath $privacyInstaller) {
    try {
      Write-Host "+ init privacy guard: $privacyInstaller --enable"
      Invoke-Checked -Command "powershell" -Arguments @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $privacyInstaller, "--enable")
    } catch {
      Write-Host ("[warn] privacy guard init skipped: {0}" -f $_.Exception.Message)
    }
  }

  $workflowReconciler = Join-Path $InstallDir "scripts/reconcile-rex-workflow-surface.mjs"
  if (Test-Path -LiteralPath $workflowReconciler) {
    Write-Host "+ reconcile AIOS-managed legacy workflow projections"
    $workflowReconcilerArgs = @($workflowReconciler, "--root", $InstallDir)
    Invoke-Checked -Command "node" -Arguments $workflowReconcilerArgs
  } else {
    Write-Host "[warn] missing Rex workflow reconciler: $workflowReconciler"
  }

  $rexProjector = Join-Path $InstallDir "scripts/install-rex-client-projections.mjs"
  if (Test-Path -LiteralPath $rexProjector) {
    Write-Host "+ install Rex workflow skills for all supported clients"
    Invoke-Checked -Command "node" -Arguments @($rexProjector, "--root", $InstallDir, "--client", "all", "--scope", "global")
  } else {
    Write-Host "[warn] missing Rex client skill projector: $rexProjector"
  }

  Write-Host ""
  Write-Host "[ok] Installed AIOS:"
  Write-Host ("  Repo:        {0}" -f $Repo)
  Write-Host ("  Install dir: {0}" -f $InstallDir)
  Write-Host ""
  Write-Host "Next:"
  Write-Host "  1) . `$PROFILE"
  Write-Host "  2) aios doctor # verify"
  Write-Host "  3) aios        # opens the TUI"
}
finally {
  Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
}
