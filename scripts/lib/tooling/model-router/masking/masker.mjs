// 中文注释：隐私遮蔽（magpie 式）——在请求离开本机前把疑似秘密值换成占位符，响应里再换回。
// 本模块只提供纯函数：检测/替换/还原。映射只存内存（调用方持有 Map），绝不落盘、绝不写日志。
// 占位符格式 {{KIND_hash}}，同一值每次得到相同占位符，保证 prompt cache / thinking signature 不被破坏。
import crypto from 'node:crypto';

const PLACEHOLDER_RE = /\{\{([A-Z_]+)_([a-f0-9]{8})\}\}/g;

// 纯函数：给一个值生成稳定占位符（按 kind + 值 hash）。
export function placeholderFor(kind, value) {
  const hash = crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 8);
  return `{{${kind}_${hash}}}`;
}

// 纯函数：检测文本中的疑似秘密值，返回 [{kind, value, start, end}]。只读，不修改。
// 规则：API key / token / 私钥 / 邮箱 / 卡号（Luhn）/ 环境变量赋值。保守：宁可多报。
const PATTERNS = [
  { kind: 'API_KEY', re: /\b(?:sk|pk|rk|ak|key|token|secret)[-_A-Za-z0-9]{16,}\b/g },
  { kind: 'PRIVATE_KEY', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g },
  { kind: 'EMAIL', re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
  { kind: 'ENV_ASSIGN', re: /\b([A-Z_]{3,})\s*=\s*([^\s"']{8,})/g },
];

function luhnOk(num) {
  const digits = String(num).replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0; let parity = digits.length % 2;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[i]);
    if (i % 2 === parity) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return sum % 10 === 0;
}

export function detectSecrets(text) {
  const src = String(text || '');
  const found = [];
  for (const { kind, re } of PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src)) !== null) {
      found.push({ kind, value: m[0], start: m.index, end: m.index + m[0].length });
    }
  }
  // 卡号（13-19 位数字，Luhn 通过）
  const cardRe = /\b\d{13,19}\b/g;
  let cm;
  while ((cm = cardRe.exec(src)) !== null) {
    if (luhnOk(cm[0])) found.push({ kind: 'CARD', value: cm[0], start: cm.index, end: cm.index + cm[0].length });
  }
  return found;
}

// 纯函数：把文本中的秘密值换成占位符，返回 {text, replacements:[{placeholder,value,kind}]}。
// replacements 去重（同一值同一占位符）。store 可选：Map<placeholder,value>，会写入。
export function maskText(text, store = null) {
  const src = String(text || '');
  const secrets = detectSecrets(src);
  // 去重：同一 value 只替换一次占位符
  const unique = [];
  const seen = new Set();
  for (const s of secrets) {
    if (seen.has(s.value)) continue;
    seen.add(s.value);
    unique.push(s);
  }
  // 从后往前替换，避免索引漂移
  const sorted = [...unique].sort((a, b) => b.start - a.start);
  let out = src;
  const replacements = [];
  for (const s of sorted) {
    const ph = placeholderFor(s.kind, s.value);
    out = out.slice(0, s.start) + ph + out.slice(s.end);
    replacements.push({ placeholder: ph, value: s.value, kind: s.kind });
    if (store) store.set(ph, s.value);
  }
  return { text: out, replacements };
}

// 纯函数：把占位符还原为原值。store 优先（内存映射），store 缺失时占位符原样保留（fail-closed：不猜）。
export function unmaskText(text, store = null) {
  const src = String(text || '');
  return src.replace(PLACEHOLDER_RE, (ph) => {
    if (store && store.has(ph)) return store.get(ph);
    return ph;
  });
}

// 纯函数：递归遮蔽 JSON 对象中的所有字符串字段，返回新对象 + replacements。
export function maskObject(obj, store = null) {
  const replacements = [];
  function walk(v) {
    if (typeof v === 'string') {
      const r = maskText(v, store);
      replacements.push(...r.replacements);
      return r.text;
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      const out = {};
      for (const [k, val] of Object.entries(v)) out[k] = walk(val);
      return out;
    }
    return v;
  }
  return { value: walk(obj), replacements };
}

// 流式还原：把占位符在流式 SSE 文本中还原。占位符可能跨 chunk 切分，故保留尾部缓冲。
export function createUnmaskTransform(store = null) {
  const placeholderMax = 40; // {{KIND_8hex}} 最长约 20，留余量
  let carry = '';
  return new TransformStream({
    transform(chunk, controller) {
      const text = carry + new TextDecoder().decode(chunk, { stream: true });
      // 还原完整占位符
      const unmasked = text.replace(/\{\{[A-Z_]+_[a-f0-9]{8}\}\}/g, (ph) => (store && store.has(ph) ? store.get(ph) : ph));
      // 保留尾部可能的半占位符
      const tailMatch = unmasked.match(/\{\{[A-Z_]*_?[a-f0-9]{0,8}\}?}?$/);
      const tailLen = tailMatch ? tailMatch[0].length : 0;
      if (tailLen > 0 && tailLen < placeholderMax) {
        carry = unmasked.slice(-tailLen);
        controller.enqueue(new TextEncoder().encode(unmasked.slice(0, -tailLen)));
      } else {
        carry = '';
        controller.enqueue(new TextEncoder().encode(unmasked));
      }
    },
    flush(controller) {
      if (carry) {
        const final = carry.replace(/\{\{[A-Z_]+_[a-f0-9]{8}\}\}/g, (ph) => (store && store.has(ph) ? store.get(ph) : ph));
        controller.enqueue(new TextEncoder().encode(final));
        carry = '';
      }
    },
  });
}

// 纯函数：递归还原。
export function unmaskObject(obj, store = null) {
  function walk(v) {
    if (typeof v === 'string') return unmaskText(v, store);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      const out = {};
      for (const [k, val] of Object.entries(v)) out[k] = walk(val);
      return out;
    }
    return v;
  }
  return walk(obj);
}