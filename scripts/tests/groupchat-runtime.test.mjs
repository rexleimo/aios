import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  DEFAULT_GROUPCHAT_CONFIG,
  ConversationHistory,
  buildConversationPrompt,
  normalizeGroupChatConfig,
  resolveBlueprintRounds,
  selectNextRoundSpeakers,
  checkTermination,
  buildRolePrompt,
} from '../lib/harness/groupchat-runtime.mjs';

import { normalizeHandoffPayload } from '../lib/harness/handoff.mjs';
import { readMetricsRecords } from '../lib/interception/metrics/metrics-sink.mjs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeHandoff(overrides = {}) {
  return normalizeHandoffPayload({
    status: 'completed',
    fromRole: overrides.fromRole || 'planner',
    toRole: overrides.toRole || 'implementer',
    taskTitle: overrides.taskTitle || 'Test task',
    contextSummary: overrides.contextSummary || 'Test context.',
    findings: overrides.findings || ['Finding A'],
    filesTouched: overrides.filesTouched || [],
    openQuestions: overrides.openQuestions || [],
    recommendations: overrides.recommendations || ['Proceed to implementation.'],
    ...overrides,
  });
}

function stubIo() {
  const logs = [];
  return {
    logs,
    io: {
      log: (msg) => logs.push(String(msg)),
      warn: (msg) => logs.push(`[warn] ${msg}`),
      error: (msg) => logs.push(`[error] ${msg}`),
    },
  };
}

// ---------------------------------------------------------------------------
// ConversationHistory
// ---------------------------------------------------------------------------

test('ConversationHistory starts empty', () => {
  const history = new ConversationHistory();
  assert.equal(history.length, 0);
  assert.deepEqual(history.entries, []);
  assert.equal(history.lastRound, 0);
});

test('ConversationHistory addEntry increments round/turn', () => {
  const history = new ConversationHistory();
  history.addEntry({
    speaker: 'planner',
    role: 'planner',
    roundNumber: 1,
    handoff: makeHandoff({ fromRole: 'planner' }),
  });

  assert.equal(history.length, 1);
  assert.equal(history.lastRound, 1);
  const entry = history.entries[0];
  assert.equal(entry.turnNumber, 1);
  assert.equal(entry.roundNumber, 1);
  assert.equal(entry.speaker, 'planner');
});

test('ConversationHistory getEntriesByRound filters correctly', () => {
  const history = new ConversationHistory();
  history.addEntry({ speaker: 'planner', role: 'planner', roundNumber: 1, handoff: makeHandoff() });
  history.addEntry({ speaker: 'implementer', role: 'implementer', roundNumber: 2, handoff: makeHandoff({ fromRole: 'implementer' }) });
  history.addEntry({ speaker: 'reviewer', role: 'reviewer', roundNumber: 2, handoff: makeHandoff({ fromRole: 'reviewer' }) });

  assert.equal(history.getEntriesByRound(1).length, 1);
  assert.equal(history.getEntriesByRound(2).length, 2);
  assert.equal(history.getEntriesByRound(3).length, 0);
});

test('ConversationHistory lastEntry returns most recent', () => {
  const history = new ConversationHistory();
  history.addEntry({ speaker: 'planner', role: 'planner', roundNumber: 1, handoff: makeHandoff() });
  history.addEntry({ speaker: 'implementer', role: 'implementer', roundNumber: 2, handoff: makeHandoff({ fromRole: 'implementer' }) });

  assert.equal(history.lastEntry.speaker, 'implementer');
});

test('ConversationHistory speakersByRound returns deduped list', () => {
  const history = new ConversationHistory();
  history.addEntry({ speaker: 'implementer-1', role: 'implementer', roundNumber: 2, handoff: makeHandoff() });
  history.addEntry({ speaker: 'implementer-2', role: 'implementer', roundNumber: 2, handoff: makeHandoff() });

  const speakers = history.speakersByRound(2);
  assert.equal(speakers.length, 2);
  assert.ok(speakers.includes('implementer-1'));
  assert.ok(speakers.includes('implementer-2'));
});

// ---------------------------------------------------------------------------
// normalizeGroupChatConfig
// ---------------------------------------------------------------------------

test('normalizeGroupChatConfig fills defaults', () => {
  const cfg = normalizeGroupChatConfig({});
  assert.equal(cfg.maxRounds, 10);
  assert.equal(cfg.concurrency, 3);
  assert.equal(cfg.speakerStrategy, 'blueprint-phases');
  assert.equal(cfg.terminationCheck, 'consensus');
  assert.ok(cfg.timeoutMs > 0);
});

test('normalizeGroupChatConfig respects overrides', () => {
  const cfg = normalizeGroupChatConfig({
    maxRounds: 4,
    concurrency: 2,
    speakerStrategy: 'round-robin',
  });
  assert.equal(cfg.maxRounds, 4);
  assert.equal(cfg.concurrency, 2);
  assert.equal(cfg.speakerStrategy, 'round-robin');
});

test('normalizeGroupChatConfig clamps maxRounds to 1-50', () => {
  assert.equal(normalizeGroupChatConfig({ maxRounds: 0 }).maxRounds, 1);
  assert.equal(normalizeGroupChatConfig({ maxRounds: 100 }).maxRounds, 50);
});

test('normalizeGroupChatConfig clamps concurrency to 1-20', () => {
  assert.equal(normalizeGroupChatConfig({ concurrency: 0 }).concurrency, 1);
  assert.equal(normalizeGroupChatConfig({ concurrency: 100 }).concurrency, 20);
});

// ---------------------------------------------------------------------------
// resolveBlueprintRounds
// ---------------------------------------------------------------------------

test('resolveBlueprintRounds maps feature blueprint to rounds', () => {
  const rounds = resolveBlueprintRounds('feature');
  assert.ok(rounds.length >= 3, `expected >=3 rounds, got ${rounds.length}`);

  const round1 = rounds[0];
  assert.equal(round1.roundNumber, 1);
  assert.deepEqual(round1.roles, ['planner']);
  assert.equal(round1.mode, 'sequential');

  // Feature blueprint: implementer is round 2 (sequential in blueprint → single job)
  // review + security are parallel in round 3 (grouped under "final-checks")
  const implementRound = rounds.find(r => r.roles.includes('implementer'));
  assert.ok(implementRound, 'should have an implementer round');

  const reviewRound = rounds.find(r => r.roles.includes('reviewer'));
  assert.ok(reviewRound, 'should have a reviewer round');
  // security-reviewer should be in same round as reviewer (parallel group)
  assert.ok(reviewRound.roles.includes('security-reviewer') || rounds.some(r => r.roles.includes('security-reviewer')));
});

test('resolveBlueprintRounds maps bugfix blueprint to rounds', () => {
  const rounds = resolveBlueprintRounds('bugfix');
  assert.ok(rounds.length >= 3);
  assert.deepEqual(rounds[0].roles, ['planner']);
});

test('resolveBlueprintRounds maps refactor blueprint to rounds', () => {
  const rounds = resolveBlueprintRounds('refactor');
  assert.ok(rounds.length >= 3);
  assert.deepEqual(rounds[0].roles, ['planner']);
});

test('resolveBlueprintRounds maps security blueprint to rounds', () => {
  const rounds = resolveBlueprintRounds('security');
  assert.ok(rounds.length >= 4);
  // Security blueprint leads with security-reviewer
  assert.deepEqual(rounds[0].roles, ['security-reviewer']);
});

test('resolveBlueprintRounds unknown blueprint falls back to feature', () => {
  const rounds = resolveBlueprintRounds('nonexistent');
  assert.deepEqual(rounds[0].roles, ['planner']);
});

test('resolveBlueprintRounds sequential phases get separate rounds', () => {
  const rounds = resolveBlueprintRounds('feature');
  // plan (seq) → round 1, implement (seq) → round 2, review+security (parallel group) → round 3
  const round1Roles = new Set(rounds.map(r => r.roles.join(',')));
  // planner should be solo
  const plannerRound = rounds.find(r => r.roles.length === 1 && r.roles[0] === 'planner');
  assert.ok(plannerRound, 'planner should have its own round');
  assert.equal(plannerRound.mode, 'sequential');
});

// ---------------------------------------------------------------------------
// selectNextRoundSpeakers
// ---------------------------------------------------------------------------

test('selectNextRoundSpeakers returns first round roles on empty history', () => {
  const history = new ConversationHistory();
  const blueprintRounds = resolveBlueprintRounds('feature');
  const speakers = selectNextRoundSpeakers({ history, blueprintRounds, roundNumber: 1 });
  assert.deepEqual(speakers, [{ role: 'planner', speaker: 'planner' }]);
});

test('selectNextRoundSpeakers advances to next round', () => {
  const history = new ConversationHistory();
  history.addEntry({ speaker: 'planner', role: 'planner', roundNumber: 1, handoff: makeHandoff() });

  const blueprintRounds = resolveBlueprintRounds('feature');
  const speakers = selectNextRoundSpeakers({ history, blueprintRounds, roundNumber: 2 });
  assert.ok(speakers.length >= 1);
  assert.ok(speakers.every(s => s.role !== 'planner'), 'should not repeat planner in round 2');
});

test('selectNextRoundSpeakers includes re-plan round when last handoff is blocked', () => {
  const history = new ConversationHistory();
  history.addEntry({ speaker: 'planner', role: 'planner', roundNumber: 1, handoff: makeHandoff() });
  history.addEntry({
    speaker: 'implementer', role: 'implementer', roundNumber: 2,
    handoff: makeHandoff({ fromRole: 'implementer', status: 'blocked', openQuestions: ['Need clarification'] }),
  });

  const blueprintRounds = resolveBlueprintRounds('feature');
  const speakers = selectNextRoundSpeakers({ history, blueprintRounds, roundNumber: 3 });
  // Should trigger re-plan: planner comes back
  assert.ok(speakers.some(s => s.role === 'planner'), 'should re-plan when blocked');
});

test('selectNextRoundSpeakers returns empty when all phases complete with no blockers', () => {
  const history = new ConversationHistory();
  history.addEntry({ speaker: 'planner', role: 'planner', roundNumber: 1, handoff: makeHandoff() });
  history.addEntry({ speaker: 'implementer', role: 'implementer', roundNumber: 2, handoff: makeHandoff({ fromRole: 'implementer' }) });
  history.addEntry({
    speaker: 'reviewer', role: 'reviewer', roundNumber: 3,
    handoff: makeHandoff({ fromRole: 'reviewer', status: 'completed', recommendations: ['Looks good'] }),
  });
  history.addEntry({
    speaker: 'security-reviewer', role: 'security-reviewer', roundNumber: 3,
    handoff: makeHandoff({ fromRole: 'security-reviewer', status: 'completed' }),
  });

  const blueprintRounds = resolveBlueprintRounds('feature');
  const speakers = selectNextRoundSpeakers({ history, blueprintRounds, roundNumber: 4 });
  assert.deepEqual(speakers, []);
});

// ---------------------------------------------------------------------------
// checkTermination
// ---------------------------------------------------------------------------

test('checkTermination: not terminated mid-conversation', () => {
  const history = new ConversationHistory();
  history.addEntry({ speaker: 'planner', role: 'planner', roundNumber: 1, handoff: makeHandoff() });

  const result = checkTermination({ history, currentRound: 1, maxRounds: 10 });
  assert.equal(result.terminated, false);
});

test('checkTermination: max rounds reached', () => {
  const history = new ConversationHistory();
  history.addEntry({ speaker: 'planner', role: 'planner', roundNumber: 5, handoff: makeHandoff() });

  const result = checkTermination({ history, currentRound: 6, maxRounds: 5 });
  assert.equal(result.terminated, true);
  assert.ok(result.reason.includes('max rounds'));
});

test('checkTermination: consensus — all final-phase agents completed', () => {
  const history = new ConversationHistory();
  history.addEntry({ speaker: 'planner', role: 'planner', roundNumber: 1, handoff: makeHandoff() });
  history.addEntry({ speaker: 'implementer', role: 'implementer', roundNumber: 2, handoff: makeHandoff({ fromRole: 'implementer' }) });
  history.addEntry({ speaker: 'reviewer', role: 'reviewer', roundNumber: 3, handoff: makeHandoff({ fromRole: 'reviewer', status: 'completed' }) });

  const result = checkTermination({
    history,
    currentRound: 3,
    maxRounds: 10,
    blueprintRounds: resolveBlueprintRounds('bugfix'),
  });
  assert.equal(result.terminated, true);
  assert.equal(result.status, 'completed');
});

test('checkTermination: consensus — blocked when reviewer has open questions', () => {
  const history = new ConversationHistory();
  history.addEntry({ speaker: 'planner', role: 'planner', roundNumber: 1, handoff: makeHandoff() });
  history.addEntry({ speaker: 'implementer', role: 'implementer', roundNumber: 2, handoff: makeHandoff({ fromRole: 'implementer' }) });
  history.addEntry({
    speaker: 'reviewer', role: 'reviewer', roundNumber: 3,
    handoff: makeHandoff({ fromRole: 'reviewer', status: 'needs-input', openQuestions: ['Unclear'] }),
  });

  const result = checkTermination({
    history,
    currentRound: 3,
    maxRounds: 10,
    blueprintRounds: resolveBlueprintRounds('bugfix'),
  });
  assert.equal(result.terminated, false);
  assert.equal(result.status, 'blocked');
});

// ---------------------------------------------------------------------------
// buildConversationPrompt
// ---------------------------------------------------------------------------

test('buildConversationPrompt renders full history', () => {
  const history = new ConversationHistory();
  history.addEntry({
    speaker: 'planner', role: 'planner', roundNumber: 1,
    handoff: makeHandoff({
      fromRole: 'planner', toRole: 'implementer',
      contextSummary: 'Scoped the task.',
      findings: ['Need to edit foo.mjs', 'Add tests'],
      recommendations: ['Start with foo.mjs'],
    }),
  });

  const prompt = buildConversationPrompt({ history, currentRole: 'implementer' });
  assert.ok(prompt.includes('## Conversation History'));
  assert.ok(prompt.includes('Round 1'));
  assert.ok(prompt.includes('planner'));
  assert.ok(prompt.includes('Scoped the task'));
  assert.ok(prompt.includes('Need to edit foo.mjs'));
  assert.ok(prompt.includes('## Your Turn'));
  assert.ok(prompt.includes('implementer'));
});

test('buildConversationPrompt handles empty history gracefully', () => {
  const history = new ConversationHistory();
  const prompt = buildConversationPrompt({ history, currentRole: 'planner' });
  assert.ok(prompt.includes('no prior conversation'));
  assert.ok(prompt.includes('You are speaking'));
  assert.ok(prompt.includes('planner'));
});

// ---------------------------------------------------------------------------
// buildRolePrompt
// ---------------------------------------------------------------------------

test('buildRolePrompt includes task title and work items', () => {
  const prompt = buildRolePrompt({
    role: 'planner',
    taskTitle: 'Fix login bug',
    contextSummary: 'Users cannot log in.',
    workItems: [{ itemId: 'wi.1', summary: 'Investigate auth flow' }],
  });
  assert.ok(prompt.includes('Fix login bug'));
  assert.ok(prompt.includes('Users cannot log in'));
  assert.ok(prompt.includes('wi.1'));
  assert.ok(prompt.includes('Investigate auth flow'));
  assert.ok(prompt.includes('Deliverable'));
});

test('buildRolePrompt includes work items when provided', () => {
  const prompt = buildRolePrompt({
    role: 'implementer',
    taskTitle: 'Add feature',
    workItems: [
      { itemId: 'wi.1', summary: 'Create endpoint' },
      { itemId: 'wi.2', summary: 'Add validation' },
    ],
  });
  assert.ok(prompt.includes('wi.1'));
  assert.ok(prompt.includes('wi.2'));
});

// ---------------------------------------------------------------------------
// Round execution (simulation via override)
// ---------------------------------------------------------------------------

test('executeRound invokes spawnFn for each speaker and returns entries', async () => {
  const { executeRound } = await import('../lib/harness/groupchat-runtime.mjs');

  const history = new ConversationHistory();
  let callCount = 0;

  const spawnFn = async ({ role, conversationHistory }) => {
    callCount += 1;
    return {
      exitCode: 0,
      handoff: makeHandoff({ fromRole: role, findings: [`Executed ${role}`] }),
      elapsedMs: 100,
    };
  };

  const speakers = [
    { role: 'reviewer', speaker: 'reviewer' },
    { role: 'security-reviewer', speaker: 'security-reviewer' },
  ];

  const entries = await executeRound({
    roundNumber: 3,
    speakers,
    history,
    spawnFn,
    timeoutMs: 30000,
    concurrency: 2,
    io: stubIo().io,
  });

  assert.equal(callCount, 2);
  assert.equal(entries.length, 2);
  assert.equal(history.length, 2);
  assert.ok(entries.some(e => e.role === 'reviewer'));
  assert.ok(entries.some(e => e.role === 'security-reviewer'));
});

test('executeRound respects concurrency limit', async () => {
  const { executeRound } = await import('../lib/harness/groupchat-runtime.mjs');

  const history = new ConversationHistory();
  const running = new Set();
  const maxConcurrent = { value: 0 };

  const spawnFn = async ({ role }) => {
    running.add(role);
    maxConcurrent.value = Math.max(maxConcurrent.value, running.size);
    // Simulate async work
    await new Promise(resolve => setTimeout(resolve, 20));
    running.delete(role);
    return {
      exitCode: 0,
      handoff: makeHandoff({ fromRole: role }),
      elapsedMs: 20,
    };
  };

  const speakers = [
    { role: 'impl-1', speaker: 'impl-1' },
    { role: 'impl-2', speaker: 'impl-2' },
    { role: 'impl-3', speaker: 'impl-3' },
    { role: 'impl-4', speaker: 'impl-4' },
  ];

  await executeRound({
    roundNumber: 2,
    speakers,
    history,
    spawnFn,
    timeoutMs: 30000,
    concurrency: 2,
    io: stubIo().io,
  });

  assert.ok(maxConcurrent.value <= 2, `max concurrent should be <=2, was ${maxConcurrent.value}`);
  assert.equal(history.length, 4);
});

test('executeRound marks failed spawn as blocked entry', async () => {
  const { executeRound } = await import('../lib/harness/groupchat-runtime.mjs');

  const history = new ConversationHistory();

  const spawnFn = async ({ role }) => {
    if (role === 'bad-agent') {
      return { exitCode: 1, error: 'Command failed', elapsedMs: 50 };
    }
    return {
      exitCode: 0,
      handoff: makeHandoff({ fromRole: role }),
      elapsedMs: 50,
    };
  };

  const speakers = [
    { role: 'bad-agent', speaker: 'bad-agent' },
    { role: 'good-agent', speaker: 'good-agent' },
  ];

  const entries = await executeRound({
    roundNumber: 2,
    speakers,
    history,
    spawnFn,
    timeoutMs: 30000,
    concurrency: 2,
    io: stubIo().io,
  });

  assert.equal(entries.length, 2);
  const bad = entries.find(e => e.speaker === 'bad-agent');
  assert.equal(bad.handoff.status, 'blocked');
  const good = entries.find(e => e.speaker === 'good-agent');
  assert.equal(good.handoff.status, 'completed');
});

// ---------------------------------------------------------------------------
// runGroupChat integration
// ---------------------------------------------------------------------------

test('runGroupChat completes full conversation for feature blueprint (simulated)', async () => {
  const { runGroupChat } = await import('../lib/harness/groupchat-runtime.mjs');

  const spawnFn = async ({ role, conversationHistory }) => {
    // Simulate realistic progression
    if (role === 'planner') {
      return {
        exitCode: 0,
        handoff: makeHandoff({
          fromRole: 'planner', toRole: 'implementer',
          findings: ['Scope: edit scripts/lib/foo.mjs'],
          recommendations: ['Edit foo.mjs to add handler'],
        }),
        elapsedMs: 10,
      };
    }
    if (role === 'implementer') {
      return {
        exitCode: 0,
        handoff: makeHandoff({
          fromRole: 'implementer', toRole: 'reviewer',
          findings: ['Edited foo.mjs, added handler()'],
          filesTouched: ['scripts/lib/foo.mjs'],
          recommendations: ['Review the change'],
        }),
        elapsedMs: 10,
      };
    }
    if (role === 'reviewer') {
      return {
        exitCode: 0,
        handoff: makeHandoff({
          fromRole: 'reviewer', toRole: 'done',
          findings: ['Code looks correct'],
          recommendations: ['Ready to merge'],
        }),
        elapsedMs: 10,
      };
    }
    if (role === 'security-reviewer') {
      return {
        exitCode: 0,
        handoff: makeHandoff({
          fromRole: 'security-reviewer', toRole: 'done',
          findings: ['No security issues'],
          recommendations: [],
        }),
        elapsedMs: 10,
      };
    }
    return { exitCode: 1, error: `Unexpected role: ${role}` };
  };

  const result = await runGroupChat({
    taskTitle: 'Add handler to foo.mjs',
    contextSummary: 'Need a new handler function.',
    blueprint: 'feature',
    spawnFn,
    config: { maxRounds: 5, concurrency: 3 },
    io: stubIo().io,
  });

  assert.equal(result.ok, true);
  assert.ok(result.totalRounds >= 3, `expected >=3 rounds, got ${result.totalRounds}`);
  assert.ok(result.conversationHistory.length >= 3);
  // Verify round progression (toJSON returns flat array)
  const entries = result.conversationHistory;
  const plannerEntry = entries.find(e => e.role === 'planner');
  const implementerEntry = entries.find(e => e.role === 'implementer');
  const reviewerEntry = entries.find(e => e.role === 'reviewer');
  assert.ok(plannerEntry, 'should have planner entry');
  assert.ok(implementerEntry, 'should have implementer entry');
  assert.ok(reviewerEntry, 'should have reviewer entry');
  // Rounds should be in order
  assert.ok(plannerEntry.roundNumber < implementerEntry.roundNumber);
  assert.ok(implementerEntry.roundNumber < reviewerEntry.roundNumber);
});

test('runGroupChat handles re-plan when implementer is blocked', async () => {
  const { runGroupChat } = await import('../lib/harness/groupchat-runtime.mjs');

  let plannerCalls = 0;
  const spawnFn = async ({ role }) => {
    if (role === 'planner') {
      plannerCalls += 1;
      return {
        exitCode: 0,
        handoff: makeHandoff({
          fromRole: 'planner', toRole: 'implementer',
          findings: plannerCalls === 1
            ? ['Scope: edit foo.mjs']
            : ['Revised scope: edit bar.mjs instead'],
          recommendations: [plannerCalls === 1 ? 'Edit foo.mjs' : 'Edit bar.mjs'],
        }),
        elapsedMs: 10,
      };
    }
    if (role === 'implementer') {
      // First attempt is blocked, second succeeds (but re-plan gives new scope)
      const isBlocked = plannerCalls < 2;
      return {
        exitCode: 0,
        handoff: makeHandoff({
          fromRole: 'implementer', toRole: 'reviewer',
          status: isBlocked ? 'blocked' : 'completed',
          findings: isBlocked ? [] : ['Edited bar.mjs'],
          filesTouched: isBlocked ? [] : ['scripts/lib/bar.mjs'],
          openQuestions: isBlocked ? ['foo.mjs not found'] : [],
          recommendations: isBlocked ? ['Need revised plan'] : ['Review the change'],
        }),
        elapsedMs: 10,
      };
    }
    if (role === 'reviewer') {
      return {
        exitCode: 0,
        handoff: makeHandoff({
          fromRole: 'reviewer', toRole: 'done',
          findings: ['Looks good'],
          recommendations: [],
        }),
        elapsedMs: 10,
      };
    }
    return { exitCode: 1, error: `Unexpected role: ${role}` };
  };

  const result = await runGroupChat({
    taskTitle: 'Test re-plan',
    blueprint: 'bugfix',
    spawnFn,
    config: { maxRounds: 6, concurrency: 3 },
    io: stubIo().io,
  });

  assert.equal(result.ok, true);
  // Should have called planner at least twice (initial + re-plan)
  assert.ok(plannerCalls >= 2, `expected >=2 planner calls, got ${plannerCalls}`);
});



test('runGroupChat passes model-router context to each speaker prompt', async () => {
  const { runGroupChat } = await import('../lib/harness/groupchat-runtime.mjs');
  const captured = [];
  const spawnFn = async (args) => {
    captured.push(args);
    return {
      exitCode: 0,
      handoff: makeHandoff({ fromRole: args.role, toRole: args.role === 'planner' ? 'implementer' : 'done' }),
      elapsedMs: 5,
    };
  };

  const result = await runGroupChat({
    taskTitle: 'Route groupchat speakers',
    blueprint: 'bugfix',
    spawnFn,
    config: { maxRounds: 4, concurrency: 2 },
    env: {
      ...process.env,
      AIOS_MODEL_ROUTER: '1',
      AIOS_MODEL_PLANNER: 'gemini-3-pro',
      AIOS_MODEL_IMPLEMENTER: 'gpt-5.5',
    },
    io: stubIo().io,
  });

  assert.equal(result.ok, true);
  assert.equal(captured[0]?.modelRouting?.modelId, 'gemini-3-pro');
  assert.equal(captured[0]?.modelRouting?.clientId, 'gemini-cli');
  assert.match(captured[0]?.systemPrompt || '', /## Model Router/);
  assert.match(captured[0]?.userPrompt || '', /modelId=gemini-3-pro/);
  assert.equal(result.conversationHistory[0]?.modelRouting?.modelId, 'gemini-3-pro');
});

test('runGroupChat stops at maxRounds', async () => {
  const { runGroupChat } = await import('../lib/harness/groupchat-runtime.mjs');

  const spawnFn = async ({ role }) => ({
    exitCode: 0,
    handoff: makeHandoff({
      fromRole: role,
      status: role === 'planner' ? 'completed' : 'blocked',
      openQuestions: role !== 'planner' ? ['stuck'] : [],
    }),
    elapsedMs: 10,
  });

  const result = await runGroupChat({
    taskTitle: 'Infinite loop test',
    blueprint: 'bugfix',
    spawnFn,
    config: { maxRounds: 3, concurrency: 3 },
    io: stubIo().io,
  });

  assert.equal(result.ok, false);
  assert.equal(result.totalRounds, 3);
  assert.ok(result.terminationReason.includes('max rounds'));
});

test('runGroupChat expands implementer into parallel work items from planner findings', async () => {
  const { runGroupChat } = await import('../lib/harness/groupchat-runtime.mjs');

  let implementerCallCount = 0;
  const spawnFn = async ({ role, workItems }) => {
    if (role === 'planner') {
      return {
        exitCode: 0,
        handoff: makeHandoff({
          fromRole: 'planner', toRole: 'implementer',
          findings: ['WI-1: Edit auth.mjs', 'WI-2: Add tests'],
          recommendations: ['Auth change', 'Test coverage'],
        }),
        elapsedMs: 10,
      };
    }
    if (role === 'implementer') {
      implementerCallCount += 1;
      return {
        exitCode: 0,
        handoff: makeHandoff({
          fromRole: 'implementer', toRole: 'reviewer',
          findings: [`Implemented item ${Array.isArray(workItems) ? workItems.length : 0}`],
          filesTouched: ['some/file.mjs'],
        }),
        elapsedMs: 10,
      };
    }
    if (role === 'reviewer') {
      return {
        exitCode: 0,
        handoff: makeHandoff({ fromRole: 'reviewer', toRole: 'done', findings: ['OK'] }),
        elapsedMs: 10,
      };
    }
    return { exitCode: 0, handoff: makeHandoff({ fromRole: role }), elapsedMs: 10 };
  };

  const result = await runGroupChat({
    taskTitle: 'Multi work item',
    blueprint: 'feature',
    spawnFn,
    config: { maxRounds: 5, concurrency: 3 },
    io: stubIo().io,
  });

  assert.equal(result.ok, true);
  // With work item expansion, implementer should be called for each work item
  assert.ok(implementerCallCount >= 1, `expected >=1 implementer calls, got ${implementerCallCount}`);
});



test('runGroupChat compresses large pre-send prompts and post-receive raw output at the AIOS turn boundary', async () => {
  const { runGroupChat } = await import('../lib/harness/groupchat-runtime.mjs');
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-groupchat-turn-'));
  const PRE_SENTINEL = 'GROUPCHAT_PRE_SEND_SENTINEL';
  const POST_SENTINEL = 'GROUPCHAT_POST_RECEIVE_SENTINEL';
  const captured = [];

  try {
    const spawnFn = async (args) => {
      captured.push(args);
      return {
        exitCode: 0,
        handoff: makeHandoff({ fromRole: args.role, toRole: 'done', findings: ['done'] }),
        rawOutput: `${POST_SENTINEL.repeat(120)}\nERROR issue at scripts/lib/harness/groupchat-runtime/run.mjs:25`,
        elapsedMs: 1,
      };
    };

    const result = await runGroupChat({
      taskTitle: 'Compress groupchat turn',
      contextSummary: `${PRE_SENTINEL.repeat(120)}\nscripts/lib/harness/groupchat-runtime/run.mjs:25`,
      blueprint: 'bugfix',
      spawnFn,
      rootDir,
      config: { maxRounds: 1, concurrency: 1, sessionId: 'group-turn' },
      io: stubIo().io,
    });

    assert.equal(result.conversationHistory.length, 1);
    assert.equal(JSON.stringify(captured[0]).includes(PRE_SENTINEL), false);
    assert.equal(result.conversationHistory[0].rawOutput.includes(POST_SENTINEL), false);
    assert.match(result.conversationHistory[0].rawOutput, /aios\.compact_packet/);

    const records = await readMetricsRecords({ workspaceRoot: rootDir, sessionId: 'group-turn' });
    assert.equal(records.some((record) => record.event_kind === 'pre_send' && record.client_id === 'aios-groupchat'), true);
    assert.equal(records.some((record) => record.event_kind === 'post_receive' && record.client_id === 'aios-groupchat'), true);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('runGroupChat records redacted runtime delivery before send without changing the model prompt', async () => {
  const { runGroupChat } = await import('../lib/harness/groupchat-runtime.mjs');
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-groupchat-runtime-context-'));
  const secret = 'GROUPCHAT_RUNTIME_CONTEXT_SECRET';
  const captured = [];

  try {
    const result = await runGroupChat({
      taskTitle: 'Observe runtime delivery',
      contextSummary: 'safe report summary',
      executionContext: {
        text: `[context ref=docs/contract.md]\n${secret}`,
        redactionTexts: [secret],
      },
      blueprint: 'bugfix',
      spawnFn: async (args) => {
        captured.push(args);
        return {
          exitCode: 0,
          handoff: makeHandoff({ fromRole: args.role, toRole: 'done', findings: ['done'] }),
          rawOutput: 'safe output',
          elapsedMs: 1,
        };
      },
      rootDir,
      config: { maxRounds: 1, concurrency: 1, sessionId: 'group-runtime-context' },
      io: stubIo().io,
    });

    assert.equal(result.conversationHistory.length, 1);
    assert.equal(captured.some((args) => String(args.userPrompt).includes(secret)), true);

    const records = await readMetricsRecords({ workspaceRoot: rootDir, sessionId: 'group-runtime-context' });
    assert.equal(records.some((record) => record.event_kind === 'pre_send' && record.client_id === 'aios-groupchat'), true);
    assert.equal(records.some((record) => record.event_kind === 'post_receive' && record.client_id === 'aios-groupchat'), true);
    assert.equal(JSON.stringify(records).includes(secret), false);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// DEFAULT_GROUPCHAT_CONFIG
// ---------------------------------------------------------------------------

test('DEFAULT_GROUPCHAT_CONFIG is valid', () => {
  const cfg = normalizeGroupChatConfig(DEFAULT_GROUPCHAT_CONFIG);
  assert.equal(cfg.maxRounds, 10);
  assert.equal(cfg.concurrency, 3);
});
