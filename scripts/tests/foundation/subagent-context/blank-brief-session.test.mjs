// VFC-1 completion criterion D3, as an opt-in live measurement.
//
// This file exists because the static tests could only prove that a Dispatch Brief reaches a
// worker prompt. D3 asks a different question — can a session with NO inherited context produce a
// handoff that the gate accepts, without asking anything back — and that question has exactly one
// honest answer method: run it. Three properties, two model calls:
//
//   P1 brief-sufficiency     every fact needed is in the brief -> schema-conformant handoff, and
//                            the reported fact must be one the worker MEASURED (the file name and
//                            its line count are only in the workspace, never in the prompt).
//   P2 contract-on-gap       one fact is missing -> status=blocked naming that item. Without P2,
//                            P1 cannot be told apart from "the model guessed well".
//   P3 no stale leakage      a nonce that only the FIRST session could have seen must not appear
//                            in the second session's answer.
//
// It is gated off by default: a live call spends the operator's quota and CI must not be able to.
//   AIOS_VFC1_D3_LIVE=1 node --test scripts/tests/foundation/subagent-context/blank-brief-session.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { buildDispatchBrief } from '../../../lib/foundation/agents/brief/index.mjs';
import { renderDispatchBriefMarkdown } from '../../../lib/foundation/agents/brief/render.mjs';
import {
  renderHandoffContract,
  renderSubagentContextContract,
} from '../../../lib/foundation/agents/emitters/shared.mjs';
import { runOneShotAgent } from '../../../lib/foundation/ctx-agent-core/entry/one-shot.mjs';
import { extractJsonCandidate } from '../../../lib/execution/harness/team/subagent-runtime/run/handoff-output.mjs';

const LIVE = process.env.AIOS_VFC1_D3_LIVE === '1';
const AGENT = 'pi-coding-agent';
const NOTES_LINES = 3;
// The line count and this nonce are facts of the WORKSPACE only. Nothing in the prompt states
// them, so a correct answer can only come from reading the file inside the session.
const SESSION_NONCE = `D3-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;

// Conformance is checked against the schema FILE, because a hand-written copy of the field list
// here would only prove that two copies agree.
const schema = JSON.parse(fs.readFileSync(path.resolve(
  import.meta.dirname, '../../../../scripts/lib/tooling/specs/registry/agent-handoff.schema.json'), 'utf8'));

function schemaErrors(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return ['not a single JSON object'];
  const errors = [];
  for (const field of schema.required) if (!(field in payload)) errors.push(`missing ${field}`);
  for (const [field, value] of Object.entries(payload)) {
    const spec = schema.properties?.[field];
    if (!spec) { errors.push(`${field} is not allowed (additionalProperties=${schema.additionalProperties})`); continue; }
    if (spec.const !== undefined && value !== spec.const) errors.push(`${field}=${JSON.stringify(value)} !== const ${spec.const}`);
    if (spec.enum && !spec.enum.includes(value)) errors.push(`${field}=${value} outside enum`);
    if (spec.type === 'integer' && !Number.isInteger(value)) errors.push(`${field} must be an integer`);
    if (spec.type === 'array' && !Array.isArray(value)) errors.push(`${field} must be an array`);
  }
  return errors;
}

function workerPrompt({ brief, workspace }) {
  return [
    '# AIOS worker turn — blank context session',
    '',
    renderDispatchBriefMarkdown(brief),
    '',
    '## Subagent context contract',
    renderSubagentContextContract(),
    '',
    '## Output contract',
    renderHandoffContract({ role: brief.role, handoffTarget: 'verification' }),
    '',
    `Your current working directory is the workspace root: ${workspace}`,
    'Act on the brief now and return the handoff object.',
  ].join('\n');
}

function runWorker({ brief, workspace }) {
  const prompt = workerPrompt({ brief, workspace });
  const previous = process.cwd();
  process.chdir(workspace);
  try {
    const result = runOneShotAgent(AGENT, prompt, []);
    return { result, handoff: extractJsonCandidate(result.output || ''), prompt };
  } finally {
    process.chdir(previous);
  }
}

function tempWorkspace(tag) {
  return fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), `aios-d3-${tag}-`));
}

const hostFacts = (r) => `exit=${r.result.exitCode} stop=${r.result.structured?.stopReason} error=${r.result.structured?.errorMessage || '-'} retries=${r.result.structured?.retryCount}`;

let firstRunHandoff = null;

test('P1 a blank session works from the brief alone and returns a conforming handoff',
  { skip: LIVE ? false : 'live model call not requested (set AIOS_VFC1_D3_LIVE=1)' }, () => {
    const workspace = tempWorkspace('p1');
    fs.writeFileSync(path.join(workspace, `notes-${SESSION_NONCE}.txt`), 'alpha\nbeta\ngamma\n', 'utf8');
    const brief = buildDispatchBrief({
      workItemId: 'vfc1-d3-p1',
      objective: `Read the only notes-*.txt file in the workspace root and report its exact line count and its file name in findings.`,
      role: 'rex-implementer',
      ownedPathPrefixes: [`notes-${SESSION_NONCE}.txt`],
      acceptance: ['findings states the file name and its line count'],
      upstreamRefs: [],
      forbidden: ['editing any file'],
    });
    const r = runWorker({ brief, workspace });
    assert.equal(r.result.exitCode, 0, `the host turn must succeed (${hostFacts(r)})`);
    assert.ok(r.handoff, `the answer must carry one JSON object (${hostFacts(r)})`);
    assert.deepEqual(schemaErrors(r.handoff), [], 'the handoff must conform to agent-handoff.schema.json');
    assert.ok(['completed', 'ready'].includes(r.handoff.status),
      `a self-sufficient brief must not come back ${r.handoff.status} (${JSON.stringify(r.handoff.openQuestions)})`);
    const joined = JSON.stringify(r.handoff);
    assert.match(joined, new RegExp(SESSION_NONCE), 'it must name the file it actually read, not a generic one');
    assert.match(joined, new RegExp(`\\b${NOTES_LINES}\\b`), 'it must report the measured line count');
    firstRunHandoff = r.handoff;
  });

test('P2 a missing fact returns blocked naming the item, with no invented answer',
  { skip: LIVE ? false : 'live model call not requested (set AIOS_VFC1_D3_LIVE=1)' }, () => {
    const workspace = tempWorkspace('p2');
    const brief = buildDispatchBrief({
      workItemId: 'vfc1-d3-p2',
      objective: 'Report the exact line count of the file inventory.txt.',
      role: 'rex-implementer',
      ownedPathPrefixes: [],
      acceptance: ['findings states the line count of inventory.txt'],
      upstreamRefs: [],
      forbidden: ['creating files'],
    });
    const r = runWorker({ brief, workspace });
    assert.equal(r.result.exitCode, 0, `the host turn must succeed (${hostFacts(r)})`);
    assert.ok(r.handoff, `the answer must carry one JSON object (${hostFacts(r)})`);
    assert.deepEqual(schemaErrors(r.handoff), [], 'a blocked handoff still has to conform to the schema');
    assert.equal(r.handoff.status, 'blocked',
      `the brief lacks the only fact asked for; got ${r.handoff.status}`);
    assert.match(JSON.stringify(r.handoff), /inventory\.txt/, 'it must name the missing item');
    assert.doesNotMatch(JSON.stringify(r.handoff), /\binventory\.txt has \d+ lines\b/i,
      'it must not invent the answer it cannot observe');
  });

test('P3 the second session cannot see what only the first session saw',
  { skip: LIVE ? false : 'live model call not requested (set AIOS_VFC1_D3_LIVE=1)' }, () => {
    assert.ok(firstRunHandoff, 'P1 must have run so there is a prior-session fact to leak');
    const workspace = tempWorkspace('p3');
    const brief = buildDispatchBrief({
      workItemId: 'vfc1-d3-p3',
      objective: 'Report the number of files in the workspace root.',
      role: 'rex-implementer',
      ownedPathPrefixes: [],
      acceptance: ['findings states the file count'],
      upstreamRefs: [],
      forbidden: ['creating files'],
    });
    const r = runWorker({ brief, workspace });
    assert.equal(r.result.exitCode, 0, `the host turn must succeed (${hostFacts(r)})`);
    assert.ok(r.handoff, `the answer must carry one JSON object (${hostFacts(r)})`);
    const seen = JSON.stringify(r.handoff) + String(r.result.output || '');
    assert.doesNotMatch(seen, new RegExp(SESSION_NONCE, 'u'),
      'a nonce that only the P1 session could know must not reach this answer — that would be inherited context');
    assert.doesNotMatch(seen, /notes-[A-Z0-9]{8}/u,
      'the prior session\'s file name must not appear here either');
    // Deliberately no regex over prose for "did it mention a parent conversation": that is a
    // semantic judgement, and a denial ("no parent context was used") would match it. The
    // objective fact is the absence of the prior session's artefacts, asserted above.
  });
