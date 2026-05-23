Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# 纯函数：把 PowerShell 风格参数统一转换成 Node CLI 使用的长参数，避免每个 .ps1 包装器重复维护桥接规则。
function ConvertTo-AiosCanonicalArgumentList {
  param(
    [string]$Mode = "",
    [string]$RcFile = "",
    [switch]$Force,
    [switch]$Enable,
    [switch]$Disable,
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Args
  )

  $result = @()
  if ($Mode -and $Mode.Trim()) {
    $result += @("--mode", $Mode)
  }
  if ($RcFile -and $RcFile.Trim()) {
    $result += @("--rc-file", $RcFile)
  }
  if ($Force.IsPresent) {
    $result += "--force"
  }
  if ($Enable.IsPresent) {
    $result += "--enable"
  }
  if ($Disable.IsPresent) {
    $result += "--disable"
  }
  if ($Args -and @($Args).Count -gt 0) {
    $result += @($Args) | Where-Object { $_ -and $_.Trim() }
  }

  return ,$result
}

function Invoke-AiosInternalCommand {
  param(
    [Parameter(Mandatory = $true)]
    [string]$ScriptRoot,
    [Parameter(Mandatory = $true)]
    [string]$Target,
    [Parameter(Mandatory = $true)]
    [string]$Action,
    [string[]]$Arguments = @()
  )

  $wrapper = Join-Path $ScriptRoot 'aios.ps1'
  & $wrapper internal $Target $Action @Arguments
  return $LASTEXITCODE
}
