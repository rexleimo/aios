import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { rexNativeProviderBindings, supportedClients } from '../../rex-harness/src/index.mjs';
import { projectionPayloadDigest, readProjectionHistory } from '../../rex-harness/src/clients/projection-manifest.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const REX_ROOT = path.join(ROOT, 'rex-harness');
const CHANGED_SKILLS = [
  'rex-code-review',
  'rex-debug',
  'rex-design',
  'rex-implement',
  'rex-minimal-construction',
  'rex-planning',
  'rex-refactor-hardening',
  'rex-requirements',
  'rex-strict-tdd',
  'rex-tdd',
  'rex-test-design',
  'rex-wayfinder',
  'rex-workflow',
];

test('release gate accepts the private root and packageable Rex child manifest', () => {
  const rootPackage = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const rexPackage = JSON.parse(fs.readFileSync(path.join(REX_ROOT, 'package.json'), 'utf8'));
  assert.equal(rootPackage.private, true);
  assert.equal(rexPackage.name, '@rexleimo/rex-harness');
  assert.match(String(rexPackage.version), /^\d+\.\d+\.\d+$/u);
});

test('release gate finds all required audit reports and seven client targets', () => {
  for (const report of [
    '2026-07-31-rex-wayfinder-map-ticket-audit.md',
    '2026-07-31-rex-planning-vertical-slice-audit.md',
    '2026-08-01-rex-skill-quality-training-matrix.md',
    '2026-08-01-client-invocation-compatibility.md',
    '2026-08-01-memory-hygiene-survey.md',
  ]) {
    assert.equal(fs.existsSync(path.join(ROOT, 'docs', 'reports', report)), true, report);
  }
  assert.deepEqual(supportedClients(), ['codex', 'claude', 'gemini', 'opencode', 'hermes', 'grok', 'workbuddy']);
});

test('release report references only existing test files', () => {
  const reportPath = path.join(ROOT, 'docs', 'reports', '2026-08-01-workflow-v2-release-rollback-gate.md');
  const report = fs.readFileSync(reportPath, 'utf8');
  const testRefs = [...report.matchAll(/\b(?:rex-harness\/)?(?:scripts|tests)\/[a-zA-Z0-9_./-]+\.test\.mjs\b/gu)]
    .map((match) => match[0]);
  assert.ok(testRefs.length > 0, 'release report must contain executable test references');
  for (const ref of testRefs) {
    assert.equal(fs.existsSync(path.join(ROOT, ...ref.split('/'))), true, `missing release test ref: ${ref}`);
  }
});

test('rollback rehearsal keeps a prior digest for every changed canonical Skill', () => {
  const history = readProjectionHistory(REX_ROOT);
  for (const skillId of CHANGED_SKILLS) {
    const current = projectionPayloadDigest(path.join(REX_ROOT, 'skill-sources', skillId));
    const entries = history[skillId] || [];
    assert.ok(entries.includes(current), `${skillId} current digest is not managed`);
    assert.ok(entries.length >= 2, `${skillId} has no prior rollback digest`);
  }
  assert.ok(rexNativeProviderBindings.length >= 13);
});
