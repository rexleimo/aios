/* 中文注释：handoff JSON 抽取独立封装，供 groupchat 和未来 runtime 复用。 */
export function extractHandoffJson(rawOutput) {
  const text = String(rawOutput || '').trim();
  if (!text) return null;

  const fenceMatch = /```(?:json)?\s*\n?([\s\S]*?)\n?```/i.exec(text);
  const candidate = fenceMatch ? fenceMatch[1].trim() : text;
  const firstBrace = candidate.indexOf('{');
  if (firstBrace === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;
  let end = -1;

  for (let i = firstBrace; i < candidate.length; i += 1) {
    const ch = candidate[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') { depth += 1; continue; }
    if (ch === '}') { depth -= 1; if (depth === 0) { end = i + 1; break; } }
  }

  if (end === -1) return null;

  try {
    return JSON.parse(candidate.slice(firstBrace, end));
  } catch {
    return null;
  }
}
