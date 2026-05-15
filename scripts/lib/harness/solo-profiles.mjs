import path from 'node:path';

import { commandExists } from '../platform/process.mjs';

const PROVIDER_MAP = Object.freeze({
  codex: {
    provider: 'codex',
    clientId: 'codex-cli',
    command: 'codex',
  },
  claude: {
    provider: 'claude',
    clientId: 'claude-code',
    command: 'claude',
  },
  gemini: {
    provider: 'gemini',
    clientId: 'gemini-cli',
    command: 'gemini',
  },
  opencode: {
    provider: 'opencode',
    clientId: 'opencode-cli',
    command: 'opencode',
  },
  kiro: {
    provider: 'kiro',
    clientId: 'kiro-cli',
    command: 'kiro-cli',
  },
});

const RESERVED_FLAGS = new Set([
  '--session',
  '--resume',
  '--json',
  '--worktree',
  '--objective',
  '-h',
  '--help',
]);

function normalizeText(value, fallback = '') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

export function resolveSoloHarnessProfile({ provider = 'codex' } = {}) {
  const normalized = normalizeText(provider, 'codex').toLowerCase();
  const resolved = PROVIDER_MAP[normalized];
  if (!resolved) {
    throw new Error(`Unknown solo harness provider: ${provider}`);
  }
  return { ...resolved };
}

export function validateSoloHarnessExtraArgs(args = []) {
  const values = Array.isArray(args) ? args : [args];
  for (const value of values) {
    const token = normalizeText(value);
    if (RESERVED_FLAGS.has(token)) {
      throw new Error(`Reserved harness flag is not allowed in provider extra args: ${token}`);
    }
  }
  return values.map((value) => String(value ?? '')).filter(Boolean);
}

export async function checkSoloHarnessProfileReadiness({
  provider = 'codex',
  env = process.env,
  extraArgs = [],
  commandExistsImpl = commandExists,
} = {}) {
  const profile = resolveSoloHarnessProfile({ provider });
  validateSoloHarnessExtraArgs(extraArgs);

  const exists = await Promise.resolve(commandExistsImpl(profile.command, { env }));
  if (!exists) {
    return {
      ok: false,
      profile,
      reason: `${profile.command} command is not available on PATH`,
      nextActions: [
        `Install the ${profile.command} CLI or switch --provider to another installed client.`,
        'Run node scripts/aios.mjs doctor --native --verbose',
      ],
    };
  }

  if (profile.provider === 'kiro' && !String(env?.KIRO_API_KEY || '').trim()) {
    return {
      ok: false,
      profile,
      reason: 'KIRO_API_KEY is required for headless kiro-cli runs',
      nextActions: [
        'Set KIRO_API_KEY for unattended Kiro runs or switch --provider to another installed client.',
        'Run node scripts/aios.mjs doctor --native --verbose',
      ],
    };
  }

  return {
    ok: true,
    profile,
    reason: '',
    nextActions: [],
  };
}

export function buildSoloHarnessCommand({
  rootDir,
  aiosRootDir = '',
  sessionId,
  objective,
  provider = 'codex',
  workspaceRoot = '',
  prompt = '',
  extraArgs = [],
} = {}) {
  const profile = resolveSoloHarnessProfile({ provider });
  const normalizedSessionId = normalizeText(sessionId);
  if (!normalizedSessionId) {
    throw new Error('solo harness command requires sessionId');
  }

  const normalizedObjective = normalizeText(objective, 'Solo harness objective');
  const validatedExtraArgs = validateSoloHarnessExtraArgs(extraArgs);
  const aiosRoot = path.resolve(aiosRootDir || rootDir || process.cwd());
  const effectiveWorkspace = path.resolve(workspaceRoot || rootDir || process.cwd());
  const project = path.basename(effectiveWorkspace);
  const ctxAgentPath = path.join(aiosRoot, 'scripts', 'ctx-agent.mjs');
  const args = [
    ctxAgentPath,
    '--agent',
    profile.clientId,
    '--workspace',
    effectiveWorkspace,
    '--project',
    project,
    '--goal',
    normalizedObjective,
    '--session',
    normalizedSessionId,
    '--prompt',
    String(prompt ?? ''),
    '--status',
    'running',
    '--max-log-chars',
    '12000',
    '--no-continuity-summary',
  ];
  if (validatedExtraArgs.length > 0) {
    args.push('--', ...validatedExtraArgs);
  }

  return {
    profile,
    command: process.execPath,
    args,
    cwd: effectiveWorkspace,
  };
}
