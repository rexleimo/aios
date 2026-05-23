import { spawnCommandWithInput } from '../../platform/process.mjs';
import {
  SUBAGENT_UPSTREAM_BACKOFF_MS_ENV,
  SUBAGENT_UPSTREAM_MAX_ATTEMPTS_ENV,
} from '../subagent-runtime/constants.mjs';
import { parsePositiveInt } from '../subagent-runtime/text.mjs';
import { normalizeSpawnResult } from './spawn-result.mjs';

function isUnsupportedCodexFlagError(text, flags = []) {
  const normalized = String(text || '').toLowerCase();
  if (!normalized) return false;
  return flags.some((flag) => normalized.includes(`unexpected argument '${flag}'`)
    || normalized.includes(`unexpected argument "${flag}"`)
    || normalized.includes(`unknown option '${flag}'`)
    || normalized.includes(`unknown option ${flag}`));
}

function isCodexSchemaValidationError(text) {
  const normalized = String(text || '').toLowerCase();
  if (!normalized) return false;
  return normalized.includes('invalid_json_schema')
    || normalized.includes('text.format.schema');
}

function isCodexUpstreamError(text) {
  const normalized = String(text || '').toLowerCase();
  if (!normalized) return false;
  return normalized.includes('upstream_error')
    || normalized.includes('server_error');
}

function shouldRetryCodexResult(result, { exitCode, combinedText }) {
  if (!result || result.error || result.timedOut) {
    return false;
  }
  if (exitCode === 0) {
    return false;
  }
  return isCodexUpstreamError(combinedText);
}

function sleepMs(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, Math.max(0, Math.floor(ms)));
  });
}

async function runCodexExecWithRetry(command, args, { env, timeoutMs, cwd, input, io }) {
  const maxAttempts = parsePositiveInt(env?.[SUBAGENT_UPSTREAM_MAX_ATTEMPTS_ENV], 2);
  const baseBackoffMs = parsePositiveInt(env?.[SUBAGENT_UPSTREAM_BACKOFF_MS_ENV], 1200);
  let lastResult = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = await spawnCommandWithInput(command, args, {
      env,
      timeoutMs,
      cwd: cwd || undefined,
      input,
    });
    lastResult = result;

    const exitCode = Number.isFinite(result.status) ? result.status : 1;
    const combinedText = `${result.stdout || ''}\n${result.stderr || ''}`.trim();
    if (!shouldRetryCodexResult(result, { exitCode, combinedText }) || attempt >= maxAttempts) {
      return { ...result, attempts: attempt };
    }

    const delayMs = Math.max(1, Math.floor(baseBackoffMs * Math.pow(2, attempt - 1)));
    io?.log?.(`[subagent-runtime] codex upstream_error retry attempt ${attempt + 1}/${maxAttempts} after ${delayMs}ms`);
    await sleepMs(delayMs);
  }

  return {
    ...(lastResult || { status: 1, stdout: '', stderr: '', error: null, timedOut: false }),
    attempts: maxAttempts,
  };
}

async function runCodexStructuredFallbacks(command, invocation, { env, timeoutMs, cwd, io, codexOutput, routedExtraArgs }) {
  const { fullPrompt, codexConfigArgs, codexUnattendedArgs } = invocation;
  const fallbackArgs = ['exec', ...codexUnattendedArgs, ...codexConfigArgs, ...routedExtraArgs];
  if (codexOutput?.lastMessagePath) {
    fallbackArgs.push('--output-last-message', codexOutput.lastMessagePath);
  }
  if (codexOutput?.color) {
    fallbackArgs.push('--color', codexOutput.color);
  }
  fallbackArgs.push('-');

  const fallback = await runCodexExecWithRetry(command, fallbackArgs, { env, timeoutMs, cwd, input: fullPrompt, io });
  const normalized = normalizeSpawnResult(fallback, timeoutMs);
  if (normalized.error || normalized.exitCode === 0) return normalized;

  const fallbackCombined = `${normalized.stdout}\n${normalized.stderr}`.trim();
  const fallbackFlags = ['--output-last-message', '--color'];
  if (!isUnsupportedCodexFlagError(fallbackCombined, fallbackFlags)) {
    return normalized;
  }

  const plainFallback = await runCodexExecWithRetry(command, ['exec', ...codexUnattendedArgs, ...codexConfigArgs, ...routedExtraArgs, '-'], {
    env,
    timeoutMs,
    cwd,
    input: fullPrompt,
    io,
  });
  return normalizeSpawnResult(plainFallback, timeoutMs);
}

export async function runCodexInvocation(command, invocation, options) {
  const { env, timeoutMs, cwd, io, codexOutput, routedExtraArgs } = options;
  const result = await runCodexExecWithRetry(command, invocation.args, {
    env,
    timeoutMs,
    cwd,
    input: invocation.fullPrompt,
    io,
  });
  const normalized = normalizeSpawnResult(result, timeoutMs);
  if (normalized.error || normalized.exitCode === 0 || invocation.structuredFlags.length === 0) {
    return normalized;
  }

  const combined = `${normalized.stdout}\n${normalized.stderr}`.trim();
  const structuredFlags = ['--output-schema', '--output-last-message', '--color'];
  if (!isUnsupportedCodexFlagError(combined, structuredFlags) && !isCodexSchemaValidationError(combined)) {
    return normalized;
  }

  return runCodexStructuredFallbacks(command, invocation, { env, timeoutMs, cwd, io, codexOutput, routedExtraArgs });
}
