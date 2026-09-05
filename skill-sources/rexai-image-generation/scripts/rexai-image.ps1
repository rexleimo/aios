param(
  [string]$Model,
  [string]$Prompt,
  [string]$Size,
  [int]$N = 0,
  [string[]]$Image = @(),
  [string]$OutputDir = "rexai-images",
  [string]$BaseUrl = $(if ($env:REXAI_BASE_URL) { $env:REXAI_BASE_URL } else { "https://coding.rexai.top" }),
  [int]$IntervalMs = 3000,
  [int]$TimeoutMs = 180000,
  [switch]$Help
)

$ErrorActionPreference = "Stop"

function Normalize-RexAiBaseUrl {
  param([string]$Value = "https://coding.rexai.top")
  if ($null -eq $Value) { $Value = "" }
  $trimmed = $Value.Trim().TrimEnd("/")
  if ($trimmed -match "^https?://") { return $trimmed }
  return "https://coding.rexai.top"
}

function Get-RexAiMimeType {
  param([string]$Path)
  switch ([System.IO.Path]::GetExtension($Path).ToLowerInvariant()) {
    ".jpg" { "image/jpeg"; break }
    ".jpeg" { "image/jpeg"; break }
    ".png" { "image/png"; break }
    ".webp" { "image/webp"; break }
    ".gif" { "image/gif"; break }
    default { "application/octet-stream" }
  }
}

function ConvertTo-RexAiImageInput {
  param([Parameter(Mandatory = $true)][string]$InputValue)
  if ($InputValue -match "^(https?://|data:image/)") { return $InputValue }
  $fullPath = [System.IO.Path]::GetFullPath($InputValue)
  $mime = Get-RexAiMimeType $fullPath
  $bytes = [System.IO.File]::ReadAllBytes($fullPath)
  return "data:$mime;base64,$([Convert]::ToBase64String($bytes))"
}

function New-RexAiImageRequestBody {
  param(
    [Parameter(Mandatory = $true)][string]$Model,
    [Parameter(Mandatory = $true)][string]$Prompt,
    [int]$N = 0,
    [string]$Size,
    [string[]]$Images = @()
  )
  $body = [ordered]@{
    model = $Model
    prompt = $Prompt
  }
  if ($N -gt 0) { $body.n = $N }
  if ($Size) { $body.size = $Size }
  if ($Images -and $Images.Count -gt 0) { $body.images = $Images }
  return $body
}

function Get-RexAiMissingApiKeyMessage {
  @"
Missing RexAI API key.

Recommended setup:
  Windows current PowerShell:
    `$env:REXAI_API_KEY = "cr_xxx"
  Windows persistent user env var, then open a new terminal:
    setx REXAI_API_KEY "cr_xxx"
  macOS/Linux current shell:
    export REXAI_API_KEY="cr_xxx"
  macOS zsh persistent setup, then open a new terminal:
    printf '%s\n' 'export REXAI_API_KEY="cr_xxx"' >> ~/.zshrc
  Linux bash persistent setup, then open a new terminal:
    printf '%s\n' 'export REXAI_API_KEY="cr_xxx"' >> ~/.bashrc

The key is read only from the REXAI_API_KEY environment variable — there is no CLI option to pass it. Never put the key in shell history or command lines.
"@
}

function Invoke-RexAiJson {
  param(
    [Parameter(Mandatory = $true)][string]$Uri,
    [string]$Method = "GET",
    [hashtable]$Headers = @{},
    $Body
  )
  $params = @{
    Uri = $Uri
    Method = $Method
    Headers = $Headers
    UseBasicParsing = $true
  }
  if ($null -ne $Body) {
    $params.ContentType = "application/json"
    $params.Body = ($Body | ConvertTo-Json -Depth 20)
  }

  try {
    $response = Invoke-WebRequest @params
    if (-not $response.Content) { return [pscustomobject]@{} }
    return $response.Content | ConvertFrom-Json
  } catch {
    $message = $_.Exception.Message
    if ($_.Exception.Response) {
      $stream = $_.Exception.Response.GetResponseStream()
      if ($stream) {
        $reader = [System.IO.StreamReader]::new($stream)
        $text = $reader.ReadToEnd()
        if ($text) { $message = $text }
      }
    }
    throw "RexAI request failed: $message"
  }
}

function Get-RexAiResultItems {
  param($Job)
  if (-not $Job.result) { return @() }
  if ($Job.result -is [array]) { return @($Job.result) }
  if ($Job.result.data -is [array]) { return @($Job.result.data) }
  if ($Job.result.images -is [array]) { return @($Job.result.images) }
  return @($Job.result)
}

function Get-RexAiFileExtensionFromUrl {
  param([string]$Url)
  try {
    $uri = [System.Uri]::new($Url)
    $ext = [System.IO.Path]::GetExtension($uri.LocalPath)
    if ($ext) { return $ext }
  } catch {
    return ".png"
  }
  return ".png"
}

function Save-RexAiResultImage {
  param(
    [Parameter(Mandatory = $true)]$Item,
    [Parameter(Mandatory = $true)][string]$OutputDir,
    [Parameter(Mandatory = $true)][int]$Index
  )
  New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

  if ($Item.b64_json) {
    $file = Join-Path $OutputDir ("rexai-{0}.png" -f ($Index + 1))
    [System.IO.File]::WriteAllBytes($file, [Convert]::FromBase64String([string]$Item.b64_json))
    return [ordered]@{
      file = $file
      url = $(if ($Item.url) { $Item.url } else { $null })
      b64_json = $true
      expires_at = $(if ($Item.expires_at) { $Item.expires_at } else { $null })
    }
  }

  if (-not $Item.url) {
    return [ordered]@{
      file = $null
      url = $null
      skipped = $true
      reason = "no url or b64_json"
    }
  }

  $extension = Get-RexAiFileExtensionFromUrl ([string]$Item.url)
  $file = Join-Path $OutputDir ("rexai-{0}{1}" -f ($Index + 1), $extension)
  Invoke-WebRequest -Uri $Item.url -OutFile $file -UseBasicParsing
  return [ordered]@{
    file = $file
    url = $Item.url
    expires_at = $(if ($Item.expires_at) { $Item.expires_at } else { $null })
  }
}

function Invoke-RexAiImageJob {
  param(
    [Parameter(Mandatory = $true)][string]$Model,
    [Parameter(Mandatory = $true)][string]$Prompt,
    [string]$Size,
    [int]$N = 0,
    [string[]]$Image = @(),
    [string]$OutputDir = "rexai-images",
    [string]$BaseUrl = "https://coding.rexai.top",
    [Parameter(Mandatory = $true)][string]$ApiKey,
    [int]$IntervalMs = 3000,
    [int]$TimeoutMs = 180000
  )
  $base = Normalize-RexAiBaseUrl $BaseUrl
  $headers = @{ Authorization = "Bearer $ApiKey" }
  $resolvedImages = @()
  foreach ($imageInput in $Image) {
    $resolvedImages += ConvertTo-RexAiImageInput $imageInput
  }

  $body = New-RexAiImageRequestBody -Model $Model -Prompt $Prompt -N $N -Size $Size -Images $resolvedImages
  $job = Invoke-RexAiJson -Uri "$base/v1/images/generations" -Method "POST" -Headers $headers -Body $body
  if (-not $job.id) { throw "RexAI did not return a job id: $($job | ConvertTo-Json -Depth 20)" }

  $started = Get-Date
  $current = $job
  while ($current.status -notin @("succeeded", "failed")) {
    if (((Get-Date) - $started).TotalMilliseconds -gt $TimeoutMs) {
      throw "Timed out waiting for image job $($job.id); last status=$($current.status)"
    }
    Start-Sleep -Milliseconds $IntervalMs
    $escapedId = [System.Uri]::EscapeDataString([string]$job.id)
    $current = Invoke-RexAiJson -Uri "$base/v1/images/jobs/$escapedId" -Headers $headers
  }

  if ($current.status -eq "failed") {
    throw "RexAI image job failed: $($current | ConvertTo-Json -Depth 20)"
  }

  $items = @(Get-RexAiResultItems $current)
  $saved = @()
  for ($i = 0; $i -lt $items.Count; $i++) {
    $saved += Save-RexAiResultImage -Item $items[$i] -OutputDir $OutputDir -Index $i
  }

  return [ordered]@{
    id = $(if ($current.id) { $current.id } else { $job.id })
    status = $current.status
    product_id = $(if ($current.product_id) { $current.product_id } elseif ($current.productId) { $current.productId } elseif ($job.productId) { $job.productId } else { $Model })
    output_dir = $OutputDir
    results = $saved
  }
}

function Show-RexAiUsage {
  @"
Usage:
  `$env:REXAI_API_KEY = "cr_xxx"
  powershell -ExecutionPolicy Bypass -File scripts/rexai-image.ps1 -Model gpt-image-2 -Prompt "cat" -Size 1024x1024
  powershell -ExecutionPolicy Bypass -File scripts/rexai-image.ps1 -Model gpt-image-2 -Prompt "watercolor" -Image source.png

Options:
  -Model <id>          RexAI image product id
  -Prompt <text>       Image prompt or edit instruction
  -Image <path|url>    Reference image for image-to-image; repeatable
  -Size <WxH>          Optional output size
  -N <count>           Optional number of images
  -OutputDir <dir>     Directory for downloaded images, default: rexai-images
  -BaseUrl <url>       Default: https://coding.rexai.top
                       API key is read from the REXAI_API_KEY environment variable only

$(Get-RexAiMissingApiKeyMessage)
"@
}

function Invoke-RexAiImageCli {
  if ($Help) {
    Show-RexAiUsage
    return
  }
  if (-not $env:REXAI_API_KEY) { throw (Get-RexAiMissingApiKeyMessage) }
  if (-not $Model) { throw "Missing required -Model" }
  if (-not $Prompt) { throw "Missing required -Prompt" }

  $result = Invoke-RexAiImageJob `
    -Model $Model `
    -Prompt $Prompt `
    -Size $Size `
    -N $N `
    -Image $Image `
    -OutputDir $OutputDir `
    -BaseUrl $BaseUrl `
    -ApiKey $env:REXAI_API_KEY `
    -IntervalMs $IntervalMs `
    -TimeoutMs $TimeoutMs
  $result | ConvertTo-Json -Depth 20
}

if ($MyInvocation.InvocationName -ne ".") {
  Invoke-RexAiImageCli
}

