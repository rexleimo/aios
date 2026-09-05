$ErrorActionPreference = 'Stop'
$scriptPath = Join-Path $PSScriptRoot 'rexai-image.ps1'
. $scriptPath

function Assert-EqualJson($Actual, $Expected, $Name) {
  $actualJson = $Actual | ConvertTo-Json -Depth 10 -Compress
  $expectedJson = $Expected | ConvertTo-Json -Depth 10 -Compress
  if ($actualJson -ne $expectedJson) {
    throw "$Name failed. Expected $expectedJson, got $actualJson"
  }
}

if ((Normalize-RexAiBaseUrl 'https://coding.rexai.top/') -ne 'https://coding.rexai.top') {
  throw 'Normalize absolute base URL failed'
}
if ((Normalize-RexAiBaseUrl '/') -ne 'https://coding.rexai.top') {
  throw 'Normalize fallback base URL failed'
}

$missingKeyMessage = Get-RexAiMissingApiKeyMessage
if ($missingKeyMessage -notmatch 'setx REXAI_API_KEY') {
  throw 'missing API key message should teach persistent Windows env var setup'
}
if ($missingKeyMessage -notmatch 'export REXAI_API_KEY=') {
  throw 'missing API key message should teach macOS/Linux env var setup'
}
if ($missingKeyMessage -notmatch '\.bashrc') {
  throw 'missing API key message should teach Linux bash persistent env var setup'
}

$textBody = New-RexAiImageRequestBody -Model 'gpt-image-2' -Prompt 'cat' -N 1 -Size '1024x1024'
Assert-EqualJson $textBody ([ordered]@{ model = 'gpt-image-2'; prompt = 'cat'; n = 1; size = '1024x1024' }) 'text body'

$i2iBody = New-RexAiImageRequestBody -Model 'gpt-image-2' -Prompt 'watercolor' -N 2 -Images @('https://example.com/source.png')
Assert-EqualJson $i2iBody ([ordered]@{ model = 'gpt-image-2'; prompt = 'watercolor'; n = 2; images = @('https://example.com/source.png') }) 'image body'

$tmpDir = Join-Path ([System.IO.Path]::GetTempPath()) ([System.Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $tmpDir | Out-Null
try {
  $png = Join-Path $tmpDir 'source.png'
  [System.IO.File]::WriteAllBytes($png, [byte[]](0x89, 0x50, 0x4e, 0x47))
  $dataUrl = ConvertTo-RexAiImageInput $png
  if ($dataUrl -notmatch '^data:image/png;base64,') { throw 'local PNG did not become a data URL' }
  $saved = Save-RexAiResultImage -Item ([pscustomobject]@{ b64_json = [Convert]::ToBase64String([byte[]](1, 2, 3)); url = $null; expires_at = $null }) -OutputDir $tmpDir -Index 0
  if (-not (Test-Path $saved.file)) { throw 'b64 result was not saved' }
} finally {
  Remove-Item -LiteralPath $tmpDir -Recurse -Force
}

Write-Output 'rexai-image PowerShell tests passed'

