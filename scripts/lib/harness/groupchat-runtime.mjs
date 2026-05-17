import { getOrchestratorBlueprint, ORCHESTRATOR_BLUEPRINT_NAMES } from './orchestrator.mjs';
import { normalizeOrchestratorAgentSpec } from './orchestrator-agents.mjs';
import { normalizeHandoffPayload, validateHandoffPayload } from './handoff.mjs';
import { buildPersonaOverlay } from '../memo/persona.mjs';
import { buildModelRouterPromptSection, normalizeModelRouting, resolveModelRoutingForRole } from '../model-router.mjs';
import agentSpec from '../specs/orchestrator-agents.json' with { type: 'json' };

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export const DEFAULT_GROUPCHAT_CONFIG = Object.freeze({
  maxRounds: 10,
  concurrency: 3,
  speakerStrategy: 'blueprint-phases',
  terminationCheck: 'consensus',
  timeoutMs: 10 * 60 * 1000,
});

const BLOCKED_STATUSES = new Set(['blocked', 'needs-input']);
const RE_PLAN_ROLES = new Set(['planner']);

function normalizeText(value) {
  return String(value ?? '').trim();
}

// ---------------------------------------------------------------------------
// ConversationHistory
// ---------------------------------------------------------------------------

export class ConversationHistory {
  constructor() {
    this.entries = [];
  }

  get length() {
    return this.entries.length;
  }

  get lastRound() {
    if (this.entries.length === 0) return 0;
    return Math.max(...this.entries.map(e => e.roundNumber));
  }

  get lastEntry() {
    return this.entries.length > 0 ? this.entries[this.entries.length - 1] : null;
  }

  addEntry({ speaker, role, roundNumber, handoff, rawOutput = '', elapsedMs = 0, modelRouting = null }) {
    const entry = {
      turnNumber: this.entries.length + 1,
      roundNumber: Number.isFinite(roundNumber) ? Math.max(1, Math.floor(roundNumber)) : 1,
      speaker: normalizeText(speaker),
      role: normalizeText(role) || normalizeText(speaker),
      handoff: handoff && typeof handoff === 'object' ? normalizeHandoffPayload(handoff) : normalizeHandoffPayload({}),
      rawOutput: normalizeText(rawOutput),
      elapsedMs: Number.isFinite(elapsedMs) ? Math.floor(elapsedMs) : 0,
      ...(normalizeModelRouting(modelRouting) ? { modelRouting: normalizeModelRouting(modelRouting) } : {}),
      timestamp: new Date().toISOString(),
    };
    this.entries.push(entry);
    return entry;
  }

  getEntriesByRound(roundNumber) {
    return this.entries.filter(e => e.roundNumber === roundNumber);
  }

  speakersByRound(roundNumber) {
    return [...new Set(this.getEntriesByRound(roundNumber).map(e => e.speaker))];
  }

  lastEntriesByRole(role) {
    const normalized = normalizeText(role).toLowerCase();
    return this.entries.filter(e => e.role.toLowerCase() === normalized);
  }

  toJSON() {
    return this.entries.map(e => ({ ...e }));
  }
}

// ---------------------------------------------------------------------------
// Config normalization
// ---------------------------------------------------------------------------

export function normalizeGroupChatConfig(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    maxRounds: Math.max(1, Math.min(50, Number.isFinite(source.maxRounds) ? Math.floor(source.maxRounds) : 10)),
    concurrency: Math.max(1, Math.min(20, Number.isFinite(source.concurrency) ? Math.floor(source.concurrency) : 3)),
    speakerStrategy: ['blueprint-phases', 'round-robin', 'handoff-target'].includes(source.speakerStrategy)
      ? source.speakerStrategy
      : 'blueprint-phases',
    terminationCheck: ['consensus', 'max-rounds', 'reviewer-ok'].includes(source.terminationCheck)
      ? source.terminationCheck
      : 'consensus',
    timeoutMs: Number.isFinite(source.timeoutMs) && source.timeoutMs > 0
      ? Math.floor(source.timeoutMs)
      : 10 * 60 * 1000,
  };
}

// ---------------------------------------------------------------------------
// Blueprint → rounds mapping
// ---------------------------------------------------------------------------

export function resolveBlueprintRounds(blueprintName = 'feature') {
  const name = ORCHESTRATOR_BLUEPRINT_NAMES.includes(blueprintName) ? blueprintName : 'feature';
  const blueprint = getOrchestratorBlueprint(name);

  const rounds = [];
  let currentRound = 0;
  let openParallelGroup = null;

  const flushParallelGroup = () => {
    if (!openParallelGroup) return;
    currentRound += 1;
    rounds.push({
      roundNumber: currentRound,
      roles: [...openParallelGroup.roles],
      mode: 'parallel',
      group: openParallelGroup.group,
    });
    openParallelGroup = null;
  };

  for (const phase of blueprint.phases) {
    if (phase.mode === 'parallel' && phase.group) {
      if (!openParallelGroup || openParallelGroup.group !== phase.group) {
        flushParallelGroup();
        openParallelGroup = { roles: [], group: phase.group };
      }
      openParallelGroup.roles.push(phase.role);
      continue;
    }

    flushParallelGroup();
    currentRound += 1;
    rounds.push({
      roundNumber: currentRound,
      roles: [phase.role],
      mode: phase.mode,
    });
  }

  flushParallelGroup();

  return rounds;
}

// ---------------------------------------------------------------------------
// Speaker selection
// ---------------------------------------------------------------------------

function shouldReplan(history, blueprintRounds) {
  if (history.length === 0) return false;

  const lastRound = history.lastRound;
  const lastRoundEntries = history.getEntriesByRound(lastRound);

  // If the last "real" round had blocked entries and hasn't already been
  // addressed by a re-plan round, trigger re-plan.
  const blockedEntries = lastRoundEntries.filter(e => BLOCKED_STATUSES.has(e.handoff.status));
  if (blockedEntries.length === 0) return false;

  // Don't re-plan if we just had a re-plan round
  const lastSpeakers = new Set(lastRoundEntries.map(e => e.role));
  if (lastSpeakers.size === 1 && RE_PLAN_ROLES.has([...lastSpeakers][0])) return false;

  // Check if we've already exhausted blueprint rounds
  const completeRounds = blueprintRounds.length;
  if (lastRound >= completeRounds) return true;

  return true;
}

function extractWorkItemsFromHistory(history) {
  // Extract work items from the most recent planner handoff
  const plannerEntries = history.lastEntriesByRole('planner');
  if (plannerEntries.length === 0) return [];

  const lastPlanner = plannerEntries[plannerEntries.length - 1];
  const findings = lastPlanner.handoff.findings || [];
  const recommendations = lastPlanner.handoff.recommendations || [];

  const items = [];
  const combined = [...findings, ...recommendations];
  for (const item of combined) {
    const text = normalizeText(item);
    if (!text) continue;
    // Heuristic: if the finding looks like a work item (starts with WI- or contains a file path)
    const id = `wi.${items.length + 1}`;
    items.push({
      itemId: id,
      summary: text,
      type: /test|testing|qa|verify/i.test(text) ? 'testing' : 'general',
      source: 'planner-findings',
      status: 'queued',
      dependsOn: [],
      ownedPathHints: [],
    });
  }

  return items;
}

export function selectNextRoundSpeakers({ history, blueprintRounds, roundNumber }) {
  const maxBlueprintRounds = blueprintRounds.length;

  // First round: always the first blueprint round
  if (history.length === 0) {
    const first = blueprintRounds[0];
    if (!first) return [];
    return first.roles.map(role => ({ role, speaker: role }));
  }

  // Check if we need to re-plan
  if (shouldReplan(history, blueprintRounds)) {
    return [{ role: 'planner', speaker: 'planner-replan' }];
  }

  // If we've passed all blueprint rounds, check termination
  if (roundNumber > maxBlueprintRounds) {
    // Check if last round had blocked entries — if so, re-plan
    const lastRound = history.lastRound;
    const lastEntries = history.getEntriesByRound(lastRound);
    const hasBlocked = lastEntries.some(e => BLOCKED_STATUSES.has(e.handoff.status));
    if (hasBlocked) {
      return [{ role: 'planner', speaker: 'planner-replan' }];
    }
    return [];
  }

  // Normal progression: next blueprint round
  const roundIndex = roundNumber - 1;
  const blueprintRound = blueprintRounds[roundIndex];
  if (!blueprintRound) return [];

  const speakers = blueprintRound.roles.map(role => ({ role, speaker: role }));

  // Expand implementer into parallel work items if planner produced multiple items
  if (blueprintRound.roles.length === 1 && blueprintRound.roles[0] === 'implementer') {
    const workItems = extractWorkItemsFromHistory(history);
    if (workItems.length > 1) {
      return workItems.map((item, idx) => ({
        role: 'implementer',
        speaker: `implementer-wi-${idx + 1}`,
        workItem: item,
      }));
    }
  }

  return speakers;
}

// ---------------------------------------------------------------------------
// Termination check
// ---------------------------------------------------------------------------

export function checkTermination({ history, currentRound, maxRounds, blueprintRounds }) {
  if (currentRound > maxRounds) {
    return {
      terminated: true,
      status: 'blocked',
      reason: `Reached max rounds (${maxRounds})`,
    };
  }

  const lastRound = history.lastRound;
  if (lastRound <= 0) {
    return { terminated: false, status: 'running', reason: '' };
  }

  const lastEntries = history.getEntriesByRound(lastRound);
  if (lastEntries.length === 0) {
    return { terminated: false, status: 'running', reason: '' };
  }

  const allCompleted = lastEntries.every(e => e.handoff.status === 'completed');
  const hasBlocked = lastEntries.some(e => BLOCKED_STATUSES.has(e.handoff.status));

  // No blueprint rounds → only check if all recent entries are complete with no blockers
  const maxBlueprintRounds = Array.isArray(blueprintRounds) ? blueprintRounds.length : 0;
  if (maxBlueprintRounds === 0) {
    if (allCompleted && !hasBlocked) {
      return { terminated: false, status: 'running', reason: '' };
    }
    return { terminated: false, status: 'running', reason: '' };
  }

  // All phases complete past the last blueprint round
  if (allCompleted && lastRound >= maxBlueprintRounds) {
    return { terminated: true, status: 'completed', reason: 'All phases completed' };
  }

  // Blocked past the last round needs re-plan, not termination
  if (hasBlocked && lastRound >= maxBlueprintRounds) {
    return { terminated: false, status: 'blocked', reason: 'Blocked entries need re-plan' };
  }

  return { terminated: false, status: 'running', reason: '' };
}

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

export function buildRolePrompt({ role, taskTitle, contextSummary, workItems }) {
  const lines = [];
  lines.push(`# Task`);
  lines.push(`taskTitle: ${normalizeText(taskTitle) || 'Untitled'}`);
  if (contextSummary) {
    lines.push(`contextSummary: ${normalizeText(contextSummary)}`);
  }
  lines.push('');

  if (Array.isArray(workItems) && workItems.length > 0) {
    lines.push('## Assigned Work Items');
    for (const item of workItems) {
      lines.push(`- [${normalizeText(item.type) || 'general'}] ${normalizeText(item.itemId)}: ${normalizeText(item.summary)}`);
    }
    lines.push('');
  }

  lines.push('## Deliverable');
  lines.push('- Summarize concrete findings.');
  lines.push('- If you touched files, list them in `filesTouched` (relative paths).');
  lines.push('- If blocked or need input, set `status` to `blocked` or `needs-input` and explain in `openQuestions`.');
  lines.push('- Otherwise set `status` to `completed`.');
  lines.push('- If upstream context does not clearly require code changes, return a no-op handoff.');
  lines.push('- Output ONLY the JSON object.');
  lines.push('');

  return lines.join('\n');
}

export function buildConversationPrompt({ history, currentRole, currentSpeaker }) {
  const lines = [];

  if (history.length === 0) {
    lines.push('## Conversation History');
    lines.push('(no prior conversation — you are the first speaker)');
    lines.push('');
  } else {
    lines.push('## Conversation History');

    let lastRound = 0;
    for (const entry of history.entries) {
      if (entry.roundNumber !== lastRound) {
        lastRound = entry.roundNumber;
        lines.push('');
        lines.push(`### Round ${entry.roundNumber}`);
      }

      const handoff = entry.handoff;
      lines.push(`#### ${entry.speaker} (${entry.role})`);
      lines.push(`- Status: ${handoff.status}`);
      lines.push(`- Summary: ${normalizeText(handoff.contextSummary) || '(none)'}`);
      if (handoff.findings.length > 0) {
        lines.push(`- Findings: ${handoff.findings.map(f => normalizeText(f)).join('; ')}`);
      }
      if (handoff.filesTouched.length > 0) {
        lines.push(`- Files: ${handoff.filesTouched.join(', ')}`);
      }
      if (handoff.openQuestions.length > 0) {
        lines.push(`- Questions: ${handoff.openQuestions.map(q => normalizeText(q)).join('; ')}`);
      }
      if (handoff.recommendations.length > 0) {
        lines.push(`- Recommendations: ${handoff.recommendations.map(r => normalizeText(r)).join('; ')}`);
      }
    }
    lines.push('');
  }

  lines.push('## Your Turn');
  const speakerLabel = currentSpeaker || currentRole;
  lines.push(`You are speaking as **${speakerLabel}** (role: ${currentRole}).`);
  lines.push('Read the conversation history above. Based on what has been discussed and decided, perform your role.');
  lines.push('');

  return lines.join('\n');
}

function buildSystemPromptForSpeaker({ agent, rootDir, env, rolePinnedMemory, modelRouting = null }) {
  const lines = [];
  if (agent?.systemPrompt) {
    lines.push(agent.systemPrompt);
  } else {
    lines.push('You are a role-based subagent for AIOS orchestrations (GroupChat mode).');
  }

  if (rootDir) {
    try {
      const personaOverlay = buildPersonaOverlay('persona', { workspaceRoot: rootDir, env });
      if (personaOverlay) { lines.push(''); lines.push(personaOverlay.trim()); }
    } catch { /* skip */ }
    try {
      const userOverlay = buildPersonaOverlay('user', { workspaceRoot: rootDir, env });
      if (userOverlay) { lines.push(''); lines.push(userOverlay.trim()); }
    } catch { /* skip */ }
  }

  if (rolePinnedMemory) {
    lines.push('');
    lines.push('## Role Memory (Pinned)');
    lines.push('Key findings from prior invocations:');
    lines.push('');
    lines.push(rolePinnedMemory.trim());
  }

  const modelRouterSection = buildModelRouterPromptSection(modelRouting);
  if (modelRouterSection) {
    lines.push('');
    lines.push(modelRouterSection);
    lines.push('Use the routed model/protocol for this GroupChat speaker.');
  }

  lines.push('');
  lines.push('Output Contract');
  lines.push('Output a single JSON object (no surrounding text) that conforms to `scripts/lib/specs/agent-handoff.schema.json`.');
  lines.push('');
  lines.push('Required fields: schemaVersion, status, fromRole, toRole, taskTitle, contextSummary, findings, filesTouched, openQuestions, recommendations.');
  lines.push('Set schemaVersion=1. Always include array fields (empty arrays are OK).');
  lines.push('');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Round execution
// ---------------------------------------------------------------------------

export async function executeRound({
  roundNumber,
  speakers,
  history,
  spawnFn,
  timeoutMs,
  concurrency,
  io,
}) {
  if (!Array.isArray(speakers) || speakers.length === 0) {
    return [];
  }

  const entries = [];
  const pending = [...speakers];
  const running = new Map();
  const maxConcurrent = Math.max(1, Number.isFinite(concurrency) ? Math.floor(concurrency) : 3);

  const executeOne = async (speaker) => {
    try {
      const result = await spawnFn({
        role: speaker.role,
        speaker: speaker.speaker,
        workItem: speaker.workItem || null,
        conversationHistory: history,
      });

      if (result && result.exitCode === 0 && result.handoff) {
        const entry = history.addEntry({
          speaker: speaker.speaker,
          role: speaker.role,
          roundNumber,
          handoff: result.handoff,
          rawOutput: result.rawOutput || '',
          elapsedMs: result.elapsedMs || 0,
          modelRouting: result?.modelRouting || speaker.modelRouting || null,
        });
        entries.push(entry);
        io?.log?.(`[groupchat] round=${roundNumber} speaker=${speaker.speaker} status=${result.handoff.status} elapsed=${result.elapsedMs}ms`);
        return entry;
      }

      // Blocked on failure
      const blockedHandoff = normalizeHandoffPayload({
        status: 'blocked',
        fromRole: speaker.role,
        toRole: 'planner',
        taskTitle: 'GroupChat task',
        contextSummary: `Speaker ${speaker.speaker} failed: ${result?.error || `exit=${result?.exitCode}`}`,
        findings: [],
        openQuestions: [result?.error || 'Unknown error'],
        recommendations: ['Re-plan needed'],
      });

      const entry = history.addEntry({
        speaker: speaker.speaker,
        role: speaker.role,
        roundNumber,
        handoff: blockedHandoff,
        rawOutput: result?.rawOutput || '',
        elapsedMs: result?.elapsedMs || 0,
        modelRouting: result?.modelRouting || speaker.modelRouting || null,
      });
      entries.push(entry);
      io?.log?.(`[groupchat] round=${roundNumber} speaker=${speaker.speaker} BLOCKED reason=${result?.error || `exit=${result?.exitCode}`}`);
      return entry;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const blockedHandoff = normalizeHandoffPayload({
        status: 'blocked',
        fromRole: speaker.role,
        toRole: 'planner',
        taskTitle: 'GroupChat task',
        contextSummary: `Exception: ${message}`,
        findings: [],
        openQuestions: [message],
        recommendations: ['Re-plan needed'],
      });

      const entry = history.addEntry({
        speaker: speaker.speaker,
        role: speaker.role,
        roundNumber,
        handoff: blockedHandoff,
        elapsedMs: 0,
        modelRouting: speaker.modelRouting || null,
      });
      entries.push(entry);
      io?.log?.(`[groupchat] round=${roundNumber} speaker=${speaker.speaker} EXCEPTION ${message}`);
      return entry;
    }
  };

  // Process with concurrency limit
  while (pending.length > 0 || running.size > 0) {
    while (running.size < maxConcurrent && pending.length > 0) {
      const speaker = pending.shift();
      const promise = executeOne(speaker).then(entry => {
        running.delete(speaker.speaker);
        return entry;
      });
      running.set(speaker.speaker, promise);
    }

    if (running.size > 0) {
      await Promise.race(running.values());
    }
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Main GroupChat loop
// ---------------------------------------------------------------------------

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
    // Check termination before selecting speakers (catches maxRounds)
    if (roundNumber > cfg.maxRounds) {
      termination = { terminated: true, status: 'blocked', reason: `Reached max rounds (${cfg.maxRounds})` };
      break;
    } else {
      termination = checkTermination({ history, currentRound: roundNumber, maxRounds: cfg.maxRounds, blueprintRounds });
      if (termination.terminated) break;
    }

    // Select speakers for this round
    const speakers = selectNextRoundSpeakers({
      history,
      blueprintRounds,
      roundNumber,
    });

    if (speakers.length === 0) {
      // No more speakers — check if everything is done
      termination = checkTermination({ history, currentRound: roundNumber, maxRounds: cfg.maxRounds, blueprintRounds });
      if (!termination.terminated) {
        termination = { terminated: true, status: 'completed', reason: 'No more speakers; consensus assumed' };
      }
      break;
    }

    io?.log?.(`[groupchat] round=${roundNumber} speakers=${speakers.map(s => s.speaker).join(',')}`);

    // Build spawn wrapper that creates proper prompts
    const wrappedSpawn = async ({ role, speaker, workItem, conversationHistory }) => {
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

      // Call the actual spawn function with full prompt context
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

    await executeRound({
      roundNumber,
      speakers,
      history,
      spawnFn: wrappedSpawn,
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

function resolveAgentId(role) {
  const normalized = normalizeText(role).toLowerCase();
  const map = {
    'planner': 'rex-planner',
    'implementer': 'rex-implementer',
    'reviewer': 'rex-reviewer',
    'security-reviewer': 'rex-security-reviewer',
  };
  return map[normalized] || '';
}
