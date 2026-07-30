import assert from 'node:assert/strict';
import test from 'node:test';

import { buildOrchestrationPlan } from '../lib/harness/orchestrator.mjs';
import { buildRolePrompt } from '../lib/harness/groupchat-runtime/prompts.mjs';
import { buildSystemPrompt, buildUserPrompt } from '../lib/harness/subagent-runtime/prompts.mjs';
import { redactExecutionContextText, redactExecutionContextValue } from '../lib/harness/runtime-context-redaction.mjs';

const deliveredText = '[context ref=docs/contract.md representation=full sha256=abc]\nRUNTIME ONLY SECRET CONTRACT';
const executionContext = {
  text: deliveredText,
  redactionTexts: ['RUNTIME ONLY SECRET CONTRACT'],
  receiptRef: 'contextdb:execution-context/demo/receipt.json',
};

function phase() {
  return {
    id: 'implement',
    role: 'implementer',
    label: 'Implementer',
    responsibility: 'Implement the scoped change.',
    ownership: 'Owned source only.',
    canEditFiles: true,
    ownedPathPrefixes: ['src/'],
  };
}

function job() {
  return {
    jobId: 'phase.implement',
    role: 'implementer',
    launchSpec: {
      handoffTarget: 'reviewer',
      workItemRefs: ['wi.1'],
      ownedPathPrefixes: ['src/'],
    },
  };
}

test('runtime delivery is a separate plan channel and cannot become a work item', () => {
  const plan = buildOrchestrationPlan({
    taskTitle: 'Safe task',
    contextSummary: 'safe report context',
    executionContext,
  });
  assert.equal(plan.contextSummary, 'safe report context');
  assert.equal(plan.executionContext.text, deliveredText);
  assert.equal(JSON.stringify(plan.workItems).includes('RUNTIME ONLY SECRET CONTRACT'), false);

  const reportPlan = buildOrchestrationPlan({
    taskTitle: 'Safe task',
    contextSummary: 'safe report context',
  });
  assert.equal(JSON.stringify(reportPlan).includes('RUNTIME ONLY SECRET CONTRACT'), false);
});

test('subagent and groupchat prompt consumers receive runtime delivery while report-facing context stays safe', () => {
  const plan = buildOrchestrationPlan({
    taskTitle: 'Safe task',
    contextSummary: 'safe report context',
    executionContext,
  });
  const subagentSystem = buildSystemPrompt({ agent: null, plan, job: job(), phase: phase() });
  const subagentUser = buildUserPrompt({ plan, job: job(), phase: phase(), dependencyRuns: [] });
  const groupchat = buildRolePrompt({
    role: 'implementer',
    taskTitle: plan.taskTitle,
    contextSummary: plan.contextSummary,
    workItems: plan.workItems,
    executionContext: plan.executionContext,
  });

  assert.equal(subagentSystem.includes('RUNTIME ONLY SECRET CONTRACT'), false);
  assert.match(subagentUser, /RUNTIME ONLY SECRET CONTRACT/);
  assert.match(groupchat, /RUNTIME ONLY SECRET CONTRACT/);
  assert.match(subagentUser, /Do not copy raw delivered source text/);
  assert.match(groupchat, /Do not copy raw delivered source text/);
});

test('runtime delivery redaction removes source text from raw output and handoff payloads', () => {
  const rawOutput = '{"contextSummary":"RUNTIME ONLY SECRET CONTRACT","findings":["RUNTIME ONLY SECRET CONTRACT"]}';
  const redactedText = redactExecutionContextText(rawOutput, executionContext);
  const redactedValue = redactExecutionContextValue({
    contextSummary: 'RUNTIME ONLY SECRET CONTRACT',
    findings: ['RUNTIME ONLY SECRET CONTRACT'],
  }, executionContext);

  assert.equal(redactedText.includes('RUNTIME ONLY SECRET CONTRACT'), false);
  assert.equal(JSON.stringify(redactedValue).includes('RUNTIME ONLY SECRET CONTRACT'), false);
  assert.match(redactedText, /REDACTED_ORCHESTRATOR_CONTEXT/);
});
