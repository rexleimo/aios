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

<#
.DESCRIPTION
  列出把 CWD 落在 $InstallDir 子树内的进程。
  中文注释：Windows 上“目录改名”只被一种持有者拦住：某个进程的 CWD 在该目录的子树里。
  实测（在安装树内新建子目录做可逆 rename 探针）：Chrome 的 profile 句柄、tsx 的 fs.watch
  目录通知句柄、SQLite 的打开文件句柄都不拦；只有 CWD 拦，报 EPERM/EBUSY。
  旧预检按命令行字符串匹配安装目录，一次列出 39 个 PID，把 Chrome、别的会话、连安装器
  自己的 shell 都算进去——噪音盖掉了真正挡路的那几个。这里读 PEB 拿真实 CWD。
  返回一个结果对象 @{ ok = <探针是否可用>; holders = @(...) }。
  中文注释：**不能直接 return 数组**——PowerShell 在赋值语境里会把 `@()` 塔成 `$null`（空集合展开成
  nothing），那样“真没有持有者”和“探针不可用”就是同一个值，等于拿猜值冒充干净。
  包一层 hashtable 后两种情形各有自己的处置：ok=false 必须降级走启发式并明说测不准。
#>
function Get-InstallDirCwdHolder([string]$InstallDir) {
  if (-not ('AiosPebProbe' -as [type])) {
    try {
      Add-Type -Language CSharp -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public class AiosPebProbe {
  [DllImport("ntdll.dll")] static extern int NtQueryInformationProcess(IntPtr h, int cls, byte[] buf, int len, out int ret);
  [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(int acc, bool inh, int pid);
  [DllImport("kernel32.dll")] static extern bool ReadProcessMemory(IntPtr h, IntPtr addr, byte[] buf, int size, out int read);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
  static IntPtr Rd(byte[] b, int off) { return new IntPtr(IntPtr.Size == 8 ? Marshal.ReadInt64(b, off) : Marshal.ReadInt32(b, off)); }
  public static string Cwd(int pid) {
    if (IntPtr.Size != 8) return null;   // 只实现 x64 布局；其他架构宁可不报，不拿猜值当事实
    IntPtr h = OpenProcess(0x0410, false, pid);
    if (h == IntPtr.Zero) return null;
    try {
      byte[] mi = new byte[48]; int ret;
      if (NtQueryInformationProcess(h, 0, mi, mi.Length, out ret) != 0) return null;
      IntPtr peb = Rd(mi, 8);
      if (peb == IntPtr.Zero) return null;
      byte[] pb = new byte[0x40];
      if (!ReadProcessMemory(h, peb, pb, pb.Length, out ret)) return null;
      IntPtr pp = Rd(pb, 0x20);
      if (pp == IntPtr.Zero) return null;
      byte[] ub = new byte[0x80];
      if (!ReadProcessMemory(h, pp, ub, ub.Length, out ret)) return null;
      ushort len = BitConverter.ToUInt16(ub, 0x38);          // RTL_USER_PROCESS_PARAMETERS.CurrentDirectory.DosPath
      IntPtr addr = Rd(ub, 0x40);
      if (len == 0 || addr == IntPtr.Zero) return null;
      byte[] s = new byte[len];
      if (!ReadProcessMemory(h, addr, s, len, out ret)) return null;
      return Encoding.Unicode.GetString(s);
    } finally { CloseHandle(h); }
  }
}
'@
    } catch {
      Write-Host ("[warn] CWD probe unavailable ({0}); falling back to the command-line heuristic." -f $_.Exception.Message)
      return @{ ok = $false; holders = @() }
    }
  }
  # 安装目录名解析成真实路径，并换出 NT 形式：PEB 里的 CWD 是 \Device\HarddiskVolumeN\… 。
  $resolved = (Resolve-Path -LiteralPath $InstallDir -ErrorAction SilentlyContinue).Path
  if (-not $resolved) { return @{ ok = $false; holders = @() } }   # 安装目录还不存在（首装）：探针无从测，交给调用方判
  $native = $null
  try { $native = [System.IO.Path]::GetFullPath($resolved) } catch { $native = $resolved }
  $prefixes = @($native.TrimEnd('\'), "\\?\$($native.TrimEnd('\'))")
  $out = @()
  foreach ($p in Get-CimInstance Win32_Process) {
    if ($p.ProcessId -eq $PID) { continue }
    $cwd = $null
    try { $cwd = [AiosPebProbe]::Cwd([int]$p.ProcessId) } catch { $cwd = $null }
    if (-not $cwd) { continue }
    # CWD 可能是符号链/junction 下的路径，也可能带尾反斜杠；统一去尾后比前缀。
    $clean = $cwd.TrimEnd('\')
    foreach ($pre in $prefixes) {
      if ($clean -eq $pre -or $clean.StartsWith("$pre\", [StringComparison]::OrdinalIgnoreCase)) {
        $out += [pscustomobject]@{ ProcessId = $p.ProcessId; Name = $p.Name; Cwd = $clean }
        break
      }
    }
  }
  return @{ ok = $true; holders = @($out) }
}

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

function Copy-VerifiedLocalFile([string]$Source, [string]$OutFile) {
  Write-Host "+ copy $Source"
  Copy-Item -LiteralPath $Source -Destination $OutFile -Force
  try {
    Assert-DownloadedArchive -Path $OutFile
  } catch {
    # 只删拷过来的副本，原文件不动；否则残副本会跟着走到 Expand-Archive。
    Remove-Item -LiteralPath $OutFile -Force -ErrorAction SilentlyContinue
    throw
  }
}

function Invoke-NodeDownload([string]$NodeCommand, [string]$Url, [string]$OutFile) {
  # 中文注释：本机实测 Windows 的 Schannel 通道（Invoke-WebRequest 与 git-bash curl）对
  # GitHub CDN 会被中途重置，而同 URL 走 Node 自带 TLS 栈稳定成功。Node 是 AIOS 的硬
  # 依赖，所以把 Node 当作首选下载器：拉不全就报错退出，绝不静默留残文件。
  $helper = Join-Path ([System.IO.Path]::GetTempPath()) ("aios-fetch-" + [guid]::NewGuid().ToString("n") + ".mjs")
  $body = @'
import { writeFile } from 'node:fs/promises';
const [url, out] = process.argv.slice(2);
try {
  const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(180000) });
  if (!res.ok) {
    const permanent = res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 425 && res.status !== 429;
    const failure = new Error('HTTP ' + res.status + (permanent ? ' (not retryable)' : ''));
    failure.permanent = permanent;
    throw failure;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const declared = Number(res.headers.get('content-length') || 0);
  if (declared > 0 && declared !== buf.length) {
    throw new Error('content-length mismatch: declared ' + declared + ', received ' + buf.length);
  }
  await writeFile(out, buf);
  process.stdout.write('bytes=' + buf.length + '\n');
} catch (error) {
  // 中文注释：把真正的死因压成一行，否则重试日志只有一句 exit code 1。
  const cause = error && error.cause && error.cause.message ? error.cause.message : '';
  process.stderr.write('download failed: ' + (error && error.message ? error.message : error) + (cause ? ' (' + cause + ')' : '') + '\n');
  // 退出码 20 = “资产根本不在”（4xx），让外层重试循环知道不该再试。
  process.exitCode = error && error.permanent ? 20 : 1;
}
'@
  Set-Content -LiteralPath $helper -Value $body -Encoding ASCII
  try {
    Invoke-Checked -Command $NodeCommand -Arguments @($helper, $Url, $OutFile)
  } finally {
    Remove-Item -LiteralPath $helper -Force -ErrorAction SilentlyContinue
  }
}

function Assert-DownloadedArchive([string]$Path) {
  if ((Get-Item -LiteralPath $Path).Length -le 0) {
    throw "downloaded file is empty: $Path"
  }
  if ($Path -notmatch '\.zip$') { return }
  # 截断的 zip 缺 end-of-central-directory 记录，ZipFile::OpenRead 会当场报错——
  # 这一步把“残包一路走到 Expand-Archive 才暴死”变成“下载阶段就重试”。
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $archive = $null
  try {
    $archive = [System.IO.Compression.ZipFile]::OpenRead($Path)
    $archive.Dispose()
    $archive = $null
  } catch {
    throw ("downloaded zip is truncated or unreadable: {0} :: {1}" -f $Path, $_.Exception.Message)
  } finally {
    if ($null -ne $archive) { $archive.Dispose() }
  }
}

function Download-File([string]$Url, [string]$OutFile) {
  if ($Url -match '^file://') {
    Copy-VerifiedLocalFile -Source (([System.Uri]$Url).LocalPath) -OutFile $OutFile
    return
  }
  if (Test-Path -LiteralPath $Url) {
    Copy-VerifiedLocalFile -Source $Url -OutFile $OutFile
    return
  }

  $maxAttempts = 4
  if ($env:AIOS_DOWNLOAD_RETRIES -and $env:AIOS_DOWNLOAD_RETRIES -match '^\d+$') {
    $maxAttempts = [Math]::Max(1, [int]$env:AIOS_DOWNLOAD_RETRIES)
  }
  $node = Get-Command node -ErrorAction SilentlyContinue
  $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
  $iwr = Get-Command Invoke-WebRequest -ErrorAction SilentlyContinue
  $lastError = "no downloader available"
  Write-Host "+ download $Url"

  for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
    try {
      Remove-Item -LiteralPath $OutFile -Force -ErrorAction SilentlyContinue
      if ($node) {
        Invoke-NodeDownload -NodeCommand $node.Source -Url $Url -OutFile $OutFile
      } elseif ($curl) {
        Invoke-Checked -Command $curl.Source -Arguments @("-fsSL", "--retry", "3", "--retry-all-errors", "-o", $OutFile, $Url)
      } elseif ($iwr) {
        Enable-Tls12
        if ($iwr.Parameters.ContainsKey('UseBasicParsing')) {
          Invoke-WebRequest -Uri $Url -OutFile $OutFile -UseBasicParsing
        } else {
          Invoke-WebRequest -Uri $Url -OutFile $OutFile
        }
      } else {
        throw "no downloader available (need node, curl.exe, or Invoke-WebRequest)"
      }
      Assert-DownloadedArchive -Path $OutFile
      if ($attempt -gt 1) { Write-Host ("[ok] download succeeded on attempt {0}/{1}" -f $attempt, $maxAttempts) }
      return
    } catch {
      $lastError = $_.Exception.Message
      # 中文注释：退出码 20 来自 Node 下载助手，意思是 4xx“资产不存在”——
      # 重试只会浪费时间，直接中断并保留真实原因。
      $permanentHttp = (Test-Path Variable:LASTEXITCODE) -and ($LASTEXITCODE -eq 20)
      # 关键：残文件必须当场清掉，否则下一次 attempt 或后续 Expand-Archive 会在半截包上工。
      Remove-Item -LiteralPath $OutFile -Force -ErrorAction SilentlyContinue
      if ($permanentHttp) {
        throw ("download failed permanently: {0} :: {1}" -f $Url, $lastError)
      }
      Write-Host ("[warn] download attempt {0}/{1} failed: {2}" -f $attempt, $maxAttempts, $lastError)
      if ($attempt -lt $maxAttempts) {
        Start-Sleep -Seconds ([int][Math]::Min(8, [Math]::Pow(2, $attempt)))
      }
    }
  }
  throw ("download failed after {0} attempt(s): {1} :: {2}" -f $maxAttempts, $Url, $lastError)
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

  # 占用预检：只拦“会把目录改名挡住”的那一类持有者——进程 CWD 在树内（见 Get-InstallDirCwdHolder）。
  # 默认只告警（旧目录是“改名让位”而不是删除）；想直接停掉它们就加 -StopHolders。
  $retired = $null
  $holders = @()
  if (Test-Path -LiteralPath $InstallDir) {
    $probed = Get-InstallDirCwdHolder -InstallDir $InstallDir
    if (-not $probed.ok) {
      # 探针不可用（非 x64 / Add-Type 失败）时退回旧的命令行启发式，并明说它是近似：
      # 静默跳过与拿猜值当事实是同一种毛病，所以这里不报“干净”，只报“测不准”。
      $holders = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
        $_.ProcessId -ne $PID -and $_.CommandLine -and ($_.CommandLine -like ("*" + $InstallDir + "*"))
      })
      if ($holders.Count -gt 0) {
        Write-Host ("[warn] CWD probe unavailable; the {0} process(es) below are a command-line approximation, not proof: {1}" -f $holders.Count, $InstallDir)
        foreach ($holder in $holders) { Write-Host ("        PID {0}  {1}" -f $holder.ProcessId, $holder.Name) }
      }
    } else {
      $holders = @($probed.holders)
      if ($holders.Count -gt 0) {
        Write-Host ("[warn] {0} process(es) hold a working directory inside the install dir — these DO block the rename-aside swap:" -f $holders.Count)
        foreach ($holder in $holders) { Write-Host ("        PID {0}  {1}  cwd={2}" -f $holder.ProcessId, $holder.Name, $holder.Cwd) }
      } else {
        Write-Host "[info] CWD probe: no process holds a working directory inside the install dir; the swap is not blocked."
      }
    }
    if ($holders.Count -gt 0 -and $StopHolders) {
      foreach ($holder in $holders) {
        try {
          Stop-Process -Id $holder.ProcessId -Force -ErrorAction Stop
          Write-Host ("        stopped PID {0}" -f $holder.ProcessId)
        } catch {
          Write-Host ("        [warn] could not stop PID {0}: {1}" -f $holder.ProcessId, $_.Exception.Message)
        }
      }
    } elseif ($holders.Count -gt 0) {
      Write-Host "[warn] continuing anyway (old dir is renamed aside, not deleted); pass -StopHolders to stop them automatically."
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
      Write-Host "[error] cannot rename the install dir: a process holds a working directory inside it."
      Write-Host ("        dir:   {0}" -f $InstallDir)
      Write-Host ("        why:   {0}" -f $_.Exception.Message)
      Write-Host "        note:  open file handles, watcher handles and Chrome profiles do NOT block a directory rename on Windows; only a process CWD inside the tree does."
      if ($holders.Count -gt 0) {
        Write-Host "        CWD holders:"
        foreach ($holder in $holders) { Write-Host ("          PID {0}  {1}  cwd={2}" -f $holder.ProcessId, $holder.Name, $holder.Cwd) }
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

  # Console UI 随 CLI 包发布；装完根依赖后在这里把它变成可用的 GUI。
  # AIOS_SKIP_UI=1 供无网络/纯 CLI 场景显式跳过；跳过时如实告知，不假装 GUI 可用。
  $uiRoot = Join-Path $InstallDir "apps/shell/ui"
  $uiPackage = Join-Path $uiRoot "package.json"
  $uiLauncher = Join-Path $InstallDir "scripts/aios-ui.mjs"
  if ((Test-Path -LiteralPath $uiPackage) -and (Test-Path -LiteralPath $uiLauncher)) {
    if ($env:AIOS_SKIP_UI -eq "1") {
      Write-Host "[info] AIOS_SKIP_UI=1; Console UI not built (aios ui will ask you to run ui:setup)"
    } else {
      Write-Host "+ install Console UI deps: npm ci --prefix $uiRoot"
      Invoke-Checked -Command "npm" -Arguments @("ci", "--prefix", $uiRoot, "--engine-strict=false")
      Write-Host "+ build Console UI: node scripts/aios-ui.mjs build"
      Invoke-Checked -Command "node" -Arguments @($uiLauncher, "build", "--root", $InstallDir)
    }
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
