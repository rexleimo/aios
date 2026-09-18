/**
 * Minimal YAML frontmatter parser for SKILL.md files.
 * Handles the subset of YAML used in AIOS skill frontmatter:
 * - key: value (string, unquoted)
 * - key: "value" (quoted string)
 * - key: [item, ...] (array)
 * - key: { k: v, ... } (flat object)
 * - key: null
 * - key:\n  sub: val (nested object, one level)
 */
import fs from 'node:fs';

/**
 * 中文注释：解析前统一换行。Windows 检出与厂商产物都可能带 CRLF，而 frontmatter
 * 的边界判定是 `line === '---'`；不归一化时 `'---\r'` 判定失败，内部字段既解析不出来，
 * 也不会被 stripAiosFrontmatter 剥掉，会直接泄漏进客户端技能树。
 */
export function normalizeEolText(content) {
  return String(content ?? '').replace(/\r\n?/g, '\n');
}

function stripQuotes(val) {
  const trimmed = val.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseYamlValue(val) {
  const trimmed = val.trim();
  if (trimmed === 'null' || trimmed === '~') return null;
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    const inner = trimmed.slice(1, -1).trim();
    if (inner === '') return [];
    return inner.split(',').map(s => stripQuotes(s.trim())).filter(Boolean);
  }
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    const inner = trimmed.slice(1, -1).trim();
    if (inner === '') return {};
    const obj = {};
    // split by comma, respecting nested braces/brackets
    const parts = [];
    let depth = 0;
    let current = '';
    for (const ch of inner) {
      if (ch === '{' || ch === '[') depth++;
      if (ch === '}' || ch === ']') depth--;
      if (ch === ',' && depth === 0) {
        parts.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    if (current.trim()) parts.push(current.trim());
    for (const part of parts) {
      const colonIdx = part.indexOf(':');
      if (colonIdx === -1) continue;
      const k = part.slice(0, colonIdx).trim();
      const v = parseYamlValue(part.slice(colonIdx + 1).trim());
      obj[k] = v;
    }
    return obj;
  }
  return stripQuotes(trimmed);
}

/**
 * Parse YAML frontmatter from SKILL.md content.
 * Returns a map of top-level keys to parsed values.
 */
export function parseFrontmatter(content) {
  if (typeof content !== 'string') return {};

  const lines = normalizeEolText(content).split('\n');
  if (lines[0] !== '---') return {};

  // Find closing ---
  const closeIdx = lines.findIndex((line, i) => i > 0 && line === '---');
  if (closeIdx === -1) return {};

  const result = {};
  let i = 1;

  while (i < closeIdx) {
    const line = lines[i];
    // Skip empty lines and comments
    if (!line || line.trim() === '' || line.trim().startsWith('#')) {
      i++;
      continue;
    }

    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) {
      i++;
      continue;
    }

    const key = line.substring(0, colonIdx).trim();
    const afterColon = line.substring(colonIdx + 1).trim();

    if (afterColon === '' || afterColon === '|' || afterColon === '>') {
      // Nested structure or multi-line string - scan indented lines
      const nestedLines = [];
      let j = i + 1;
      while (j < closeIdx) {
        const nextLine = lines[j];
        if (nextLine.startsWith('  ') || nextLine.startsWith('\t')) {
          nestedLines.push(nextLine.trim());
          j++;
        } else if (nextLine.trim() === '') {
          // Empty lines within nested block
          nestedLines.push('');
          j++;
        } else {
          break;
        }
      }

      // Process as nested object
      const nestedObj = {};
      let nestedKey = '';
      for (const nl of nestedLines) {
        if (nl === '') continue;
        const nColonIdx = nl.indexOf(':');
        if (nColonIdx === -1) continue;
        const nKey = nl.substring(0, nColonIdx).trim();
        const nVal = nl.substring(nColonIdx + 1).trim();
        nestedObj[nKey] = parseYamlValue(nVal || 'null');
      }
      result[key] = nestedObj;
      i = j;
    } else {
      result[key] = parseYamlValue(afterColon);
      i++;
    }
  }

  return result;
}

/**
 * Read and parse the frontmatter from a SKILL.md file.
 */
export function readSkillFrontmatter(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return parseFrontmatter(fs.readFileSync(filePath, 'utf8'));
}

/** AIOS-internal frontmatter keys to strip before emitting to client skill trees. */
const AIOS_INTERNAL_KEYS = new Set([
  'installCatalogName',
  'clients',
  'scopes',
  'defaultInstall',
  'tags',
  'repoTargets',
  'targetRelativePathBySurface',
]);

/**
 * Strip AIOS-internal frontmatter fields from SKILL.md content.
 * Preserves standard fields (name, description, license, metadata, etc.)
 * so that client skill engines (Codex, Claude, Gemini, OpenCode) only see
 * fields they understand.
 */
export function stripAiosFrontmatter(content) {
  if (typeof content !== 'string') return content;

  // 中文注释：输出恒为 LF —— 调用方把它当作客户端技能的最终内容落盘。
  const normalized = normalizeEolText(content);
  const lines = normalized.split('\n');
  if (lines[0] !== '---') return normalized;

  const closeIdx = lines.findIndex((line, i) => i > 0 && line === '---');
  if (closeIdx === -1) return normalized;

  const top = [];
  const body = lines.slice(closeIdx);
  let i = 1;

  while (i < closeIdx) {
    const line = lines[i];
    if (!line || line.trim() === '') {
      top.push(line);
      i++;
      continue;
    }

    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) {
      top.push(line);
      i++;
      continue;
    }

    const key = line.substring(0, colonIdx).trim();
    if (AIOS_INTERNAL_KEYS.has(key)) {
      // Skip this key and any indented sub-keys (block format)
      i++;
      while (i < closeIdx) {
        const nextLine = lines[i];
        if (nextLine && (nextLine.startsWith('  ') || nextLine.startsWith('\t'))) {
          i++;
        } else if (nextLine && nextLine.trim() === '') {
          i++;
        } else {
          break;
        }
      }
      continue;
    }

    top.push(line);
    i++;
  }

  // Trim trailing blank lines before closing ---
  while (top.length > 1 && top[top.length - 1] === '') {
    top.pop();
  }

  return ['---', ...top, ...body].join('\n');
}
