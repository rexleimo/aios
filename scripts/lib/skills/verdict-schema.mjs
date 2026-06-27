/**
 * Structured verdict schema utilities for the verification-loop skill.
 *
 * Inspired by the-pair v2.0.2 quality_gate.rs: a verification verdict MUST
 * contain four sections — FILES_REVIEWED, CHECKS, CODE, VALIDATION. Missing
 * any section is an automatic REJECT.
 *
 * This module uses plain regex/string matching — no LLM calls — so it can run
 * inside doctor/gate checks and unit tests without network access.
 */

/**
 * Canonical, ordered list of the four required verdict sections.
 * Order matters for rendering; presence checks are order-independent.
 */
export const VERDICT_SECTIONS = ['FILES_REVIEWED', 'CHECKS', 'CODE', 'VALIDATION'];

/**
 * Parse a verdict text block into its four named sections.
 *
 * A section header is a line beginning with one of the section names followed
 * by a colon, e.g. `FILES_REVIEWED:`. Content for a section runs from the line
 * after its header until the next recognized section header (or end of input).
 *
 * Sections that are absent from the text are returned as empty strings, so the
 * caller can distinguish "header missing" (absent key) vs "header present but
 * empty body" (key present, empty string) — though in practice both are surfaced
 * as missing by validateVerdictCompleteness via the `raw`/`present` flags.
 *
 * @param {string} text - raw verdict text block.
 * @returns {{
 *   FILES_REVIEWED: string,
 *   CHECKS: string,
 *   CODE: string,
 *   VALIDATION: string,
 *   present: { FILES_REVIEWED: boolean, CHECKS: boolean, CODE: boolean, VALIDATION: boolean },
 * }} parsed verdict shape.
 */
export function parseVerdictText(text) {
  const raw = String(text ?? '');
  const lines = raw.split(/\r?\n/);

  const result = {
    FILES_REVIEWED: '',
    CHECKS: '',
    CODE: '',
    VALIDATION: '',
    present: {
      FILES_REVIEWED: false,
      CHECKS: false,
      CODE: false,
      VALIDATION: false,
    },
  };

  // Header line: optional leading whitespace, the section name, then a colon.
  const headerRe = /^\s*(FILES_REVIEWED|CHECKS|CODE|VALIDATION)\s*:\s*$/;

  let current = null;
  const buffers = { FILES_REVIEWED: [], CHECKS: [], CODE: [], VALIDATION: [] };

  for (const line of lines) {
    const match = line.match(headerRe);
    if (match) {
      current = match[1];
      result.present[current] = true;
      continue;
    }
    if (current) buffers[current].push(line);
  }

  for (const section of VERDICT_SECTIONS) {
    result[section] = buffers[section].join('\n').trim();
  }

  return result;
}

/**
 * Validate that a parsed verdict has all four required sections present and
 * non-empty.
 *
 * @param {ReturnType<typeof parseVerdictText>} parsed - output of parseVerdictText.
 * @returns {{
 *   approved: boolean,
 *   missing_sections: string[],
 *   empty_sections: string[],
 *   next_actions: string[],
 * }} validation result.
 */
export function validateVerdictCompleteness(parsed) {
  const missing_sections = [];
  const empty_sections = [];
  const next_actions = [];

  for (const section of VERDICT_SECTIONS) {
    const headerPresent = parsed?.present?.[section] === true;
    const body = parsed?.[section] ?? '';
    const hasBody = body.trim().length > 0;

    if (!headerPresent) {
      missing_sections.push(section);
    } else if (!hasBody) {
      empty_sections.push(section);
    }
  }

  const incomplete = missing_sections.length > 0 || empty_sections.length > 0;

  if (incomplete) {
    for (const section of missing_sections) {
      next_actions.push(`Add missing "${section}:" section to the verdict.`);
    }
    for (const section of empty_sections) {
      next_actions.push(`Fill in empty "${section}:" section with concrete evidence.`);
    }
    next_actions.push('Re-run verification before re-asserting completion.');
  }

  return {
    approved: !incomplete,
    missing_sections,
    empty_sections,
    next_actions,
  };
}
