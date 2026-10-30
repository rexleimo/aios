import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_HANDOFF_SCHEMA_REL_PATH,
  buildDispatchBrief,
  validateDispatchBrief,
} from '../../../lib/foundation/agents/brief/index.mjs';
import { renderDispatchBriefMarkdown } from '../../../lib/foundation/agents/brief/render.mjs';
import { buildSystemPrompt, buildUserPrompt } from '../../../lib/execution/harness/team/subagent-runtime/context/prompts.mjs';
import { renderHandoffContract, renderSubagentContextContract } from '../../../lib/foundation/agents/emitters/shared.mjs';
import { buildRolePrompt, buildSystemPromptForSpeaker } from '../../../lib/execution/harness/team/groupchat-runtime/dialogue/prompts.mjs';

function validBrief(overrides = {}) {
  return buildDispatchBrief({
    workItemId: 'vfc-1-w3',
    objective: 'Implement the dispatch brief module',
    role: 'implementer',
    ownedPathPrefixes: ['scripts/lib/foundation/agents/brief/'],
    acceptance: ['node --test scripts/tests/foundation/brief/dispatch-brief.test.mjs'],
    upstreamRefs: [{ kind: 'commit', sha: 'a496f55', note: 'fresh implementer per ticket' }],
    ...overrides,
  });
}

test('buildDispatchBrief refuses input that cannot produce a workable brief', () => {
  assert.throws(() => buildDispatchBrief({ objective: '' }), /invalid dispatch brief: objective is required/);
  assert.throws(
    () => buildDispatchBrief({ objective: 'x', upstreamRefs: [{ kind: 'commit' }] }),
    /upstreamRefs\[0\] needs path or sha/
  );
});

test('buildDispatchBrief forbids relying on implicit parent history, without claiming to prevent host inheritance', () => {
  const brief = validBrief();
  assert.ok(brief.forbidden.includes('relying on implicit parent conversation history'));
  assert.ok(!brief.forbidden.includes('inheriting the parent conversation'));
  assert.equal(brief.outputSchema, DEFAULT_HANDOFF_SCHEMA_REL_PATH);
  assert.equal(brief.schemaVersion, 1);
});

test('buildDispatchBrief rejects unusable refs instead of keeping or dropping half-refs', () => {
  const brief = buildDispatchBrief({ objective: 'x', upstreamRefs: [] });
  assert.deepEqual(brief.upstreamRefs, []);

  assert.throws(
    () => buildDispatchBrief({ objective: 'x', upstreamRefs: [{ kind: 'file' }] }),
    /upstreamRefs\[0\] needs path or sha/
  );
  assert.throws(
    () => buildDispatchBrief({ objective: 'x', upstreamRefs: [{ sha: 'abc' }] }),
    /upstreamRefs\[0\]\.kind is required/
  );

  const good = buildDispatchBrief({
    objective: 'x',
    upstreamRefs: [{ kind: 'commit', sha: 'abc123' }, { kind: 'file', path: 'docs/adr/0004-x.md' }],
  });
  assert.deepEqual(good.upstreamRefs.map((ref) => ref.kind), ['commit', 'file']);
});

test('validateDispatchBrief reports structure only, never guesses', () => {
  const ok = validateDispatchBrief(validBrief());
  assert.deepEqual(ok, { ok: true, errors: [] });

  const bad = validateDispatchBrief({ schemaVersion: 2, objective: '', forbidden: [] });
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.some((error) => error.includes('schemaVersion')));
  assert.ok(bad.errors.some((error) => error.includes('objective')));
  assert.ok(bad.errors.some((error) => error.includes('forbidden')));
});

test('rendered brief is self-contained: objective, ownership, output schema, blocked rule', () => {
  const markdown = renderDispatchBriefMarkdown(validBrief());
  assert.match(markdown, /^## Dispatch Brief$/m);
  assert.match(markdown, /Do not rely on inheriting the parent conversation\./);
  assert.match(markdown, /- objective: Implement the dispatch brief module/);
  assert.match(markdown, /- workItemId: vfc-1-w3/);
  assert.match(markdown, /scripts\/lib\/foundation\/agents\/brief\//);
  assert.match(markdown, /node --test scripts\/tests\/foundation\/brief\/dispatch-brief\.test\.mjs/);
  assert.match(markdown, /scripts\/lib\/tooling\/specs\/registry\/agent-handoff\.schema\.json/);
  assert.match(markdown, /return `blocked` naming the missing item/);
});

test('rendered brief declares read-only ownership instead of staying silent', () => {
  const markdown = renderDispatchBriefMarkdown(validBrief({ ownedPathPrefixes: [], acceptance: [] }));
  assert.match(markdown, /\(none declared: read-only\)/);
  assert.match(markdown, /\(none declared: report how you verified the task\)/);
});

test('render refuses an invalid brief rather than emitting a half-brief', () => {
  assert.throws(
    () => renderDispatchBriefMarkdown({ schemaVersion: 1, objective: '', forbidden: [] }),
    /cannot render invalid dispatch brief/
  );
});

test('subagent prompts carry a dispatch brief built from real plan fields', () => {
  const prompt = buildUserPrompt({
    plan: { taskTitle: 'Fresh context rollout', workItems: [] },
    job: {
      jobId: 'job-1',
      role: 'implementer',
      launchSpec: { workItemRefs: ['w1', 'w2'], handoffTarget: 'reviewer' },
    },
    phase: { label: 'Implement', responsibility: 'Implement the ticket', canEditFiles: true, ownedPathPrefixes: ['scripts/'] },
    dependencyRuns: [],
  });
  assert.match(prompt, /^## Dispatch Brief$/m);
  assert.match(prompt, /- objective: Implement the ticket/);
  assert.match(prompt, /- job-1|workItemId: job-1/);
  assert.match(prompt, /scripts\//);
  assert.match(prompt, /return `blocked` naming the missing item/);
});

test('brief and role card permit evidence discovery before blocked without expanding edit ownership', () => {
  for (const text of [renderDispatchBriefMarkdown(validBrief()), renderSubagentContextContract()]) {
    assert.match(text, /workspace.*tools/i);
    assert.match(text, /authorized sources/i);
    assert.match(text, /after checking/i);
    assert.doesNotMatch(text, /Work (?:from this brief|only from the brief).*only|If the brief lacks a fact|If a fact you need is not in this brief/i);
    assert.match(text, /Do not rely on inheriting the parent conversation/);
  }
  const text = renderDispatchBriefMarkdown(validBrief());
  assert.match(text, /Ownership limits edits/);
  assert.match(text, /read related dependencies/);
  assert.ok(!validBrief().forbidden.includes('assuming facts the brief does not state'));
});

test('runtime task guidance preserves evidence, review and verification without requiring code edits', () => {
  const prompt = buildUserPrompt({
    plan: {
      taskTitle: 'Investigate a failing check',
      contextSummary: 'Keep compatibility with the existing public API',
      executionContext: { text: 'contract-ref: retry must remain idempotent' },
      workItems: [{ itemId: 'w1', type: 'review', summary: 'Verify retry behavior' }],
    },
    job: { jobId: 'review-1', role: 'reviewer', launchSpec: { workItemRefs: ['w1'] } },
    phase: { label: 'Review', responsibility: 'Trace the retry caller and run its regression check', canEditFiles: false },
    dependencyRuns: [{ output: { payload: { findings: ['retry caller is in dependency.mjs'] } } }],
  });
  for (const fact of ['retry must remain idempotent', 'Verify retry behavior', 'dependency.mjs', 'Trace the retry caller']) {
    assert.ok(prompt.includes(fact), `task evidence missing: ${fact}`);
  }
  for (const text of [prompt, buildRolePrompt({ role: 'reviewer', taskTitle: 'Review retries' })]) {
    assert.match(text, /assigned objective/);
    assert.doesNotMatch(text, /If upstream.*require code changes.*no-op|unless you actually changed owned files/);
  }
  assert.match(prompt, /checks needed.*even when no files were edited/);
});

test('both runtime systems replace source output tables with the shared final handoff contract', () => {
  const agent = { systemPrompt: 'Inspect the task carefully.\n\n## Output contract\nLegacy agentId/blockers contract.\n\n## Evidence\nCite tools.' };
  const systems = [
    buildSystemPrompt({ agent, plan: {}, job: { role: 'reviewer' }, phase: null, rexBinding: { workItemKey: 'review-task' } }),
    buildSystemPromptForSpeaker({ agent, rolePinnedMemory: '' }),
  ];
  for (const text of systems) {
    assert.doesNotMatch(text, /Legacy agentId\/blockers/);
    assert.equal((text.match(/Output Contract/g) || []).length, 1);
    assert.match(text, /integer 1/);
    assert.match(text, /exactly one of: ready, blocked, needs-input, completed/);
    assert.match(text, /final (?:reply|response)/i);
    assert.match(text, /tools/i);
    assert.ok(text.includes('Cite tools.'));
  }
  assert.match(systems[0], /Limit edits to ownedPathPrefixes/);
  assert.match(renderHandoffContract(), /final (?:reply|response)/i);
});
