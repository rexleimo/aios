import { captureCommand } from '../platform/process.mjs';
import {
  buildRuntimeClientProviderMap,
  getClientCommandName,
  resolveClientRuntimeIds,
} from '../clients/registry.mjs';
import { validateTeacherResponse } from './schema.mjs';

const RUNTIME_CLIENT_PROVIDER_MAP = buildRuntimeClientProviderMap('all');
const BACKEND_COMMANDS = Object.freeze({
  ...Object.fromEntries(resolveClientRuntimeIds('all').map((clientId) => [
    clientId,
    getClientCommandName(RUNTIME_CLIENT_PROVIDER_MAP[clientId]),
  ])),
  opencode: getClientCommandName('opencode'),
});

function makeFailureDefaults({ backend, callStatus }) {
  return validateTeacherResponse({
    backend_used: backend,
    call_status: callStatus,
    latency_ms: 0,
    critique: null,
    reference_solution: null,
    shaping_score: 0,
    confidence: 0,
  });
}

function parseRawTeacherPayload(raw) {
  if (typeof raw === 'string') {
    return JSON.parse(raw);
  }
  if (raw && typeof raw === 'object') {
    return raw;
  }
  throw new Error('Teacher response must be a JSON object or JSON string');
}

export function buildTeacherPrompt(trace) {
  const summary = Array.isArray(trace)
    ? trace.map((entry, index) => ({ index: index + 1, entry })).slice(-16)
    : [];

  return [
    'You are evaluating one RL agent episode.',
    'Return JSON with critique, reference_solution, shaping_score, confidence.',
    JSON.stringify({ trace: summary }, null, 2),
  ].join('\n\n');
}

export function normalizeTeacherResponse(raw, { backend, callStatus }) {
  try {
    const parsed = parseRawTeacherPayload(raw);
    return validateTeacherResponse({
      backend_used: backend,
      call_status: callStatus,
      latency_ms: Number(parsed.latency_ms || 0),
      critique: parsed.critique ?? null,
      reference_solution: parsed.reference_solution ?? null,
      shaping_score: Number(parsed.shaping_score ?? 0),
      confidence: Number(parsed.confidence ?? 0),
    });
  } catch {
    return makeFailureDefaults({ backend, callStatus: 'invalid_response' });
  }
}

export async function defaultTeacherTransport({ backend, prompt, cwd = process.cwd() }) {
  const command = BACKEND_COMMANDS[backend];
  if (!command) {
    throw new Error(`Unsupported teacher backend: ${backend}`);
  }

  const result = captureCommand(command, ['exec', prompt], {
    cwd,
    env: {
      ...process.env,
    },
  });

  if (result.status !== 0) {
    throw new Error(result.stderr || `Teacher backend failed: ${backend}`);
  }

  return result.stdout;
}

export async function callTeacher({ primary, fallbacks = [], trace, transport = defaultTeacherTransport, cwd = process.cwd() }) {
  const prompt = buildTeacherPrompt(trace);
  const queue = [primary, ...fallbacks].filter(Boolean);
  let lastInvalidBackend = null;

  for (let index = 0; index < queue.length; index += 1) {
    const backend = queue[index];
    const startedAt = Date.now();
    try {
      const raw = await transport({ backend, prompt, cwd });
      const normalized = normalizeTeacherResponse(raw, {
        backend,
        callStatus: index === 0 ? 'complete' : 'fallback_complete',
      });

      if (normalized.call_status === 'invalid_response') {
        lastInvalidBackend = backend;
        continue;
      }

      return {
        ...normalized,
        latency_ms: Date.now() - startedAt,
      };
    } catch {
      // Try the next backend.
    }
  }

  if (lastInvalidBackend) {
    return makeFailureDefaults({ backend: lastInvalidBackend, callStatus: 'invalid_response' });
  }

  return makeFailureDefaults({ backend: primary, callStatus: 'failed_all_backends' });
}
