param(
  [string]$Repo = $(if ($env:AIOS_REPO) { $env:AIOS_REPO } else { "rexleimo/aios" }),
  [string]$AssetUrl = $(if ($env:AIOS_ASSET_URL) { $env:AIOS_ASSET_URL } else { "" }),
  [string]$ReleaseTag = $(if ($env:AIOS_RELEASE_TAG) { $env:AIOS_RELEASE_TAG } else { "" }),
  [string]$InstallDir = $(if ($env:AIOS_INSTALL_DIR) { $env:AIOS_INSTALL_DIR } else { (Join-Path $HOME ".rexcil/aios") }),
  [ValidateSet("all", "repo-only", "opt-in", "off")]
  [string]$WrapMode = $(if ($env:AIOS_WRAP_MODE) { $env:AIOS_WRAP_MODE } else { "opt-in" }),
  # 升级前把占用安装目录的进程停掉：默认只告警并列 PID，给 -StopHolders 才真停。
  [switch]$StopHolders
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

# 中文注释：优先级 AssetUrl > ReleaseTag（按精确 tag 拉取）> releases/latest。
# releases/latest 按创建时间而非 semver 排序，补发旧版会抢占导致降级安装。
$assetUrl = if ($AssetUrl) {
  $AssetUrl
} elseif ($ReleaseTag) {
  "https://github.com/$Repo/releases/download/$ReleaseTag/aios.zip"
} else {
  "https://github.com/$Repo/releases/latest/download/aios.zip"
}

Enable-Tls12

$parent = Split-Path -Parent $InstallDir
New-Item -Path $parent -ItemType Directory -Force | Out-Null

$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("aios-install-" + [guid]::NewGuid().ToString("n"))
New-Item -Path $tmp -ItemType Directory -Force | Out-Null

try {
  $zipPath = Join-Path $tmp "aios.zip"
  $extract = Join-Path $tmp "extract"

  Download-File -Url $assetUrl -OutFile $zipPath

  Write-Host "+ extract -> $extract"
  Expand-Archive -LiteralPath $zipPath -DestinationPath $extract -Force

  # Detect archive layout: prefer aios/ prefix, fall back to root
  $candidate = Join-Path $extract "aios"
  if (Test-Path -LiteralPath $candidate) {
    $extractedRoot = $candidate
  } elseif (Test-Path -LiteralPath (Join-Path $extract "package.json")) {
    Write-Host "[info] archive layout: no aios/ prefix, using extract root"
    $extractedRoot = $extract
  } else {
    throw "Archive layout unexpected: neither aios/ prefix nor expected files found in $extract"
  }

  # 占用预检：从安装目录跑起来的进程会占着旧文件。
  # 默认只告警（旧目录是“改名让位”而不是删除，所以占用不再会弄坏安装）；
  # 想直接停掉它们就加 -StopHolders。
  $retired = $null
  if (Test-Path -LiteralPath $InstallDir) {
    try {
      $holders = @(Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object {
        $_.ProcessId -ne $PID -and $_.CommandLine -and ($_.CommandLine -like ("*" + $InstallDir + "*"))
      })
    } catch {
      # 探测失败不能静默：那和旧版“删除失败静默跳过”是同一种毛病。
      $holders = @()
      Write-Host ("[warn] occupancy pre-check failed ({0}); continuing with the rename-aside swap." -f $_.Exception.Message)
    }
    if ($holders.Count -gt 0) {
      Write-Host ("[warn] {0} process(es) reference the install dir (heuristic): {1}" -f $holders.Count, $InstallDir)
      foreach ($holder in $holders) { Write-Host ("        PID {0}  {1}" -f $holder.ProcessId, $holder.Name) }
      if ($StopHolders) {
        foreach ($holder in $holders) {
          try {
            Stop-Process -Id $holder.ProcessId -Force -ErrorAction Stop
            Write-Host ("        stopped PID {0}" -f $holder.ProcessId)
          } catch {
            Write-Host ("        [warn] could not stop PID {0}: {1}" -f $holder.ProcessId, $_.Exception.Message)
          }
        }
      } else {
        Write-Host "[warn] continuing anyway (old dir is renamed aside, not deleted); pass -StopHolders to stop them automatically."
      }
    }
  }

  $preservePaths = @(
    ".aios",
    ".browser-profiles",
    "mcp-server/.browser-profiles",
    "config/browser-profiles.json"
  )

  if (Test-Path -LiteralPath $InstallDir) {
    # 改名让位：`[System.IO.Directory]::Move` 是**目录改名**，不触碰目录内的文件，
    # 所以里面的文件被别人占用也照样能改（这是它和 Move-Item / Remove-Item 的关键区别：
    # Move-Item 是逐文件搬，碰到独占锁会搬到一半报错）。
    # 旧写法是 Safe-RemoveDir（静默落掉删除失败）+ 失败就 throw，结果是
    # “删到一半 + 报错退出”，把安装目录留成半截（实测就剩过 mcp-server/）。
    $retired = "{0}.retired-{1}" -f $InstallDir, (Get-Date -Format "yyyyMMdd-HHmmss")
    Write-Host "+ retire old install dir -> $retired"
    try {
      [System.IO.Directory]::Move($InstallDir, $retired)
    } catch {
      # 关键：这里必须“干净地拒绝”，而不是删一半。旧版就是删不动还继续，
      # 把安装目录留成半截（实测只剩过 mcp-server/），用户下次连 aios 都跑不起来。
      # 此刻旧安装**完全未动**，直接退出是安全的。
      Write-Host "[error] cannot swap the install dir: it is held open by a running process."
      Write-Host ("        dir:   {0}" -f $InstallDir)
      Write-Host ("        why:   {0}" -f $_.Exception.Message)
      if ($holders.Count -gt 0) {
        Write-Host "        holders (heuristic):"
        foreach ($holder in $holders) { Write-Host ("          PID {0}  {1}" -f $holder.ProcessId, $holder.Name) }
      }
      Write-Host "        fix:   stop those processes and re-run, or re-run with -StopHolders."
      Write-Host "        note:  your existing AIOS install was left untouched by this failure."
      throw
    }
  }

  Write-Host "+ install -> $InstallDir"
  # 目录改名在**同卷**下最快且原子；但临时目录与安装目录常在不同盘（C:/D:），
  # `Directory::Move` 跨卷必失败（Source and destination path must have identical roots）。
  # 所以：先试改名，失败就退回 `Move-Item`（逐文件搬，能跨卷）。
  $installed = $false
  try {
    [System.IO.Directory]::Move($extractedRoot, $InstallDir)
    $installed = $true
  } catch [System.IO.IOException] {
    Write-Host "[info] cross-volume install: falling back to Move-Item (copy + remove)"
  }
  if (-not $installed) {
    Move-Item -LiteralPath $extractedRoot -Destination $InstallDir -Force
  }

  # 用户数据从旧目录搬回来（列新树已就位；搬不动也不影响安装，数据还在 retired 里）。
  if ($retired -and (Test-Path -LiteralPath $retired)) {
    foreach ($rel in $preservePaths) {
      $src = Join-Path $retired $rel
      if (-not (Test-Path -LiteralPath $src)) { continue }
      $dst = Join-Path $InstallDir $rel
      $dstParent = Split-Path -Parent $dst
      New-Item -Path $dstParent -ItemType Directory -Force | Out-Null
      try {
        Move-Item -LiteralPath $src -Destination $dst -Force
      } catch {
        Write-Host ("[warn] could not restore {0} from the retired dir: {1}" -f $rel, $_.Exception.Message)
        Write-Host ("[warn] it is still intact at: {0}" -f $src)
      }
    }
  }

  # 旧目录清理：删不掉也不影响本次安装（留一个 .retired-* 目录，退出占用进程后可手删）。
  if ($retired -and (Test-Path -LiteralPath $retired)) {
    try {
      Remove-Item -LiteralPath $retired -Recurse -Force -ErrorAction Stop
      Write-Host ("+ removed retired install dir: {0}" -f $retired)
    } catch {
      Write-Host ("[warn] retired install dir could not be removed (files still in use): {0}" -f $retired)
      Write-Host "[warn] this install is complete; delete that directory after closing AIOS/clients."
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
