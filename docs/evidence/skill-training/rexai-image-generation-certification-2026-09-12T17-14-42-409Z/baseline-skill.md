---
name: rexai-image-generation
description: Use when the user wants to generate an image, edit an image, create visual artwork, produce text-to-image output, transform an existing image with image-to-image, or asks for 生图, 生成图片, 文生图, 图生图, text-to-image, image-to-image, AI image, picture generation, image result, image edit, or visual generation.

installCatalogName: rexai-image-generation
clients: [codex, claude, gemini, opencode, hermes, workbuddy]
scopes: [global, project]
defaultInstall:
  global: false
  project: false
tags: [image, generation, rexai]
repoTargets: [codex, claude, gemini, opencode, hermes, workbuddy]
---

# RexAI Image Generation

Use RexAI's async image API to create images and return usable local files.

## Quick Workflow

1. Use `REXAI_API_KEY` for authentication. If it is missing, teach the user how to configure it for their platform before running the job. Read it live from the OS on Windows (`powershell [Environment]::GetEnvironmentVariable('REXAI_API_KEY','Machine')`) — a bash/PowerShell session started before the key was set holds a stale snapshot.
2. Choose the product ID (verify against the current instance's product list with one probe; these IDs have drifted before):
   - Text-to-image: `gpt-image-2`.
   - Image-to-image: **the same `gpt-image-2` product with the `-Image` parameter** — the relay selects the image-to-image route when the body carries `images`. `gpt-image-2-i2i` does NOT exist (`404 image_product_not_found`); do not use it.
3. Pick the zero-install executor for the user's platform:
   - Windows/Codex: use `scripts/rexai-image.ps1`; it only needs built-in PowerShell/.NET.
   - macOS/Linux: use `scripts/rexai-image-macos.sh`; it uses common system tools (`bash`, `curl`, `perl`, `base64`).
4. Use `scripts/rexai-image.mjs` only when Node is already available.
5. Report the local file path, job id, source URL if present, and expiry time if present.

Read `references/api.md` when you need endpoint details, supported sizes, error codes, or examples.

## API Key Setup

First check whether the key is already available. Do not print the key value:

```powershell
if ($env:REXAI_API_KEY) { "REXAI_API_KEY is set" } else { "REXAI_API_KEY is missing" }
```

If it is missing, tell the user to choose one setup path:

Windows PowerShell, current session only:

```powershell
$env:REXAI_API_KEY = "cr_xxx"
```

Windows PowerShell, persistent for new terminals:

```powershell
setx REXAI_API_KEY "cr_xxx"
```

macOS/Linux, current shell only:

```bash
export REXAI_API_KEY="cr_xxx"
```

macOS zsh, persistent for new terminals:

```bash
printf '%s\n' 'export REXAI_API_KEY="cr_xxx"' >> ~/.zshrc
```

Linux bash persistent setup for new terminals:

```bash
printf '%s\n' 'export REXAI_API_KEY="cr_xxx"' >> ~/.bashrc
```

Security rules: never commit `.env` files or API keys, never echo the real key back to the user, and only save persistent configuration when the user explicitly chooses that option.

## Text-To-Image

Windows/Codex:

```powershell
$env:REXAI_API_KEY = "cr_xxx"
powershell -NoProfile -ExecutionPolicy Bypass -File skill-sources/rexai-image-generation/scripts/rexai-image.ps1 `
  -Model gpt-image-2 `
  -Prompt "A cozy orange cat sleeping in warm sunlight" `
  -Size 1024x1024 `
  -OutputDir generated/rexai
```

macOS/Linux:

```bash
export REXAI_API_KEY="cr_xxx"
bash skill-sources/rexai-image-generation/scripts/rexai-image-macos.sh \
  --model gpt-image-2 \
  --prompt "A cozy orange cat sleeping in warm sunlight" \
  --size 1024x1024 \
  --output-dir generated/rexai
```

## Image-To-Image

Pass at least one reference image as a local file path, image URL, or `data:image/...` URL. Local files are converted to data URLs by the script. Use the **same `-Model gpt-image-2`** as text-to-image; the presence of `-Image` makes the relay take the image-to-image route. Do NOT use `gpt-image-2-i2i` — that product does not exist.

Windows/Codex:

```powershell
$env:REXAI_API_KEY = "cr_xxx"
powershell -NoProfile -ExecutionPolicy Bypass -File skill-sources/rexai-image-generation/scripts/rexai-image.ps1 `
  -Model gpt-image-2 `
  -Prompt "Convert this image to watercolor style" `
  -Image path/to/source.png `
  -OutputDir generated/rexai
```

macOS/Linux:

```bash
export REXAI_API_KEY="cr_xxx"
bash skill-sources/rexai-image-generation/scripts/rexai-image-macos.sh \
  --model gpt-image-2 \
  --prompt "Convert this image to watercolor style" \
  --image path/to/source.png \
  --output-dir generated/rexai
```

The script converts local files to `data:image/...;base64,...` before submitting. If you pass a public HTTP URL instead, the relay server downloads it itself — image hosts with hotlink protection (Wikimedia, Taobao, Xiaohongshu CDNs) reject server-side downloads with `403`, so prefer local files or verified-downloadable URLs.

## Optional Node Fallback

If Node is already installed, this equivalent script is available:

```bash
node skill-sources/rexai-image-generation/scripts/rexai-image.mjs \
  --model gpt-image-2 \
  --prompt "A cozy orange cat sleeping in warm sunlight" \
  --size 1024x1024 \
  --output-dir generated/rexai
```

## Operational Rules

- **The API key is read only from the `REXAI_API_KEY` environment variable.** The scripts expose no `-ApiKey`/`--api-key` option — never pass the key as a CLI argument, and never put it in shell history or command lines. On Windows, read it live from the OS if a session started before the key was set (`powershell -NoProfile -Command "[Environment]::GetEnvironmentVariable('REXAI_API_KEY','Machine')"`); bash/PowerShell sessions snapshot env at startup and hold stale values.
- If `REXAI_API_KEY` is missing, show the relevant setup commands from "API Key Setup" and ask the user to configure the key before retrying.
- Do not install Node just for this skill; use PowerShell on Windows and the shell script on macOS/Linux.
- Use an output directory inside the current workspace unless the user requests another path.
- For image-to-image, do not invent a source image; ask for an image path/URL when none is available.
- If a job times out, report the job id and last known status so the user can retry polling.
- If RexAI returns `model_not_found`, `invalid_model`, or `invalid_parameter`, refresh `https://tool.rexai.top/api/api-docs` and update the product ID or parameter names.

## Error Triage (validated 2026-09-05)

A failed job's `error` in the DB is often just `upstream_failed` + `Request failed with status code NNN` (the relay's adapter discards the upstream body on non-2xx). Distinguish by status and by what was sent:

| Symptom | Meaning | Fix |
|---|---|---|
| `404 image_product_not_found` | Product ID does not exist (e.g. `gpt-image-2-i2i`) | Use the real ID (i2i = `gpt-image-2` + images) |
| Job fails `403`, log shows `Image edit source image resolve failed` / `inputKind: http_url` | The **relay server** could not download your http URL reference (hotlink protection) | Convert the image to base64 data URI locally first |
| `403` with body `error code: 1010` | Local Clash proxy mangling the request | Unset `HTTPS_PROXY`/`HTTP_PROXY` and retry direct |
| `401 Invalid token` | Upstream credential on that channel is stale | Rotate the channel credential (operator side) |
| `402 insufficient_direct_balance` | Direct-pay balance / wrong credential | Check balance, or use the env key |

`403 upstream_failed` does NOT mean the product is delisted (a prior session misdiagnosed `gpt-image-2` this way). Always convert references to base64 data URIs, probe with a one-image proof, and read the status against this table before blaming the product.

## Script Output

The scripts print JSON:

```json
{
  "id": "job-id",
  "status": "succeeded",
  "product_id": "gpt-image-2",
  "output_dir": "generated/rexai",
  "results": [
    {
      "file": "generated/rexai/rexai-1.png",
      "url": "https://cdn.example.com/images/result.png",
      "expires_at": "2026-06-29T01:00:00.000Z"
    }
  ]
}
```


