/**
 * pack-manifest.mjs — Machine-readable manifest + JSONL index siblings for context:pack output.
 *
 * ContextDB `context:pack` produces a Markdown file (e.g. exports/{sessionId}-context.md).
 * This module generates two sibling files alongside it:
 *   {sessionId}-context.manifest.json   — metadata about the pack (sha256, sources, created_at)
 *   {sessionId}-context.index.jsonl     — one JSON record per event with eventId, path, level, text_summary
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

/**
 * @typedef {Object} ManifestSource
 * @property {'memo'|'event'|'checkpoint'|'continuity'|'handoff'} type
 * @property {string} path
 * @property {string} hash
 */

/**
 * @typedef {Object} Manifest
 * @property {number} format_version
 * @property {string} session_id
 * @property {string} content_sha256
 * @property {ManifestSource[]} sources
 * @property {string} created_at  — ISO-8601 timestamp
 */

/**
 * @typedef {Object} IndexRecord
 * @property {string} eventId     — e.g. "session-id#3"
 * @property {string} path        — e.g. "exports/session-id-context.md"
 * @property {'L0'|'L1'|'L2'} level
 * @property {string} text_summary  — first 120 chars of event text
 */

/**
 * Compute the SHA-256 hex digest of a string.
 * @param {string} content
 * @returns {string}
 */
export function computeSha256(content) {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Build a manifest object for a given context:pack export.
 *
 * @param {Object} options
 * @param {string} options.sessionId
 * @param {ManifestSource[]} options.sources  — list of source files that fed the pack
 * @param {string} options.content             — the full Markdown content
 * @returns {Manifest}
 */
export function buildManifest({ sessionId, sources, content }) {
  if (!sessionId || typeof sessionId !== 'string') {
    throw new Error('buildManifest requires a non-empty sessionId string');
  }
  if (typeof content !== 'string') {
    throw new Error('buildManifest requires content as a string');
  }
  const normalizedSources = Array.isArray(sources) ? sources : [];
  const now = new Date().toISOString();

  return {
    format_version: 1,
    session_id: sessionId,
    content_sha256: computeSha256(content),
    sources: normalizedSources.map((s) => ({
      type: s.type || 'unknown',
      path: String(s.path || ''),
      hash: String(s.hash || ''),
    })),
    created_at: now,
  };
}

/**
 * Write the manifest JSON file alongside the Markdown output.
 *
 * @param {string} outputDir   — directory containing the Markdown file
 * @param {string} sessionId
 * @param {Manifest} manifest  — pre-built manifest object
 * @returns {Promise<string>}  — the absolute path written to
 */
export async function writeManifest(outputDir, sessionId, manifest) {
  const filePath = path.resolve(outputDir, `${sessionId}-context.manifest.json`);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const json = `${JSON.stringify(manifest, null, 2)}\n`;
  await fs.writeFile(filePath, json, 'utf8');
  return filePath;
}

/**
 * Classify an event into a context tier level (L0/L1/L2).
 *
 * Heuristic (matches CONTEXT_TIERS in facade.mjs):
 *   L0 — core session events (prompts, responses, checkpoints)
 *   L1 — relevant events (errors, tool calls, refs)
 *   L2 — background / everything else
 *
 * @param {Object} event
 * @returns {'L0'|'L1'|'L2'}
 */
export function classifyEventLevel(event) {
  if (!event || !event.kind) return 'L2';
  const kind = String(event.kind).toLowerCase();

  // L0: core interaction kinds
  if (['prompt', 'response', 'checkpoint', 'plan', 'instruction', 'objective'].includes(kind)) {
    return 'L0';
  }

  // L1: operational kinds
  if (['error', 'tool', 'tool_call', 'tool_result', 'ref', 'file', 'diff', 'search', 'summary'].includes(kind)) {
    return 'L1';
  }

  // L2: everything else
  return 'L2';
}

/**
 * Build a single JSONL index record from an event.
 *
 * @param {Object} options
 * @param {string} options.sessionId
 * @param {Object} options.event         — raw ContextEvent from core.ts
 * @param {string} [options.outputPath]  — relative path to the Markdown file (for the path field)
 * @returns {IndexRecord}
 */
export function buildIndexRecord({ sessionId, event, outputPath }) {
  if (!sessionId) throw new Error('buildIndexRecord requires sessionId');
  if (!event) throw new Error('buildIndexRecord requires event');

  const eventId = event.seq
    ? `${sessionId}#${event.seq}`
    : `${sessionId}#?`;

  const textRaw = String(event.text ?? '');
  // First 120 chars; break at word boundary if possible
  const summary = textRaw.length <= 120
    ? textRaw
    : textRaw.slice(0, 117) + '...';

  return {
    eventId,
    path: outputPath || '',
    level: classifyEventLevel(event),
    text_summary: summary,
  };
}

/**
 * Write the JSONL index file alongside the Markdown output.
 *
 * @param {string} outputDir   — directory containing the Markdown file
 * @param {string} sessionId
 * @param {Array<Object>} events  — array of raw ContextEvent objects
 * @param {Object} [options]
 * @param {string} [options.outputPath]  — relative path to the Markdown file
 * @returns {Promise<{indexPath: string, records: IndexRecord[]}>}
 */
export async function writeIndex(outputDir, sessionId, events, options = {}) {
  if (!Array.isArray(events)) {
    throw new Error('writeIndex requires events as an array');
  }

  const records = events.map((event) =>
    buildIndexRecord({ sessionId, event, outputPath: options.outputPath || '' })
  );

  const filePath = path.resolve(outputDir, `${sessionId}-context.index.jsonl`);
  await fs.mkdir(path.dirname(filePath), { recursive: true });

  const lines = records.map((r) => JSON.stringify(r)).join('\n') + '\n';
  await fs.writeFile(filePath, lines, 'utf8');

  return { indexPath: filePath, records };
}
