import { commandExists } from '../../platform/process.mjs';
import { buildOneShotInvocation } from '../subagent-clients/one-shot.mjs';
import { runClientInvocation } from '../subagent-clients/invocation-runner.mjs';

import { CLIENT_COMMAND } from './constants.mjs';
import {
  buildClaudeUnattendedArgs,
  buildCodexConfigArgs,
  buildCodexUnattendedArgs,
  buildGeminiUnattendedArgs,
  buildGrokUnattendedArgs,
  buildRoutedExtraArgs,
} from './client-args.mjs';
import { normalizeText } from './text.mjs';

const PENDING_SMOKE_SUBAGENT_CLIENTS = new Set([]);

function buildRuntimeInvocation({ clientId, systemPrompt, userPrompt, env, codexOutput, modelRouting }) {
  const systemText = normalizeText(systemPrompt);
  const promptText = normalizeText(userPrompt);
  const routedExtraArgs = buildRoutedExtraArgs(clientId, modelRouting, env);
  const invocation = buildOneShotInvocation({
    clientId,
    systemText,
    promptText,
    routedExtraArgs,
    env,
    codexOutput,
    adapters: {
      buildClaudeUnattendedArgs,
      buildGeminiUnattendedArgs,
      buildCodexConfigArgs,
      buildCodexUnattendedArgs,
      buildGrokUnattendedArgs,
    },
  });
  return { invocation, routedExtraArgs };
}

export async function runOneShot(clientId, {
  systemPrompt,
  userPrompt,
  timeoutMs,
  env,
  io = null,
  cwd = null,
  codexOutput = null,
  modelRouting = null,
}) {
  if (PENDING_SMOKE_SUBAGENT_CLIENTS.has(clientId)) {
    return {
      exitCode: 1,
      stdout: '',
      stderr: '',
      error: `${clientId} is pending-smoke: live subagent execution is blocked until CLI arguments, MCP config, and unattended smoke evidence are verified.`,
    };
  }

  const command = CLIENT_COMMAND[clientId];
  if (!command) {
    return { exitCode: 1, stdout: '', stderr: '', error: `Unsupported subagent client: ${clientId}` };
  }

  if (!commandExists(command, { env })) {
    return { exitCode: 127, stdout: '', stderr: '', error: `Command not found: ${command}` };
  }

  const { invocation, routedExtraArgs } = buildRuntimeInvocation({
    clientId,
    systemPrompt,
    userPrompt,
    env,
    codexOutput,
    modelRouting,
  });
  if (!invocation) {
    return { exitCode: 1, stdout: '', stderr: '', error: `Unsupported subagent client: ${clientId}` };
  }

  return runClientInvocation(command, invocation, { env, timeoutMs, cwd, io, codexOutput, routedExtraArgs });
}
