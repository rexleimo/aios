import { normalizeOrchestratorAgentSpec } from '../orchestrator-agents.mjs';
import { resolveModelRoutingForRole } from '../../model-router.mjs';
import agentSpec from '../../specs/orchestrator-agents.json' with { type: 'json' };

import { resolveBlueprintRounds } from './blueprint-rounds.mjs';
import { normalizeGroupChatConfig } from './config.mjs';
import { executeRound } from './execution.mjs';
import { ConversationHistory } from './history.mjs';
import { buildConversationPrompt, buildRolePrompt, buildSystemPromptForSpeaker } from './prompts.mjs';
import { selectNextRoundSpeakers } from './speakers.mjs';
import { checkTermination } from './termination.mjs';
import { normalizeText } from './shared.mjs';

function resolveAgentId(role) {
  const normalized = normalizeText(role).toLowerCase();
  const map = {
    planner: 'rex-planner',
    implementer: 'rex-implementer',
    reviewer: 'rex-reviewer',
    'security-reviewer': 'rex-security-reviewer',
  };
  return map[normalized] || '';
}

function buildRoundSpawnFn({ spawnFn, agentSpecNormalized, taskTitle, contextSummary, workItems, rootDir, env }) {
  return async ({ role, speaker, workItem, conversationHistory }) => {
    const agent = agentSpecNormalized.agents[resolveAgentId(role)] || null;
    const modelRouting = resolveModelRoutingForRole({
      role,
      taskDescription: `${taskTitle} ${contextSummary}`,
      env,
    });
    const systemPrompt = buildSystemPromptForSpeaker({
      agent,
      rootDir,
      env,
      rolePinnedMemory: '',
      modelRouting,
    });
    const conversationPrompt = buildConversationPrompt({
      history: conversationHistory,
      currentRole: role,
      currentSpeaker: speaker,
    });
    const rolePrompt = buildRolePrompt({
      role,
      taskTitle,
      contextSummary,
      workItems: workItem ? [workItem] : (Array.isArray(workItems) ? workItems : []),
    });
    const fullPrompt = `${systemPrompt}\n\n${conversationPrompt}\n${rolePrompt}`;
    const userPrompt = `${fullPrompt}\n\nOutput ONLY the JSON handoff object.`;
    const result = await spawnFn({
      role,
      speaker,
      workItem: workItem || null,
      conversationHistory,
      systemPrompt,
      conversationPrompt: fullPrompt,
      userPrompt,
      modelRouting,
    });
    return {
      ...(result && typeof result === 'object' ? result : {}),
      modelRouting: result?.modelRouting || modelRouting,
    };
  };
}

export async function runGroupChat({
  taskTitle = '',
  contextSummary = '',
  workItems = null,
  blueprint = 'feature',
  spawnFn,
  config = {},
  rootDir = '',
  env = process.env,
  io = console,
} = {}) {
  if (typeof spawnFn !== 'function') {
    throw new Error('GroupChat requires a spawnFn');
  }

  const cfg = normalizeGroupChatConfig(config);
  const blueprintRounds = resolveBlueprintRounds(blueprint);
  const history = new ConversationHistory();
  const agentSpecNormalized = normalizeOrchestratorAgentSpec(agentSpec);
  let roundNumber = 1;
  let termination = { terminated: false, status: 'running', reason: '' };

  if (blueprintRounds.length === 0) {
    return {
      ok: false,
      error: `No rounds resolved for blueprint: ${blueprint}`,
      conversationHistory: history.toJSON(),
      totalRounds: 0,
      terminationReason: 'no-rounds',
    };
  }

  io?.log?.(`[groupchat] start blueprint=${blueprint} maxRounds=${cfg.maxRounds} concurrency=${cfg.concurrency} blueprintRounds=${blueprintRounds.length}`);

  while (!termination.terminated) {
    if (roundNumber > cfg.maxRounds) {
      termination = { terminated: true, status: 'blocked', reason: `Reached max rounds (${cfg.maxRounds})` };
      break;
    }

    termination = checkTermination({ history, currentRound: roundNumber, maxRounds: cfg.maxRounds, blueprintRounds });
    if (termination.terminated) break;

    const speakers = selectNextRoundSpeakers({ history, blueprintRounds, roundNumber });
    if (speakers.length === 0) {
      termination = checkTermination({ history, currentRound: roundNumber, maxRounds: cfg.maxRounds, blueprintRounds });
      if (!termination.terminated) {
        termination = { terminated: true, status: 'completed', reason: 'No more speakers; consensus assumed' };
      }
      break;
    }

    io?.log?.(`[groupchat] round=${roundNumber} speakers=${speakers.map((speaker) => speaker.speaker).join(',')}`);
    await executeRound({
      roundNumber,
      speakers,
      history,
      spawnFn: buildRoundSpawnFn({ spawnFn, agentSpecNormalized, taskTitle, contextSummary, workItems, rootDir, env }),
      timeoutMs: cfg.timeoutMs,
      concurrency: cfg.concurrency,
      io,
    });
    roundNumber += 1;
  }

  const ok = termination.status === 'completed';
  io?.log?.(`[groupchat] done ok=${ok} rounds=${roundNumber - 1} entries=${history.length} reason=${termination.reason}`);

  return {
    ok,
    status: termination.status,
    conversationHistory: history.toJSON(),
    totalRounds: roundNumber - 1,
    totalEntries: history.length,
    terminationReason: termination.reason,
    blueprintRounds: blueprintRounds.length,
  };
}
