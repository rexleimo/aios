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
const DREAM_RELEVANCE_TERMS = /\b(plan|task|tasks|evidence|acceptance|objective|review|memo|sync|writeback|dream)\b/iu;
const DREAM_RELEVANCE_STOPWORDS = new Set([
  'about',
  'active',
  'after',
  'always',
  'before',
  'done',
  'from',
  'into',
  'keep',
  'notes',
  'required',
  'relevant',
  'should',
  'that',
  'this',
  'with',
]);

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

function tokenizeDreamRelevance(text = '') {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff\s-]/giu, ' ')
    .split(/\s+/u)
    .map((token) => token.trim())
    .filter((token) => token.length >= 4 && !DREAM_RELEVANCE_STOPWORDS.has(token));
}

export function selectPlanRelevantDreamLines(plan, durableLines = [], { limit = 8 } = {}) {
  const planTokens = new Set(tokenizeDreamRelevance(`${plan?.title || ''} ${plan?.objective || ''}`));
  return (Array.isArray(durableLines) ? durableLines : [])
    .filter((line) => String(line?.text || '').trim())
    .filter((line) => {
      const text = String(line.text || '').trim();
      if (DREAM_RELEVANCE_TERMS.test(text)) return true;
      const lineTokens = tokenizeDreamRelevance(text);
      return lineTokens.some((token) => planTokens.has(token));
    })
    .slice(0, limit);
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

  // P12: feed durable notes into active intelligent plan as tasks + evidence
  try {
    const planSync = await syncDreamLinesToActivePlan(rootDir, durableLines, { mode });
    if (planSync) result.planSync = planSync;
  } catch {
    // plan optional
  }

  return result;
}

/**
 * Append durable memo lines as pending plan tasks (and evidence) when a plan is active.
 */
export async function syncDreamLinesToActivePlan(rootDir, durableLines = [], { mode = 'preview' } = {}) {
  const {
    readActivePlan,
    addPlanEvidence,
    resolvePlanningStatePath,
  } = await import('../../planning/contract.mjs');
  const fs = await import('node:fs');

  let plan = readActivePlan(rootDir);
  if (!plan || plan.status === 'done') {
    return { ok: false, reason: 'no-active-plan' };
  }

  const lines = selectPlanRelevantDreamLines(plan, durableLines, { limit: 8 });
  if (lines.length === 0) {
    return { ok: true, addedTasks: 0, reason: 'no-durable-lines' };
  }

  if (mode !== 'apply') {
    return {
      ok: true,
      preview: true,
      wouldAddTasks: lines.length,
      sample: lines.slice(0, 3).map((l) => l.text),
    };
  }

  plan = readActivePlan(rootDir);
  const existing = Array.isArray(plan.tasks) ? [...plan.tasks] : [];
  const existingTitles = new Set(existing.map((t) => String(t.title || '').toLowerCase()));
  let added = 0;
  for (const line of lines) {
    const title = String(line.text || '').slice(0, 120);
    if (!title || existingTitles.has(title.toLowerCase())) continue;
    const id = `dream-${existing.length + added + 1}`;
    existing.push({
      id,
      title,
      status: 'pending',
      acceptance: 'Incorporated from dream durable memo export',
      dependsOn: [],
    });
    existingTitles.add(title.toLowerCase());
    added += 1;
  }

  plan = {
    ...plan,
    schemaVersion: 2,
    tasks: existing,
    updatedAt: new Date().toISOString(),
  };
  const statePath = resolvePlanningStatePath(rootDir);
  fs.writeFileSync(statePath, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');

  try {
    addPlanEvidence(rootDir, {
      kind: 'note',
      value: `dream export added ${added} durable task(s)`,
    });
  } catch {
    // ignore
  }

  return { ok: true, addedTasks: added, tasksTotal: existing.length };
}

export { AGENTS_DREAM_BEGIN, AGENTS_DREAM_END, TAXONOMY_CLASSES };
