import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_HANDOFF_SCHEMA_REL_PATH,
  buildDispatchBrief,
  validateDispatchBrief,
} from '../../../lib/foundation/agents/brief/index.mjs';
import { renderDispatchBriefMarkdown } from '../../../lib/foundation/agents/brief/render.mjs';
import { buildUserPrompt } from '../../../lib/execution/harness/team/subagent-runtime/context/prompts.mjs';

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

test('buildDispatchBrief always forbids inheriting the parent conversation', () => {
  const brief = validBrief();
  assert.ok(brief.forbidden.includes('inheriting the parent conversation'));
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
  assert.match(markdown, /You do not inherit the parent conversation\./);
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
  assert.match(markdown, /\(none declared: report how you verified the change\)/);
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
