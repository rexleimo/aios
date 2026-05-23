export const COST_ORDER = Object.freeze(['lowest', 'low', 'medium', 'high', 'highest']);

// 纯函数：统一规范化模型、任务类型、provider 等标识，避免各模块重复 trim/lowercase。
export function normalizeId(value) {
  return String(value || '').trim().toLowerCase();
}

// 纯函数：把标识转换成环境变量片段，例如 security-review -> SECURITY_REVIEW。
export function normalizeEnvKey(value) {
  return String(value || '').trim().toUpperCase().replace(/-/g, '_');
}

// 纯函数：保留非空值并去重，维持输入顺序。
export function uniq(values) {
  return [...new Set(values.filter(Boolean))];
}

// 纯函数：复制普通 JSON 对象，隔离调用方对 registry 原始数据的修改。
export function clonePlain(value) {
  if (!value || typeof value !== 'object') return value || null;
  return JSON.parse(JSON.stringify(value));
}

// 纯函数：识别常见关闭开关文本，供 env/profile 判断复用。
export function isDisabledEnvValue(value) {
  const text = String(value ?? '').trim().toLowerCase();
  return text === '0' || text === 'false' || text === 'off' || text === 'no';
}
