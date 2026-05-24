import { normalizeHandoffPayload } from '../handoff.mjs';

function createFailureHandoff({ role, speaker, message }) {
  return normalizeHandoffPayload({
    status: 'blocked',
    fromRole: role,
    toRole: 'planner',
    taskTitle: 'GroupChat task',
    contextSummary: `Speaker ${speaker} failed: ${message}`,
    findings: [],
    openQuestions: [message || 'Unknown error'],
    recommendations: ['Re-plan needed'],
  });
}

function addResultEntry({ history, speaker, roundNumber, result }) {
  return history.addEntry({
    speaker: speaker.speaker,
    role: speaker.role,
    roundNumber,
    handoff: result.handoff,
    rawOutput: result.rawOutput || '',
    elapsedMs: result.elapsedMs || 0,
    modelRouting: result?.modelRouting || speaker.modelRouting || null,
  });
}

async function executeSpeaker({ speaker, roundNumber, history, spawnFn, io }) {
  try {
    const result = await spawnFn({
      role: speaker.role,
      speaker: speaker.speaker,
      workItem: speaker.workItem || null,
      conversationHistory: history,
    });

    if (result && result.exitCode === 0 && result.handoff) {
      const entry = addResultEntry({ history, speaker, roundNumber, result });
      io?.log?.(`[groupchat] round=${roundNumber} speaker=${speaker.speaker} status=${result.handoff.status} elapsed=${result.elapsedMs}ms`);
      return entry;
    }

    const message = result?.error || `exit=${result?.exitCode}`;
    const entry = addResultEntry({
      history,
      speaker,
      roundNumber,
      result: {
        ...result,
        handoff: createFailureHandoff({ role: speaker.role, speaker: speaker.speaker, message }),
      },
    });
    io?.log?.(`[groupchat] round=${roundNumber} speaker=${speaker.speaker} BLOCKED reason=${message}`);
    return entry;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const entry = history.addEntry({
      speaker: speaker.speaker,
      role: speaker.role,
      roundNumber,
      handoff: createFailureHandoff({ role: speaker.role, speaker: speaker.speaker, message: `Exception: ${message}` }),
      elapsedMs: 0,
      modelRouting: speaker.modelRouting || null,
    });
    io?.log?.(`[groupchat] round=${roundNumber} speaker=${speaker.speaker} EXCEPTION ${message}`);
    return entry;
  }
}

export async function executeRound({
  roundNumber,
  speakers,
  history,
  spawnFn,
  timeoutMs,
  concurrency,
  io,
}) {
  void timeoutMs;
  if (!Array.isArray(speakers) || speakers.length === 0) {
    return [];
  }

  const entries = [];
  const pending = [...speakers];
  const running = new Map();
  const maxConcurrent = Math.max(1, Number.isFinite(concurrency) ? Math.floor(concurrency) : 3);

  while (pending.length > 0 || running.size > 0) {
    while (running.size < maxConcurrent && pending.length > 0) {
      const speaker = pending.shift();
      const promise = executeSpeaker({ speaker, roundNumber, history, spawnFn, io }).then((entry) => {
        running.delete(speaker.speaker);
        entries.push(entry);
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
