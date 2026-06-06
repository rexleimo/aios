/* 中文注释：Subagent turn 压缩集中在这里，避免 phase-job 同时承担 prompt/result 网关细节。 */
import { compressPostReceiveTurn, compressPreSendTurn } from '../../interception/index.mjs';
import { normalizeText } from './text.mjs';

export async function prepareSubagentTurnPrompts({
  rootDir,
  job,
  executionClientId,
  systemPrompt,
  userPrompt,
}) {
  const sessionId = resolveTurnSessionId(job);
  const packet = await compressPreSendTurn({
    workspaceRoot: rootDir || process.cwd(),
    cwd: rootDir || process.cwd(),
    sessionId,
    clientId: executionClientId,
    hostLevel: 'L2',
    prompt: `${systemPrompt}\n\n${userPrompt}`,
    mode: 'tight',
    metrics: { enabled: true },
  });
  if (!packet?.refs?.length) {
    return { sessionId, systemPrompt, userPrompt };
  }
  const compact = JSON.stringify(packet, null, 2);
  return { sessionId, systemPrompt: compact, userPrompt: compact };
}

export async function compactSubagentTurnOutput({
  rootDir,
  sessionId,
  executionClientId,
  outputText,
  rawCommandOutput,
}) {
  const packet = await compressPostReceiveTurn({
    workspaceRoot: rootDir || process.cwd(),
    cwd: rootDir || process.cwd(),
    sessionId,
    clientId: executionClientId,
    hostLevel: 'L2',
    output: outputText || rawCommandOutput,
    mode: 'tight',
    metrics: { enabled: true },
  });
  if (!packet?.refs?.length) {
    return { outputText, rawCommandOutput };
  }
  const compact = JSON.stringify(packet, null, 2);
  return { outputText: compact, rawCommandOutput: compact };
}

function resolveTurnSessionId(job) {
  return normalizeText(job?.jobId) || 'subagent-turn';
}
