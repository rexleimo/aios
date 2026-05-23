// 纯函数：按大小写不敏感方式读取环境变量，兼容 Windows 的 Path/PATH 差异。
export function getEnvCaseInsensitive(env, key) {
  if (!env) return '';
  if (key in env) return env[key];
  const lowerKey = key.toLowerCase();
  const match = Object.keys(env).find((candidate) => candidate.toLowerCase() === lowerKey);
  return match ? env[match] : '';
}

// 纯函数：解析 Windows PATH 字符串，保留带空格路径并去掉包裹引号。
export function splitWindowsPathEntries(rawPathValue = '') {
  const entries = String(rawPathValue || '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.replace(/^"(.*)"$/u, '$1'));
  return entries;
}

// 纯函数：解析 PATHEXT 并统一补齐点号，供命令探测复用。
export function splitWindowsPathExt(rawPathExt = '') {
  const parts = String(rawPathExt || '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const normalized = part.startsWith('.') ? part : `.${part}`;
      return normalized.toLowerCase();
    });
  return parts;
}
