param(
  [string]$Components = 'all',
  [ValidateSet('all', 'repo-only', 'opt-in', 'off')]
  [string]$Mode = 'opt-in',
  [ValidateSet('all', 'codex', 'claude', 'gemini', 'opencode')]
  [string]$Client = 'all',
  [switch]$WithPlaywrightInstall,
  [switch]$SkipDoctor,
  [switch]$SelfUpdate,
  [switch]$SkipSelfUpdate,
  [switch]$Help,
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$ExtraArgs
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$wrapper = Join-Path $PSScriptRoot 'aios.ps1'
$forward = @('update')
if ($Help) {
  $forward += '--help'
} else {
  $forward += @('--components', $Components, '--mode', $Mode, '--client', $Client)
  if ($WithPlaywrightInstall) { $forward += '--with-playwright-install' }
  if ($SkipDoctor) { $forward += '--skip-doctor' }
  if ($SelfUpdate) { $forward += '--self-update' }
  if ($SkipSelfUpdate) { $forward += '--skip-self-update' }
  if ($ExtraArgs) { $forward += $ExtraArgs }
}

& $wrapper @forward
exit $LASTEXITCODE
