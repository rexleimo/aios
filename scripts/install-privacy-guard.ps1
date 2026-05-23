[CmdletBinding(PositionalBinding = $false)]
param(
  [switch]$Enable,
  [switch]$Disable,
  [ValidateSet("regex", "ollama", "hybrid")]
  [string]$Mode = "",
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$Args
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'lib/powershell/aios-internal-wrapper.ps1')

$passArgs = ConvertTo-AiosCanonicalArgumentList -Mode $Mode -Enable:$Enable -Disable:$Disable -Args $Args
Invoke-AiosInternalCommand -ScriptRoot $PSScriptRoot -Target 'privacy' -Action 'install' -Arguments $passArgs | Out-Null
exit $LASTEXITCODE
