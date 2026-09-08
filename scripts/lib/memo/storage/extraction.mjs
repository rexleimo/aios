/* B1+B2 runtime side of the extraction contract (shape only, never semantics).
 *
 * The skill contract (`skill-sources/memo/SKILL.md`, "Extraction contract")
 * tells the model what a persistable entry carries; this module is the
 * protocol's deterministic half: it normalizes the five elements
 * (fact/entities/date/evidence_ref/confidence) and rejects malformed ones
 * with reason-coded errors. It never judges whether a fact is true, useful,
 * or "just chatter" — that judgment stays with the model declaration (B2
 * keeps the anti-pattern ban: no greeting/keyword blacklists live here).
 *
 * Claim authority is NOT decided here — see provenance.mjs. This module only
 * guarantees the entry is complete and well-formed enough to be governable.
 */

export const EXTRACTION_CONFIDENCES = Object.freeze(['high', 'medium']);
const CONFIDENCE_SET = new Set(EXTRACTION_CONFIDENCES);
export const EXTRACTION_MAX_ENTITIES = 24;
const ISO_DATE_PREFIX = /^(\d{4})-(\d{2})-(\d{2})/u;

function text(value) {
  return String(value ?? '').trim();
}

function extractionError(reason, message) {
  const error = new Error(message);
  error.code = reason;
  return error;
}

export function normalizeExtractionEntities(value) {
  const list = Array.isArray(value) ? value : (value === undefined || value === null || value === '' ? [] : [value]);
  return [...new Set(list.map(text).filter(Boolean))].slice(0, EXTRACTION_MAX_ENTITIES);
}

/* A date is only a date when it is absolute. Relative anchors ("昨天",
 * "yesterday", "上周", "next Friday") fail the ISO prefix test and are
 * rejected so the writer must resolve them to a calendar date first — the
 * check is a format test, never a word list. Returns YYYY-MM-DD. */
export function normalizeExtractionDate(value, { required = false } = {}) {
  const raw = text(value);
  if (!raw) {
    if (required) throw extractionError('extraction:missing-date', 'extraction date is required: anchor the fact to an absolute ISO date');
    return '';
  }
  const match = raw.match(ISO_DATE_PREFIX);
  if (!match) {
    throw extractionError(
      'extraction:relative-date',
      `extraction date must be an absolute ISO date (got ${JSON.stringify(raw.slice(0, 60))}); resolve relative time to a calendar date first`,
    );
  }
  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) {
    throw extractionError('extraction:bad-date', `extraction date is not a calendar date: ${JSON.stringify(raw.slice(0, 60))}`);
  }
  return `${match[1]}-${match[2]}-${match[3]}`;
}

export function normalizeExtractionConfidence(value, { required = false } = {}) {
  const raw = text(value).toLowerCase();
  if (!raw) {
    if (required) throw extractionError('extraction:missing-confidence', 'extraction confidence is required: high or medium');
    return 'medium';
  }
  if (!CONFIDENCE_SET.has(raw)) {
    throw extractionError(
      'extraction:bad-confidence',
      `extraction confidence must be one of: ${EXTRACTION_CONFIDENCES.join(', ')} (got ${JSON.stringify(raw.slice(0, 40))})`,
    );
  }
  return raw;
}

/* Exactly one evidence ref: verified stamping (B1) requires referencing one
 * and only one runtime evidence, so the field is scalar by construction —
 * arrays are rejected rather than silently taking the first element. */
export function normalizeExtractionEvidenceRef(value, { required = false } = {}) {
  if (Array.isArray(value)) {
    throw extractionError(
      'extraction:single-evidence-only',
      'extraction evidence_ref must reference one and only one evidence; split multi-evidence entries instead of bundling them',
    );
  }
  const raw = text(value);
  if (!raw && required) throw extractionError('extraction:missing-evidence', 'extraction evidence_ref is required: attach the verification command, file:line, or doc path first');
  return raw;
}

export function normalizeExtractionFact(value, { required = true } = {}) {
  const raw = text(value);
  if (!raw && required) throw extractionError('extraction:missing-fact', 'extraction fact is required: one self-contained durable statement');
  return raw;
}

/* Full five-element pass. Absent elements stay absent (compat: old writers
 * that never heard of the contract keep working); present-but-malformed
 * elements throw. Pass { requireEvidence: true } only on paths where the
 * contract mandates an attached evidence before persisting. */
export function normalizeExtractionEntry({
  fact = '',
  text: textValue = '',
  entities = [],
  date = '',
  validAt = '',
  evidenceRef = '',
  evidence_ref = '',
  confidence = '',
  requireEvidence = false,
} = {}) {
  const statement = normalizeExtractionFact(fact || textValue);
  const entry = {
    text: statement,
    entities: normalizeExtractionEntities(entities),
    date: normalizeExtractionDate(date || validAt),
    evidenceRef: normalizeExtractionEvidenceRef(evidenceRef || evidence_ref, { required: requireEvidence }),
    confidence: normalizeExtractionConfidence(confidence),
  };
  return entry;
}
