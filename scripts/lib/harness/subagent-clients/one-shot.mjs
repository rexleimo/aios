import { getClientRuntimeId } from '../../clients/registry.mjs';

function combineSystemAndPrompt(systemText, promptText) {
  return systemText
    ? `${systemText}\n\n## New User Request\n${promptText}`
    : promptText;
}

function buildCodexStructuredFlags(codexOutput = null) {
  const flags = [];
  if (codexOutput?.schemaPath) {
    flags.push('--output-schema', codexOutput.schemaPath);
  }
  if (codexOutput?.lastMessagePath) {
    flags.push('--output-last-message', codexOutput.lastMessagePath);
  }
  if (codexOutput?.color) {
    flags.push('--color', codexOutput.color);
  }
  return flags;
}

const CLIENT_STRATEGIES = Object.freeze({
  [getClientRuntimeId('claude')]: ({
    systemText,
    promptText,
    routedExtraArgs,
    adapters,
    env,
  }) => {
    const unattendedArgs = adapters.buildClaudeUnattendedArgs(env);
    return {
      runner: 'spawn',
      args: systemText
        ? [...routedExtraArgs, ...unattendedArgs, '--print', '--append-system-prompt', systemText, promptText]
        : [...routedExtraArgs, ...unattendedArgs, '--print', promptText],
    };
  },
  [getClientRuntimeId('gemini')]: ({
    systemText,
    promptText,
    routedExtraArgs,
    adapters,
    env,
  }) => ({
    runner: 'spawn',
    args: [
      ...routedExtraArgs,
      ...adapters.buildGeminiUnattendedArgs(env),
      '-p',
      combineSystemAndPrompt(systemText, promptText),
    ],
  }),
  [getClientRuntimeId('opencode')]: ({ systemText, promptText }) => ({
    runner: 'spawn',
    args: ['run', combineSystemAndPrompt(systemText, promptText)],
  }),
  [getClientRuntimeId('codex')]: ({
    systemText,
    promptText,
    routedExtraArgs,
    adapters,
    env,
    codexOutput,
  }) => {
    const fullPrompt = combineSystemAndPrompt(systemText, promptText);
    const codexConfigArgs = adapters.buildCodexConfigArgs(env);
    const codexUnattendedArgs = adapters.buildCodexUnattendedArgs(env);
    const structuredFlags = buildCodexStructuredFlags(codexOutput);
    return {
      runner: 'codex-exec',
      fullPrompt,
      codexConfigArgs,
      codexUnattendedArgs,
      routedExtraArgs,
      structuredFlags,
      args: ['exec', ...codexUnattendedArgs, ...codexConfigArgs, ...routedExtraArgs, ...structuredFlags, '-'],
    };
  },
});

// 纯函数：把不同客户端的一次性调用差异集中到策略表，runOneShot 只负责执行。
export function buildOneShotInvocation({
  clientId,
  systemText,
  promptText,
  routedExtraArgs = [],
  env = process.env,
  codexOutput = null,
  adapters,
} = {}) {
  const strategy = CLIENT_STRATEGIES[clientId];
  if (!strategy) {
    return null;
  }
  return strategy({
    systemText,
    promptText,
    routedExtraArgs,
    env,
    codexOutput,
    adapters,
  });
}
