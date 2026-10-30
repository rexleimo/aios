// The handoff contract a worker sees must state what the schema actually enforces.
//
// Why this file exists (measured, not theorised): the VFC-1 D3 blank-context run handed the
// worker a field list with no types, and the same model returned `schemaVersion: "1.0"` in one
// run and `"1.0.0"` in the other — the schema wants `integer const 1`. A contract that omits a
// constraint the gate enforces is not a strictness problem in the model, it is an incomplete
// instruction from us. So every constraint line in the emitter is pinned here against the
// schema FILE itself: if the schema changes and the card text does not, this fails.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  HANDOFF_CONTRACT_CONSTRAINTS,
  HANDOFF_CONTRACT_FIELDS,
  SUBAGENT_CONTEXT_CONTRACT_LINES,
  renderHandoffContract,
  renderSubagentContextContract,
} from '../../../lib/foundation/agents/emitters/shared.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
// The schema file is the authority; read it rather than restating it here, or this gate would
// only prove that two hand-written copies agree with each other.
const schema = JSON.parse(readFileSync(
  path.join(repoRoot, 'scripts/lib/tooling/specs/registry/agent-handoff.schema.json'), 'utf8'));

const stringArrayFields = Object.entries(schema.properties)
  .filter(([, spec]) => spec.type === 'array' && spec.items?.type === 'string')
  .map(([field]) => field);

test('the contract field list is the schema required list, not a paraphrase of it', () => {
  assert.deepEqual([...HANDOFF_CONTRACT_FIELDS].sort(), [...schema.required].sort());
  assert.deepEqual(Object.keys(schema.properties).sort(), [...schema.required].sort(),
    'schema properties and required must stay one set; the card cannot offer a field the schema forbids');
});

test('every constraint line in the card is a fact the schema declares', () => {
  const text = renderHandoffContract({ role: 'rex-implementer', handoffTarget: 'verification' });
  const versionSpec = schema.properties.schemaVersion;
  if (versionSpec.const !== undefined) {
    assert.equal(versionSpec.type, 'integer', 'schemaVersion is const-checked; the card wording assumes an integer');
    assert.ok(text.includes(`integer ${versionSpec.const}`), 'card must state the exact const value');
    assert.match(text, /not a string like "1\.0"/u, 'the observed failure mode must be named, not just the rule');
  }
  const statusEnum = schema.properties.status.enum;
  assert.ok(Array.isArray(statusEnum) && statusEnum.length > 0);
  for (const value of statusEnum) {
    assert.ok(text.includes(value), `card must list every allowed status, missing ${value}`);
  }
  assert.match(text, /exactly one of: ready, blocked, needs-input, completed/u);

  assert.ok(stringArrayFields.length >= 4, 'expected the array-of-string fields to exist in the schema');
  for (const field of stringArrayFields) {
    assert.ok(text.includes(field), `card must name ${field} as an array of strings`);
  }
  assert.match(text, /arrays of strings/u);

  if (schema.additionalProperties === false) {
    assert.match(text, /Do not add fields beyond/u,
      'the schema rejects unknown fields, so the card has to say so');
  } else {
    assert.doesNotMatch(text, /Do not add fields beyond/u,
      'the card must not forbid extra fields the schema permits');
  }
});

test('the card points at one schema path and pins fromRole/toRole it was given', () => {
  const text = renderHandoffContract({ role: 'rex-architect', handoffTarget: 'merge-gate' });
  assert.equal((text.match(/agent-handoff\.schema\.json/gu) || []).length, 1,
    'exactly one schema reference per card');
  assert.ok(text.includes('fromRole=rex-architect'));
  assert.ok(text.includes('toRole=merge-gate'));
  // The role/target pair is the handoff addressing the worker cannot infer in a blank session.
  assert.doesNotMatch(text, /fromRole=$/mu);
});

test('the context contract still carries its three clauses next to the new constraints', () => {
  const block = renderSubagentContextContract();
  assert.equal(SUBAGENT_CONTEXT_CONTRACT_LINES.length, 3);
  for (const line of SUBAGENT_CONTEXT_CONTRACT_LINES) assert.ok(block.includes(line));
  const text = renderHandoffContract({});
  assert.ok(text.includes('Output a single JSON object (no surrounding text)'),
    'the one-object rule must survive the constraint addition');
});
