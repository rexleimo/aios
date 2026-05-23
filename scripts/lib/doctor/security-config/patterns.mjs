export function redactFinding(id) {
  return `[redacted:${id}]`;
}

// 纯函数：只返回命中的密钥类型，不暴露原始敏感内容。
export function findSecretPatterns(text) {
  const patterns = [
    { id: 'openai_key', re: /\bsk-[A-Za-z0-9]{20,}\b/g },
    { id: 'aws_access_key', re: /\b(AKIA|ASIA)[0-9A-Z]{16}\b/g },
    { id: 'github_token', re: /\b(ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{20,})\b/g },
    { id: 'google_api_key', re: /\bAIza[0-9A-Za-z-_]{30,}\b/g },
    { id: 'slack_token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
    { id: 'private_key', re: /-----BEGIN(?: [A-Z]+)? PRIVATE KEY-----/g },
    { id: 'bearer_token', re: /\bAuthorization:\s*Bearer\s+[A-Za-z0-9._-]{10,}\b/g },
  ];

  const hits = new Set();
  for (const { id, re } of patterns) {
    if (re.test(text)) hits.add(id);
    re.lastIndex = 0;
  }
  return [...hits];
}

export function findRiskyHookPatterns(text) {
  const patterns = [
    { id: 'curl_pipe_shell', re: /\bcurl\b[\s\S]{0,200}\|\s*(bash|sh)\b/i },
    { id: 'wget_pipe_shell', re: /\bwget\b[\s\S]{0,200}\|\s*(bash|sh)\b/i },
    { id: 'powershell_iex', re: /\bInvoke-WebRequest\b[\s\S]{0,200}\|\s*iex\b/i },
  ];

  const hits = new Set();
  for (const { id, re } of patterns) {
    if (re.test(text)) hits.add(id);
  }
  return [...hits];
}

// 纯函数：递归寻找 JSON 中权限/allowlist 路径下的通配符。
export function scanJsonBroadAllowlists(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, paths: [], error: 'invalid_json' };
  }

  const paths = [];
  const stack = [{ value: parsed, p: [] }];
  while (stack.length > 0) {
    const { value, p } = stack.pop();
    if (Array.isArray(value)) {
      if (value.some((v) => v === '*')) {
        paths.push(p.join('.'));
      }
      for (let i = 0; i < value.length; i += 1) {
        stack.push({ value: value[i], p: [...p, String(i)] });
      }
      continue;
    }
    if (value && typeof value === 'object') {
      for (const [key, nestedValue] of Object.entries(value)) {
        stack.push({ value: nestedValue, p: [...p, key] });
      }
    }
  }

  const filtered = paths.filter((p) => /\ballow|\ballowed|\bpermission|\bpermit/i.test(p));
  return { ok: true, paths: filtered, error: '' };
}