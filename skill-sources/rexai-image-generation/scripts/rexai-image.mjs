#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_BASE_URL = 'https://coding.rexai.top';
const DEFAULT_POLL_INTERVAL_MS = 3000;
const DEFAULT_TIMEOUT_MS = 180000;

const MIME_BY_EXT = new Map([
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp'],
  ['.gif', 'image/gif']
]);

export function normalizeBaseUrl(value = DEFAULT_BASE_URL) {
  const trimmed = String(value || '').trim().replace(/\/+$/, '');
  return /^https?:\/\//.test(trimmed) ? trimmed : DEFAULT_BASE_URL;
}

export function parseArgs(argv) {
  const options = {
    baseUrl: process.env.REXAI_BASE_URL || DEFAULT_BASE_URL,
    apiKey: process.env.REXAI_API_KEY || '',
    images: [],
    intervalMs: DEFAULT_POLL_INTERVAL_MS,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    outputDir: 'rexai-images'
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      throw new Error(`Unexpected positional argument: ${arg}`);
    }
    const key = arg.slice(2);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) {
      if (key === 'help') {
        options.help = true;
        continue;
      }
      throw new Error(`Missing value for --${key}`);
    }
    i += 1;

    switch (key) {
      case 'api-key':
        options.apiKey = value;
        break;
      case 'base-url':
        options.baseUrl = value;
        break;
      case 'model':
      case 'prompt':
      case 'size':
        options[key] = value;
        break;
      case 'n':
        options.n = value;
        break;
      case 'image':
        options.images.push(value);
        break;
      case 'output-dir':
        options.outputDir = value;
        break;
      case 'interval-ms':
        options.intervalMs = Number(value);
        break;
      case 'timeout-ms':
        options.timeoutMs = Number(value);
        break;
      default:
        throw new Error(`Unknown option: --${key}`);
    }
  }

  return options;
}

export function buildRequestBody(options) {
  if (!options.model) throw new Error('Missing required --model');
  if (!options.prompt) throw new Error('Missing required --prompt');

  const body = {
    model: options.model,
    prompt: options.prompt
  };

  if (options.n !== undefined) body.n = Number(options.n);
  if (options.size) body.size = options.size;
  if (options.images?.length) body.images = options.images;
  return body;
}

export function apiKeyHelpMessage() {
  return `Missing RexAI API key.

Recommended setup:
  Windows current PowerShell:
    $env:REXAI_API_KEY = "cr_xxx"
  Windows persistent user env var, then open a new terminal:
    setx REXAI_API_KEY "cr_xxx"
  macOS/Linux current shell:
    export REXAI_API_KEY="cr_xxx"
  macOS zsh persistent setup, then open a new terminal:
    printf '%s\\n' 'export REXAI_API_KEY="cr_xxx"' >> ~/.zshrc
  Linux bash persistent setup, then open a new terminal:
    printf '%s\\n' 'export REXAI_API_KEY="cr_xxx"' >> ~/.bashrc

Avoid committing API keys. For one-off use only, pass --api-key "cr_xxx".`;
}

export async function resolveImageInput(input) {
  if (/^(https?:\/\/|data:image\/)/.test(input)) return input;
  const filePath = resolve(input);
  const ext = extname(filePath).toLowerCase();
  const mime = MIME_BY_EXT.get(ext) || 'application/octet-stream';
  const bytes = await readFile(filePath);
  return `data:${mime};base64,${bytes.toString('base64')}`;
}

async function requestJson(url, init) {
  const response = await fetch(url, init);
  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }

  if (!response.ok) {
    const message = json?.error?.message || json?.message || response.statusText;
    const code = json?.error?.code || json?.code || response.status;
    throw new Error(`RexAI request failed (${code}): ${message}`);
  }
  return json;
}

function collectResults(job) {
  const result = job?.result;
  if (!result) return [];
  if (Array.isArray(result)) return result;
  if (Array.isArray(result.data)) return result.data;
  if (Array.isArray(result.images)) return result.images;
  return [result];
}

function extensionFromContentType(contentType) {
  if (contentType.includes('png')) return '.png';
  if (contentType.includes('jpeg') || contentType.includes('jpg')) return '.jpg';
  if (contentType.includes('webp')) return '.webp';
  if (contentType.includes('gif')) return '.gif';
  return '.png';
}

async function saveResultImage(item, outputDir, index) {
  await mkdir(outputDir, { recursive: true });

  if (item.b64_json) {
    const file = join(outputDir, `rexai-${index + 1}.png`);
    await writeFile(file, Buffer.from(item.b64_json, 'base64'));
    return { file, b64_json: true, url: item.url || null, expires_at: item.expires_at || null };
  }

  if (!item.url) return { file: null, url: null, skipped: true, reason: 'no url or b64_json' };

  const response = await fetch(item.url);
  if (!response.ok) {
    throw new Error(`Failed to download image ${item.url}: HTTP ${response.status}`);
  }
  const contentType = response.headers.get('content-type') || '';
  const urlExt = extname(new URL(item.url).pathname);
  const ext = urlExt || extensionFromContentType(contentType);
  const file = join(outputDir, `rexai-${index + 1}${ext}`);
  await writeFile(file, Buffer.from(await response.arrayBuffer()));
  return { file, url: item.url, expires_at: item.expires_at || null };
}

async function sleep(ms) {
  await new Promise(resolveSleep => setTimeout(resolveSleep, ms));
}

export async function createAndWait(options) {
  if (!options.apiKey) throw new Error(apiKeyHelpMessage());
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const resolvedImages = [];
  for (const image of options.images || []) {
    resolvedImages.push(await resolveImageInput(image));
  }

  const body = buildRequestBody({ ...options, images: resolvedImages });
  const job = await requestJson(`${baseUrl}/v1/images/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${options.apiKey}`
    },
    body: JSON.stringify(body)
  });

  if (!job.id) throw new Error(`RexAI did not return a job id: ${JSON.stringify(job)}`);

  const started = Date.now();
  let current = job;
  while (!['succeeded', 'failed'].includes(current.status)) {
    if (Date.now() - started > options.timeoutMs) {
      throw new Error(`Timed out waiting for image job ${job.id}; last status=${current.status}`);
    }
    await sleep(options.intervalMs);
    current = await requestJson(`${baseUrl}/v1/images/jobs/${encodeURIComponent(job.id)}`, {
      headers: { Authorization: `Bearer ${options.apiKey}` }
    });
  }

  if (current.status === 'failed') {
    throw new Error(`RexAI image job failed: ${JSON.stringify(current)}`);
  }

  const results = collectResults(current);
  const saved = [];
  for (let i = 0; i < results.length; i += 1) {
    saved.push(await saveResultImage(results[i], options.outputDir, i));
  }

  return {
    id: current.id || job.id,
    status: current.status,
    product_id: current.product_id || current.productId || job.productId || body.model,
    output_dir: options.outputDir,
    results: saved
  };
}

function usage() {
  return `Usage:
  REXAI_API_KEY=cr_xxx node scripts/rexai-image.mjs --model gpt-image-2 --prompt "cat" --size 1024x1024
  REXAI_API_KEY=cr_xxx node scripts/rexai-image.mjs --model gpt-image-2-i2i --prompt "watercolor" --image source.png

Options:
  --model <id>          RexAI image product id
  --prompt <text>       Image prompt or edit instruction
  --image <path|url>    Reference image for image-to-image; repeatable
  --size <WxH>          Optional output size
  --n <count>           Optional number of images
  --output-dir <dir>    Directory for downloaded images (default: rexai-images)
  --base-url <url>      Default: ${DEFAULT_BASE_URL}
  --api-key <key>       Prefer REXAI_API_KEY env var

${apiKeyHelpMessage()}
`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }
  const result = await createAndWait(options);
  console.log(JSON.stringify(result, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

