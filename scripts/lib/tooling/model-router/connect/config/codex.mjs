import { clientGatewayUrl } from '../targets.mjs';

const BEGIN = '# aios-gateway:begin (managed by `aios model-router connect`; remove via disconnect)';
const END = '# aios-gateway:end';
const topEnd = (lines) => {
  const index = lines.findIndex((line) => /^\s*\[/u.test(line));
  return index === -1 ? lines.length : index;
};

function stripBlock(lines) {
  const begin = lines.findIndex((line) => line.trim() === BEGIN);
  if (begin === -1) return { lines, priorBlock: null };
  const end = lines.findIndex((line, index) => index > begin && line.trim() === END);
  if (end === -1) throw new Error('incomplete managed Codex block; preserve the config and recovery backup');
  return { lines: lines.filter((_, index) => index < begin || index > end), priorBlock: lines.slice(begin, end + 1).join('\n') };
}

function readTop(lines, key) {
  const pattern = new RegExp(`^\\s*${key}\\s*=\\s*(.+?)\\s*$`, 'u');
  const line = lines.slice(0, topEnd(lines)).find((item) => pattern.test(item));
  return line?.match(pattern)?.[1] ?? null;
}

function writeTop(lines, key, value) {
  const pattern = new RegExp(`^\\s*${key}\\s*=`, 'u');
  const index = lines.slice(0, topEnd(lines)).findIndex((line) => pattern.test(line));
  if (value === null) {
    if (index !== -1) lines.splice(index, 1);
  } else if (index !== -1) lines[index] = `${key} = ${value}`;
  else lines.splice(topEnd(lines), 0, `${key} = ${value}`);
}

export function editCodex(text, gatewayUrl, modelId = 'aios-auto') {
  const { lines, priorBlock } = stripBlock(String(text || '').split('\n'));
  if (!priorBlock && lines.some((line) => /^\s*\[model_providers\.(?:aios-gateway|"aios-gateway")(?:\]|\.)/u.test(line))) {
    throw new Error('unmanaged Codex aios-gateway provider already exists; preserve it and choose another config');
  }
  const backup = { modelProvider: readTop(lines, 'model_provider'), model: readTop(lines, 'model'), priorBlock };
  writeTop(lines, 'model_provider', JSON.stringify('aios-gateway'));
  writeTop(lines, 'model', JSON.stringify(modelId));
  const block = [
    BEGIN, '[model_providers.aios-gateway]', 'name = "aios-gateway"',
    `base_url = ${JSON.stringify(`${clientGatewayUrl(gatewayUrl, 'codex')}/v1`)}`,
    'wire_api = "responses"', 'experimental_bearer_token = "aios-gateway"', 'requires_openai_auth = false',
    '', '[model_providers.aios-gateway.http_headers]', 'x-gateway-client = "codex"', END, '',
  ].join('\n');
  // model_catalog_json is deliberately untouched: a generic /models response is not a Codex catalog.
  return { text: `${lines.join('\n').replace(/\n+$/u, '')}\n\n${block}`, backup, changedKeys: ['model', 'model_provider', '[model_providers.aios-gateway]'] };
}

export function restoreCodex(text, backup) {
  const { lines } = stripBlock(String(text || '').split('\n'));
  writeTop(lines, 'model_provider', backup.modelProvider);
  if (Object.hasOwn(backup, 'model')) writeTop(lines, 'model', backup.model);
  let body = lines.join('\n').replace(/\n+$/u, '');
  if (backup.priorBlock) body = `${body}\n\n${backup.priorBlock}`;
  return `${body}\n`;
}
