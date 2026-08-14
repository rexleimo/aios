import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { bindPhaseJobRexActivation, executePhaseJob } from '../lib/harness/subagent-runtime/phase-job.mjs';
import { evaluatePhaseFilePolicy } from '../lib/harness/subagent-runtime/file-policy.mjs';
import { findStandaloneWorkflow } from '../../rex-harness/src/index.mjs';
import { buildSystemPrompt } from '../lib/harness/subagent-runtime/prompts.mjs';

function job(itemId, prefixes) {
  return {
    jobId: `phase.implement.${itemId}`,
    role: 'implementer',
    label: 'Implementer',
    launchSpec: {
      canEditFiles: true,
      workItemRefs: [itemId],
      ownedPathPrefixes: prefixes,
    },
  };
}

test('parallel work items get isolated rex ledgers and prompts', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-work-rex-iso-'));
  try {
    const plan = { taskTitle: 'Split UI and API work' };
    const ui = bindPhaseJobRexActivation({
      rootDir,
      plan,
      job: job('wi.ui', ['docs-site/']),
      phase: { responsibility: 'Update the landing page copy' },
    });
    const api = bindPhaseJobRexActivation({
      rootDir,
      plan,
      job: job('wi.api', ['mcp-server/src/']),
      phase: { responsibility: 'Change the browser health endpoint' },
    });

    assert.ok(ui);
    assert.ok(api);
    assert.equal(ui.workItemKey, 'work:wi.ui');
    assert.equal(api.workItemKey, 'work:wi.api');
    assert.notEqual(ui.activationId, api.activationId);

    const uiWorkflow = findStandaloneWorkflow({ rootDir, workItemKey: 'work:wi.ui' });
    const apiWorkflow = findStandaloneWorkflow({ rootDir, workItemKey: 'work:wi.api' });
    assert.notEqual(uiWorkflow.workflow.workflowActivationId, apiWorkflow.workflow.workflowActivationId);
    const ledgers = (await readdir(path.join(rootDir, '.rex-harness', 'workflows'))).filter((name) => name.endsWith('.json'));
    assert.equal(ledgers.length, 2);

    const uiPrompt = buildSystemPrompt({
      plan,
      job: job('wi.ui', ['docs-site/']),
      phase: { canEditFiles: true, ownedPathPrefixes: ['docs-site/'] },
      rexBinding: ui,
    });
    assert.match(uiPrompt, /rexWorkItem=work:wi\.ui/u);
    assert.match(uiPrompt, /ownedPathPrefixes=docs-site\//u);
    assert.doesNotMatch(uiPrompt, /work:wi\.api/u);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('editable phase job does not launch without ownedPathPrefixes', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-work-rex-prefix-'));
  let launched = false;
  try {
    const run = await executePhaseJob(
      { taskTitle: 'Missing prefixes' },
      {
        jobId: 'phase.implement.wi.ui',
        role: 'implementer',
        launchSpec: {
          canEditFiles: true,
          workItemRefs: ['wi.ui'],
          ownedPathPrefixes: [],
          executor: 'codex',
          handoffTarget: 'reviewer',
          inputs: [],
        },
      },
      { canEditFiles: true, responsibility: 'Edit UI' },
      [],
      {
        clientId: 'codex-cli',
        timeoutMs: 1000,
        env: process.env,
        io: { log() {}, warn() {}, error() {} },
        agentSpecNormalized: { agents: {} },
        executorLabel: 'codex',
        rootDir,
        runOneShotImpl: async () => {
          launched = true;
          return { exitCode: 0, stdout: '{}', stderr: '' };
        },
      },
    );
    assert.equal(launched, false);
    assert.equal(run.status, 'blocked');
    assert.match(String(run.output?.error || ''), /ownedPathPrefixes/u);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('editable phase job does not launch when rex bind fails', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-work-rex-bind-'));
  let launched = false;
  try {
    const run = await executePhaseJob(
      { taskTitle: 'Broken bind' },
      job('wi.ui', ['docs-site/']),
      { canEditFiles: true, responsibility: 'Edit UI', ownedPathPrefixes: ['docs-site/'] },
      [],
      {
        clientId: 'codex-cli',
        timeoutMs: 1000,
        env: process.env,
        io: { log() {}, warn() {}, error() {} },
        agentSpecNormalized: { agents: {} },
        executorLabel: 'codex',
        rootDir,
        bindRexActivationImpl: () => ({ ok: false, reason: 'rex-bind-failed' }),
        runOneShotImpl: async () => {
          launched = true;
          return { exitCode: 0, stdout: '{}', stderr: '' };
        },
      },
    );
    assert.equal(launched, false);
    assert.equal(run.status, 'blocked');
    assert.match(String(run.output?.error || ''), /rex-bind-failed/u);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('file policy rejects touches outside the work item prefix', () => {
  const phase = { canEditFiles: true, ownedPathPrefixes: ['scripts/'] };
  const inside = evaluatePhaseFilePolicy({ filesTouched: ['scripts/lib/planning/auto-gate.mjs'] }, phase);
  const outside = evaluatePhaseFilePolicy({ filesTouched: ['mcp-server/src/index.ts'] }, phase);
  assert.equal(inside.ok, true);
  assert.equal(outside.ok, false);
  assert.match(outside.violations[0], /not under ownedPathPrefixes/u);
});
