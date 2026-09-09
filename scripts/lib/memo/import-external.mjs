import path from 'node:path';
import { readFile } from 'node:fs/promises';

import { getActiveMemoStorage } from './storage/config.mjs';
import { collectEvents } from './storage/events-read.mjs';

/* F3 migration importers: bring external assistant-memory files into the
 * governed memo queue as candidates. Nothing is promoted here — imported
 * facts land with the ordinary write-time claim semantics (candidate, since
 * importers carry no trusted provenance) and go through the existing
 * candidate review/promote path. Imports are idempotent: facts whose
 * normalized text already exists in the corpus are skipped. */

export const IMPORT_FORMATS = ['claude', 'continue', 'roo', 'conventions'];

const MIN_FACT_CHARS = 8;

function normalizeFactText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

export function splitMarkdownFacts(content) {
  const facts = [];
  for (const rawLine of String(content || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    // Headings are structure, not facts; bullets and numbered lines are.
    if (/^#{1,6}\s/u.test(line)) continue;
    const fact = normalizeFactText(line.replace(/^[-*+]\s+/u, '').replace(/^\d+[.)]\s+/u, ''));
    if (fact.length >= MIN_FACT_CHARS) facts.push(fact);
  }
  return facts;
}

export function parseRooModes(content) {
  let parsed;
  try {
    parsed = JSON.parse(String(content || ''));
  } catch {
    throw new Error('.roomodes import requires valid JSON');
  }
  const modes = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.modes) ? parsed.modes : [];
  const facts = [];
  for (const mode of modes) {
    if (!mode || typeof mode !== 'object') continue;
    const name = String(mode.slug || mode.name || '').trim();
    const body = String(mode.roleDefinition || mode.customInstructions || '').trim();
    if (!body) continue;
    facts.push(normalizeFactText(name ? `Roo mode ${name}: ${body}` : body));
  }
  return facts.filter((fact) => fact.length >= MIN_FACT_CHARS);
}

export function parseExternalFacts({ format, content }) {
  if (format === 'roo') return parseRooModes(content);
  // claude (MEMORY.md), continue (rules markdown), conventions (CONVENTIONS.md)
  return splitMarkdownFacts(content);
}

export async function importExternalMemories(workspaceRoot, {
  format,
  file,
  dryRun = false,
  env = process.env,
} = {}) {
  if (!workspaceRoot) throw new Error('importExternalMemories requires workspaceRoot');
  if (!IMPORT_FORMATS.includes(format)) {
    throw new Error(`unsupported import format: ${format} (supported: ${IMPORT_FORMATS.join(', ')})`);
  }
  if (!file) throw new Error('import requires a --file path');
  const content = await readFile(path.resolve(String(file)), 'utf8');

  const existingTexts = new Set();
  const { events } = await collectEvents(workspaceRoot, { space: '', tolerateMalformed: true, env });
  for (const event of events) existingTexts.add(normalizeFactText(event.text));

  const facts = [];
  let skipped = 0;
  for (const fact of parseExternalFacts({ format, content })) {
    if (existingTexts.has(fact)) {
      skipped += 1;
      continue;
    }
    facts.push(fact);
  }

  if (dryRun) {
    return { format, file, dryRun: true, imported: 0, skipped, facts };
  }

  const storageApi = await import('./storage.mjs');
  const storage = await getActiveMemoStorage(workspaceRoot, { env });
  const turnId = `import-${format}-${new Date().toISOString()}`;
  // The importer acts as a plain tool identity with no publish capability, so
  // the write-time authority verdict lands every imported fact as candidate —
  // the same governed queue as model self-reports, never a forged verified.
  const runtimeIdentity = {
    producerType: 'runtime',
    principalId: `aios-import-${format}`,
    agentId: 'aios-import',
    role: 'assistant',
    capabilities: [],
    sourceRef: `import:${format}`,
  };
  const eventIds = [];
  for (const fact of facts) {
    const record = await storageApi.appendMemoEvent({
      workspaceRoot,
      storage,
      space: 'default',
      text: fact,
      refs: [`import-${format}`],
      scope: 'project_shared',
      agent: 'aios-import',
      runtimeIdentity,
      role: 'assistant',
      kind: 'memo',
      turn: {
        turnId,
        turnType: 'side',
        environment: 'memo',
        hindsightStatus: 'na',
        outcome: 'success',
      },
    });
    eventIds.push(String(record?.eventId || ''));
  }
  return { format, file, dryRun: false, imported: eventIds.length, skipped, eventIds, facts };
}
