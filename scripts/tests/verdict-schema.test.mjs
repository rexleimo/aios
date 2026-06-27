import assert from 'node:assert/strict';
import test from 'node:test';

import {
  VERDICT_SECTIONS,
  parseVerdictText,
  validateVerdictCompleteness,
} from '../lib/skills/verdict-schema.mjs';

const VALID_VERDICT = `VERDICT:
FILES_REVIEWED:
  - skill-sources/verification-loop/SKILL.md: lines 1-80 (changed)
  - scripts/lib/skills/verdict-schema.mjs: lines 1-120 (new)
CHECKS:
  - typecheck: PASS
  - test suite: PASS (8/8)
  - lint: PASS
CODE:
  > export function validateVerdictCompleteness(parsed) {
  >   for (const section of VERDICT_SECTIONS) { ... }
  > }
VALIDATION:
  APPROVED — all checks pass and schema is complete
`;

test('VERDICT_SECTIONS exposes the four required sections in order', () => {
  assert.deepEqual(VERDICT_SECTIONS, ['FILES_REVIEWED', 'CHECKS', 'CODE', 'VALIDATION']);
});

test('valid 4-section verdict passes validation', () => {
  const parsed = parseVerdictText(VALID_VERDICT);
  const result = validateVerdictCompleteness(parsed);

  assert.equal(result.approved, true);
  assert.deepEqual(result.missing_sections, []);
  assert.deepEqual(result.empty_sections, []);
  assert.deepEqual(result.next_actions, []);

  assert.equal(parsed.present.FILES_REVIEWED, true);
  assert.equal(parsed.present.CHECKS, true);
  assert.equal(parsed.present.CODE, true);
  assert.equal(parsed.present.VALIDATION, true);

  assert.match(parsed.FILES_REVIEWED, /SKILL\.md/);
  assert.match(parsed.CHECKS, /typecheck: PASS/);
  assert.match(parsed.CODE, /validateVerdictCompleteness/);
  assert.match(parsed.VALIDATION, /APPROVED/);
});

test('missing sections are detected and produce a REJECT with next_actions', () => {
  // Drop CHECKS and VALIDATION entirely.
  const missingVerdict = `VERDICT:
FILES_REVIEWED:
  - skill-sources/verification-loop/SKILL.md: lines 1-80 (changed)
CODE:
  > some snippet
`;
  const parsed = parseVerdictText(missingVerdict);
  const result = validateVerdictCompleteness(parsed);

  assert.equal(result.approved, false);
  assert.ok(result.missing_sections.includes('CHECKS'));
  assert.ok(result.missing_sections.includes('VALIDATION'));
  assert.ok(!result.missing_sections.includes('FILES_REVIEWED'));
  assert.ok(!result.missing_sections.includes('CODE'));

  assert.ok(result.next_actions.some((a) => a.includes('CHECKS')));
  assert.ok(result.next_actions.some((a) => a.includes('VALIDATION')));
});

test('empty sections (header present, body blank) are flagged as incomplete', () => {
  const emptyVerdict = `FILES_REVIEWED:
  - some/file.ts: lines 1-10
CHECKS:

CODE:
  > snippet
VALIDATION:
  APPROVED
`;
  const parsed = parseVerdictText(emptyVerdict);
  const result = validateVerdictCompleteness(parsed);

  assert.equal(result.approved, false);
  assert.deepEqual(result.missing_sections, []);
  assert.deepEqual(result.empty_sections, ['CHECKS']);
  assert.ok(result.next_actions.some((a) => a.includes('CHECKS')));
  assert.ok(result.next_actions.some((a) => /Re-run verification/.test(a)));
});

test('completely empty input rejects with all four sections missing', () => {
  const parsed = parseVerdictText('');
  const result = validateVerdictCompleteness(parsed);

  assert.equal(result.approved, false);
  assert.deepEqual(result.missing_sections, VERDICT_SECTIONS);
  assert.deepEqual(result.empty_sections, []);
  assert.equal(result.next_actions.length, VERDICT_SECTIONS.length + 1);
});

test('parseVerdictText tolerates surrounding prose and a stray VERDICT marker', () => {
  const noisy = `Here is my report.

VERDICT:
FILES_REVIEWED:
  - a.ts: lines 1-2
CHECKS:
  - typecheck: PASS
CODE:
  > x()
VALIDATION:
  REJECTED — typecheck not actually run

That's it.
`;
  const parsed = parseVerdictText(noisy);
  const result = validateVerdictCompleteness(parsed);

  assert.equal(result.approved, true);
  assert.match(parsed.VALIDATION, /REJECTED/);
});

test('parseVerdictText returns null-safe results for non-string input', () => {
  const parsed = parseVerdictText(undefined);
  assert.equal(parsed.FILES_REVIEWED, '');
  assert.equal(parsed.present.CODE, false);
  const result = validateVerdictCompleteness(parsed);
  assert.equal(result.approved, false);
  assert.deepEqual(result.missing_sections, VERDICT_SECTIONS);
});
