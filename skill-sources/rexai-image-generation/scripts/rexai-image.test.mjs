import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { apiKeyHelpMessage, buildRequestBody, normalizeBaseUrl, resolveImageInput } from './rexai-image.mjs';

assert.equal(normalizeBaseUrl('https://coding.rexai.top/'), 'https://coding.rexai.top');
assert.equal(normalizeBaseUrl('/'), 'https://coding.rexai.top');

assert.match(apiKeyHelpMessage(), /setx REXAI_API_KEY/);
assert.match(apiKeyHelpMessage(), /export REXAI_API_KEY=/);
assert.match(apiKeyHelpMessage(), /\.bashrc/);

assert.deepEqual(buildRequestBody({
  model: 'gpt-image-2',
  prompt: 'cat',
  n: '1',
  size: '1024x1024',
  images: []
}), {
  model: 'gpt-image-2',
  prompt: 'cat',
  n: 1,
  size: '1024x1024'
});

assert.deepEqual(buildRequestBody({
  model: 'gpt-image-2-i2i',
  prompt: 'watercolor',
  n: '2',
  images: ['https://example.com/source.png']
}), {
  model: 'gpt-image-2-i2i',
  prompt: 'watercolor',
  n: 2,
  images: ['https://example.com/source.png']
});

const dir = mkdtempSync(join(tmpdir(), 'rexai-image-test-'));
try {
  const png = join(dir, 'source.png');
  writeFileSync(png, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const dataUrl = await resolveImageInput(png);
  assert.match(dataUrl, /^data:image\/png;base64,/);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log('rexai-image tests passed');

