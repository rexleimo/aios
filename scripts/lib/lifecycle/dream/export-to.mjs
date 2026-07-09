/**
 * A2 — dream --to: export durable project knowledge from memo consolidation.
 * Letta-inspired: write durable notes back to pins / AGENTS.md (repo-as-truth).
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

import { appendPinnedMemo } from '../../memo/storage/pinned.mjs';
import { getActiveMemoStorage } from '../../memo/storage/config.mjs';
import { runDream } from './index.mjs';
import { TAXONOMY_CLASSES } from './taxonomy.mjs';
import { collectEvents } from '../../memo/storage/events-read.mjs';

const AGENTS_DREAM_BEGIN = '<!-- AIOS DREAM BEGIN -->';
const AGENTS_DREAM_END = '<!-- AIOS DREAM END -->';

/**
 * Collect durable memo lines (stable preference / durable context) for export.
 */
export async function collectDurableMemoLines(rootDir, { spaces = ['default'], limit = 40 } = {}) {
  const storage = await getActiveMemoStorage(rootDir);
  const lines = [];
  for (const space of spaces) {
    const { events } = await collectEvents(rootDir, { storage, space });
    for (const event of events) {
      const text = String(event.text || '').trim();
      if (!text || text.length < 12) continue;
      const refs = Array.isArray(event.refs) ? event.refs : [];
      const looksDurable = refs.includes('pinned')
        || text.startsWith('[decision]')
        || text.startsWith('[durable]')
        || /MUST|always|never|convention|架构|约定/i.test(text);
      if (!looksDurable) continue;
      lines.push({
        space,
        text: text.slice(0, 500),
        eventId: event.eventId || null,
      });
      if (lines.length >= limit) return lines;
    }
  }
  return lines;
}

function renderDurableMarkdown(lines, { title = 'AIOS dream durable notes' } = {}) {
  const body = lines.length
    ? lines.map((line, i) => `${i + 1}. (${line.space}) ${line.text}`).join('\n')
    : '_No durable memo lines found._';
  return [
    `## ${title}`,
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    body,
    '',
  ].join('\n');
}

/**
 * Write managed dream block into AGENTS.md (or create file).
 */
export async function writeAgentsDreamBlock(rootDir, markdown) {
  const agentsPath = path.join(rootDir, 'AGENTS.md');
  let existing = '';
  try {
    existing = await fs.readFile(agentsPath, 'utf8');
  } catch {
    existing = '';
  }
  const block = `${AGENTS_DREAM_BEGIN}\n${markdown.trim()}\n${AGENTS_DREAM_END}\n`;
  let next;
  if (existing.includes(AGENTS_DREAM_BEGIN) && existing.includes(AGENTS_DREAM_END)) {
    next = existing.replace(
      new RegExp(`${escapeRegExp(AGENTS_DREAM_BEGIN)}[\\s\\S]*?${escapeRegExp(AGENTS_DREAM_END)}\\n?`, 'm'),
      block,
    );
  } else {
    next = existing.trimEnd() ? `${existing.trimEnd()}\n\n${block}` : block;
  }
  await fs.writeFile(agentsPath, next.endsWith('\n') ? next : `${next}\n`, 'utf8');
  return agentsPath;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * @param {{ rootDir: string, mode?: 'preview'|'apply', spaces?: string[], to?: 'pin'|'agents'|'both' }} options
 */
export async function runDreamExport({
  rootDir,
  mode = 'preview',
  spaces = ['default'],
  to = 'pin',
} = {}) {
  const dreamPlan = await runDream({ rootDir, mode: mode === 'apply' ? 'apply' : 'preview', spaces });
  const durableLines = await collectDurableMemoLines(rootDir, { spaces });
  const markdown = renderDurableMarkdown(durableLines);
  const targets = String(to || 'pin').toLowerCase();
  const result = {
    dream: dreamPlan,
    durableCount: durableLines.length,
    targets: targets,
    preview: markdown,
    written: [],
  };

  if (mode !== 'apply') {
    return result;
  }

  if (targets === 'pin' || targets === 'both') {
    const storage = await getActiveMemoStorage(rootDir);
    for (const space of spaces) {
      await appendPinnedMemo(rootDir, {
        storage,
        space,
        content: markdown,
      });
      result.written.push({ kind: 'pin', space });
    }
  }

  if (targets === 'agents' || targets === 'both') {
    const agentsPath = await writeAgentsDreamBlock(rootDir, markdown);
    result.written.push({ kind: 'agents', path: agentsPath });
  }

  return result;
}

export { AGENTS_DREAM_BEGIN, AGENTS_DREAM_END, TAXONOMY_CLASSES };
