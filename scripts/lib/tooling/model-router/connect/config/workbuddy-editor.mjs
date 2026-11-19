// 中文注释：WorkBuddy 的 ~/.workbuddy/models.json 编辑器。
// 文件两种形状：顶层数组，或 {models:[…],availableModels:[…]}。magpie 往里加 vendor=aios 的条目。
// backup 保存原条目（不存在则 null）+ 原形状，restore 精确还原，不动别的模型条目。
import { detectIndent, serialize } from './json-path.mjs';

const KEY = 'aios-gateway';
const trim = (url) => String(url || '').replace(/\/+$/u, '');

function readShape(text) {
  const trimmed = String(text || '').trim();
  const value = trimmed ? JSON.parse(trimmed) : [];
  if (Array.isArray(value)) return { wrapped: false, list: value, rest: null };
  if (value && typeof value === 'object' && Array.isArray(value.models)) {
    const { models, ...rest } = value;
    return { wrapped: true, list: models, rest };
  }
  throw new SyntaxError('WorkBuddy models config must be an array or {models:[…]}');
}

function entry(gatewayUrl, modelId) {
  return {
    id: `aios/${modelId}`,
    name: `AIOS Gateway · ${modelId}`,
    vendor: 'aios',
    apiKey: KEY,
    url: `${trim(gatewayUrl)}/v1/chat/completions`,
    supportsToolCall: true,
    supportsImages: true,
  };
}

export function editWorkbuddy(text, { gatewayUrl, modelId, catalog = [] }) {
  const indent = detectIndent(text);
  const shape = readShape(text);
  const at = shape.list.findIndex((item) => item && typeof item === 'object' && item.vendor === 'aios' && item.id === `aios/${modelId}`);
  const backup = { wrapped: shape.wrapped, rest: shape.rest, entry: at >= 0 ? shape.list[at] : null, last: null, hadModels: shape.list.length > 0 };
  backup.last = shape.list.length ? shape.list[shape.list.length - 1] : null;
  const others = shape.list.filter((item) => !(item && typeof item === 'object' && item.vendor === 'aios'));
  const next = [...others, entry(gatewayUrl, modelId)];
  const result = shape.wrapped ? { ...shape.rest, models: next } : next;
  return { text: serialize(result, indent), backup, changedKeys: ['models[aios]'] };
}

export function restoreWorkbuddy(text, backup) {
  const indent = detectIndent(text);
  const shape = readShape(text);
  const others = shape.list.filter((item) => !(item && typeof item === 'object' && item.vendor === 'aios'));
  const list = backup.entry ? [...others, backup.entry] : others;
  const result = backup.wrapped ? { ...(backup.rest || {}), models: list } : list;
  return serialize(result, indent);
}
