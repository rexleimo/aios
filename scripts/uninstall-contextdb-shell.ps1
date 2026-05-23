[CmdletBinding(PositionalBinding = $false)]
param(
  [ValidateSet("all", "repo-only", "opt-in", "off")]
  [string]$Mode = "",
  [string]$RcFile = "",
  [switch]$Force,
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$Args
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'lib/powershell/aios-internal-wrapper.ps1')

$passArgs = ConvertTo-AiosCanonicalArgumentList -Mode $Mode -RcFile $RcFile -Force:$Force -Args $Args
Invoke-AiosInternalCommand -ScriptRoot $PSScriptRoot -Target 'shell' -Action 'uninstall' -Arguments $passArgs | Out-Null
exit $LASTEXITCODE
